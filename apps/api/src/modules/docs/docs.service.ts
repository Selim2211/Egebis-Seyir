import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  checkDocMove,
  compareRank,
  type CreateDocRequest,
  DOC_MAX_DEPTH,
  DOC_MAX_VERSIONS,
  docDepth,
  type DocDetail,
  type DocNodeDto,
  type DocsResponse,
  type DocVersionDetail,
  type DocVersionsResponse,
  ERROR_CODES,
  type ErrorCode,
  isRichTextEmpty,
  type MoveDocRequest,
  rankBetween,
  rankForPlacement,
  richTextToPlain,
  startsNewVersion,
  type UpdateDocRequest,
  type UpdateDocResponse,
  type RichTextDoc,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma, type Doc } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { archivedParent, notFound } from '../spaces/space-errors';
import { asJson, fail, type TenantTx } from '../work-items/item-support';
import { toAttachmentDto } from '../collab/attachments.service';
import { DocLinksService } from './doc-links.service';

const conflict = (code: ErrorCode) => new HttpException({ code }, HttpStatus.CONFLICT);

const toNode = (doc: Doc): DocNodeDto => ({
  id: doc.id,
  parentId: doc.parentId,
  title: doc.title,
  rank: doc.rank,
  updatedAt: doc.updatedAt.toISOString(),
  deleted: doc.deletedAt !== null,
});

/** Ağaç sırası: her üst sayfanın altı rank sırasıyla, üst sayfadan hemen sonra gelir. */
function inTreeOrder(docs: Doc[]): Doc[] {
  const byParent = new Map<string | null, Doc[]>();
  for (const doc of docs) {
    const key = docs.some((d) => d.id === doc.parentId) ? doc.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), doc]);
  }
  const out: Doc[] = [];
  const visit = (parentId: string | null) => {
    for (const doc of (byParent.get(parentId) ?? []).sort(compareRank)) {
      out.push(doc);
      visit(doc.id);
    }
  };
  visit(null);
  return out;
}

/** İçeriği saklanacak biçime çevirir: boş belge null, düz metin aramaya hazır. */
function normalize(content: unknown): { content: RichTextDoc | null; plainText: string } {
  if (content == null) return { content: null, plainText: '' };
  const doc = content as RichTextDoc;
  if (isRichTextEmpty(doc)) return { content: null, plainText: '' };
  return { content: doc, plainText: richTextToPlain(doc) };
}

/** Doküman sayfaları: ağaç, içerik, sürümler ve çöp kutusu (Faz 3.2, ADR-069). */
@Injectable()
export class DocsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
    private readonly links: DocLinksService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  /** Space var mı, değişiklik yapılabilir mi (arşivli Space salt-okunur). */
  private async assertSpace(spaceId: string, write: boolean): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { archivedAt: true },
    });
    if (!space) throw notFound();
    if (write && space.archivedAt) throw archivedParent();
  }

  private async load(docId: string): Promise<Doc> {
    const doc = await this.tenant.db.doc.findFirst({ where: { id: docId } });
    if (!doc) throw notFound();
    return doc;
  }

  private async loadLive(docId: string, write = true): Promise<Doc> {
    const doc = await this.load(docId);
    await this.assertSpace(doc.spaceId, write);
    if (doc.deletedAt) throw conflict(ERROR_CODES.DOC_DELETED);
    return doc;
  }

  // ---------- Okuma ----------

  async list(spaceId: string): Promise<DocsResponse> {
    await this.assertSpace(spaceId, false);
    const docs = await this.tenant.db.doc.findMany({ where: { spaceId, deletedAt: null } });
    return { docs: inTreeOrder(docs).map(toNode) };
  }

  /** Çöp kutusu: silinen dalların kökleri (alt sayfalar köküyle birlikte döner). */
  async trash(spaceId: string): Promise<DocsResponse> {
    await this.assertSpace(spaceId, false);
    const deleted = await this.tenant.db.doc.findMany({
      where: { spaceId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
    const byId = new Map(deleted.map((d) => [d.id, d]));
    const roots = deleted.filter((d) => {
      const parent = d.parentId ? byId.get(d.parentId) : undefined;
      return !parent || parent.deletedAt?.getTime() !== d.deletedAt?.getTime();
    });
    return { docs: roots.map(toNode) };
  }

  async get(docId: string): Promise<DocDetail> {
    const db = this.tenant.db;
    const doc = await db.doc.findFirst({
      where: { id: docId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    if (!doc) throw notFound();
    const all = await db.doc.findMany({
      where: { spaceId: doc.spaceId },
      select: { id: true, parentId: true, title: true },
    });
    const byId = new Map(all.map((d) => [d.id, d]));
    const ancestors: Array<{ id: string; title: string }> = [];
    for (
      let current = doc.parentId ? byId.get(doc.parentId) : undefined;
      current && ancestors.length < DOC_MAX_DEPTH;
      current = current.parentId ? byId.get(current.parentId) : undefined
    ) {
      ancestors.unshift({ id: current.id, title: current.title });
    }
    return {
      id: doc.id,
      spaceId: doc.spaceId,
      parentId: doc.parentId,
      title: doc.title,
      content: (doc.content as DocDetail['content']) ?? null,
      revision: doc.revision,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      updatedBy: doc.updatedBy,
      ancestors,
      links: await this.links.itemsOfDoc(docId),
      attachments: (
        await db.attachment.findMany({
          where: { docId },
          orderBy: { createdAt: 'asc' },
          include: { uploader: { select: { id: true, name: true } } },
        })
      ).map(toAttachmentDto),
      deleted: doc.deletedAt !== null,
    };
  }

  // ---------- Oluşturma ve düzenleme ----------

  async create(spaceId: string, input: CreateDocRequest): Promise<{ id: string }> {
    const { workspaceId, actorId } = this.ctx;
    await this.assertSpace(spaceId, true);
    const db = this.tenant.db;
    const live = await db.doc.findMany({
      where: { spaceId, deletedAt: null },
      select: { id: true, parentId: true, rank: true },
    });
    const parentId = input.parentId ?? null;
    if (parentId !== null) {
      if (!live.some((d) => d.id === parentId)) throw fail(ERROR_CODES.DOC_PARENT_INVALID);
      if (docDepth(live, parentId) >= DOC_MAX_DEPTH) throw fail(ERROR_CODES.DOC_PARENT_INVALID);
    }
    const siblings = live.filter((d) => d.parentId === parentId).sort(compareRank);
    const rank = rankBetween(siblings.at(-1)?.rank ?? null, null);
    const body = normalize(input.content);
    const title = input.title.trim();

    const id = await db.$transaction(async (tx) => {
      const doc = await tx.doc.create({
        data: {
          workspaceId,
          spaceId,
          parentId,
          title,
          content: body.content === null ? undefined : asJson(body.content),
          plainText: body.plainText,
          rank,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.writeVersion(tx, doc, actorId, true);
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: doc.id,
        action: 'doc.created',
        changes: asJson({ title, spaceId }),
      });
      return doc.id;
    });
    return { id };
  }

  async update(docId: string, input: UpdateDocRequest): Promise<UpdateDocResponse> {
    const { actorId } = this.ctx;
    const doc = await this.loadLive(docId);
    if (doc.revision !== input.revision) throw conflict(ERROR_CODES.DOC_CONFLICT);

    const body = input.content === undefined ? null : normalize(input.content);
    const title = input.title?.trim() ?? doc.title;
    const updated = await this.tenant.db.$transaction(async (tx) => {
      // Eşzamanlı iki kayıttan yalnızca biri geçer: revision koşulu satırı kilitler.
      const result = await tx.doc.updateMany({
        where: { id: docId, revision: input.revision, deletedAt: null },
        data: {
          title,
          ...(body
            ? {
                content: body.content === null ? Prisma.DbNull : asJson(body.content),
                plainText: body.plainText,
              }
            : {}),
          updatedById: actorId,
          revision: { increment: 1 },
        },
      });
      if (result.count === 0) throw conflict(ERROR_CODES.DOC_CONFLICT);
      const fresh = await tx.doc.findFirstOrThrow({ where: { id: docId } });
      // Yeni sürüm açıldıysa denetim kaydı düşülür (10 dakikalık birleşen kayıtlar tek satır olur).
      if (await this.writeVersion(tx, fresh, actorId, false)) {
        await this.activity.record(tx, {
          workspaceId: fresh.workspaceId,
          actorId,
          entityType: 'doc',
          entityId: fresh.id,
          action: 'doc.edited',
          changes: { title: fresh.title },
        });
      }
      return fresh;
    });
    return { revision: updated.revision, updatedAt: updated.updatedAt.toISOString() };
  }

  /**
   * Sürüm satırı yazar: aynı yazarın yakın kayıtları son sürümde birleşir, aksi halde yeni
   * sürüm açılır (ADR-069). `force` her zaman yeni sürüm açar (oluşturma, geri yükleme).
   */
  private async writeVersion(
    tx: TenantTx,
    doc: Doc,
    actorId: string,
    force: boolean,
  ): Promise<boolean> {
    const last = await tx.docVersion.findFirst({
      where: { docId: doc.id },
      orderBy: { version: 'desc' },
    });
    const content = doc.content === null ? undefined : asJson(doc.content);
    if (!force && last && !startsNewVersion(last, actorId, new Date())) {
      await tx.docVersion.update({
        where: { id: last.id },
        data: { title: doc.title, content: content ?? Prisma.DbNull },
      });
      return false;
    }
    await tx.docVersion.create({
      data: {
        workspaceId: doc.workspaceId,
        docId: doc.id,
        version: (last?.version ?? 0) + 1,
        title: doc.title,
        content,
        authorId: actorId,
      },
    });
    // Sınırı aşan en eski sürümler silinir.
    const stale = await tx.docVersion.findMany({
      where: { docId: doc.id },
      orderBy: { version: 'desc' },
      skip: DOC_MAX_VERSIONS,
      select: { id: true },
    });
    if (stale.length > 0) {
      await tx.docVersion.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
    return true;
  }

  // ---------- Taşıma ----------

  async move(docId: string, input: MoveDocRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.loadLive(docId);
    const db = this.tenant.db;
    const live = await db.doc.findMany({
      where: { spaceId: doc.spaceId, deletedAt: null },
      select: { id: true, parentId: true, rank: true },
    });
    const parentId = input.parentId;
    if (parentId !== null && !live.some((d) => d.id === parentId)) {
      throw fail(ERROR_CODES.DOC_PARENT_INVALID);
    }
    if (checkDocMove(live, docId, parentId) !== 'OK') throw fail(ERROR_CODES.DOC_PARENT_INVALID);

    const siblings = live.filter((d) => d.parentId === parentId).sort(compareRank);
    const rank = rankForPlacement(siblings, docId, input.afterId ?? null);
    if (rank === null) throw fail(ERROR_CODES.DOC_PARENT_INVALID);

    await db.$transaction(async (tx) => {
      await tx.doc.update({ where: { id: docId }, data: { parentId, rank } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.moved',
        changes: asJson({ title: doc.title, parentId: { from: doc.parentId, to: parentId } }),
      });
    });
  }

  // ---------- Çöp kutusu ----------

  /** Sayfa ve tüm alt sayfaları çöp kutusuna gider (aynı zaman damgasıyla, birlikte geri gelir). */
  async remove(docId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.loadLive(docId);
    const db = this.tenant.db;
    const live = await db.doc.findMany({
      where: { spaceId: doc.spaceId, deletedAt: null },
      select: { id: true, parentId: true },
    });
    const ids = this.subtreeIds(live, docId);
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.doc.updateMany({ where: { id: { in: ids } }, data: { deletedAt: now } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.deleted',
        changes: asJson({ title: doc.title, pages: ids.length }),
      });
    });
  }

  async restore(docId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.load(docId);
    await this.assertSpace(doc.spaceId, true);
    if (!doc.deletedAt) return;
    const db = this.tenant.db;
    const deletedWithIt = await db.doc.findMany({
      where: { spaceId: doc.spaceId, deletedAt: doc.deletedAt },
      select: { id: true, parentId: true },
    });
    const ids = this.subtreeIds(deletedWithIt, docId);
    const parent = doc.parentId
      ? await db.doc.findFirst({ where: { id: doc.parentId }, select: { deletedAt: true } })
      : null;
    // Üst sayfa hâlâ çöpteyse sayfa köke döner.
    const toRoot = doc.parentId !== null && (!parent || parent.deletedAt !== null);
    const siblings = await db.doc.findMany({
      where: { spaceId: doc.spaceId, parentId: toRoot ? null : doc.parentId, deletedAt: null },
      select: { rank: true },
    });
    const rank = rankBetween(siblings.sort(compareRank).at(-1)?.rank ?? null, null);

    await db.$transaction(async (tx) => {
      await tx.doc.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
      await tx.doc.update({
        where: { id: docId },
        data: { rank, ...(toRoot ? { parentId: null } : {}) },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.restored',
        changes: asJson({ title: doc.title, pages: ids.length }),
      });
    });
  }

  private subtreeIds(docs: ReadonlyArray<{ id: string; parentId: string | null }>, rootId: string) {
    const ids = [rootId];
    for (let i = 0; i < ids.length; i += 1) {
      for (const doc of docs) if (doc.parentId === ids[i]) ids.push(doc.id);
    }
    return ids;
  }

  // ---------- Sürümler ----------

  async versions(docId: string): Promise<DocVersionsResponse> {
    const doc = await this.load(docId);
    const rows = await this.tenant.db.docVersion.findMany({
      where: { docId },
      orderBy: { version: 'desc' },
      include: { author: { select: { id: true, name: true } } },
    });
    return {
      versions: rows.map((v, index) => ({
        version: v.version,
        title: v.title,
        author: v.author,
        createdAt: v.createdAt.toISOString(),
        current: index === 0 && JSON.stringify(v.content) === JSON.stringify(doc.content),
      })),
    };
  }

  async versionDetail(docId: string, version: number): Promise<DocVersionDetail> {
    const doc = await this.load(docId);
    const row = await this.tenant.db.docVersion.findFirst({
      where: { docId, version },
      include: { author: { select: { id: true, name: true } } },
    });
    if (!row) throw notFound();
    const latest = await this.tenant.db.docVersion.findFirst({
      where: { docId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return {
      version: row.version,
      title: row.title,
      author: row.author,
      createdAt: row.createdAt.toISOString(),
      current:
        latest?.version === row.version &&
        JSON.stringify(row.content) === JSON.stringify(doc.content),
      content: (row.content as DocVersionDetail['content']) ?? null,
    };
  }

  /** Eski sürümü geri yükler: içerik ve başlık dönüşür, yeni bir sürüm olarak kaydedilir. */
  async restoreVersion(docId: string, version: number): Promise<UpdateDocResponse> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.loadLive(docId);
    const row = await this.tenant.db.docVersion.findFirst({ where: { docId, version } });
    if (!row) throw notFound();
    const body = normalize(row.content);

    const updated = await this.tenant.db.$transaction(async (tx) => {
      const fresh = await tx.doc.update({
        where: { id: docId },
        data: {
          title: row.title,
          content: body.content === null ? Prisma.DbNull : asJson(body.content),
          plainText: body.plainText,
          updatedById: actorId,
          revision: { increment: 1 },
        },
      });
      await this.writeVersion(tx, fresh, actorId, true);
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.version_restored',
        changes: asJson({ title: doc.title, version }),
      });
      return fresh;
    });
    return { revision: updated.revision, updatedAt: updated.updatedAt.toISOString() };
  }
}
