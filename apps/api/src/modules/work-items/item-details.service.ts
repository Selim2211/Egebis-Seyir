import { ConflictException, Injectable } from '@nestjs/common';
import {
  ACCEPTANCE_CHECKLIST,
  canonicalLink,
  compareRank,
  ERROR_CODES,
  formatItemKey,
  MAX_CHECKLISTS_PER_ITEM,
  parseItemKey,
  rankBetween,
  type CreateChecklistEntryRequest,
  type CreateLinkRequest,
  type Created,
  type ItemSearchResponse,
  type SplitItemResponse,
  type UpdateChecklistEntryRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../spaces/space-errors';
import { fail } from './item-support';
import { WorkItemsService } from './work-items.service';

const SEARCH_LIMIT = 10;

/** Görev detayındaki alt kaynaklar: checklist, bağlantı, izleyici, bölme, arama (Faz 1.4). */
@Injectable()
export class ItemDetailsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
    private readonly items: WorkItemsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private async activeItem(itemId: string) {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
    });
    if (!item) throw notFound();
    return item;
  }

  // ---------- Checklist ve kabul kriterleri (ADR-049) ----------

  async createChecklist(itemId: string, title: string): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeItem(itemId);
    const db = this.tenant.db;
    const existing = await db.checklist.findMany({
      where: { workItemId: itemId, kind: 'CHECKLIST' },
      select: { rank: true },
    });
    if (existing.length >= MAX_CHECKLISTS_PER_ITEM) {
      throw fail(ERROR_CODES.CHECKLIST_LIMIT);
    }
    const last = existing.sort(compareRank).at(-1);
    return db.$transaction(async (tx) => {
      const checklist = await tx.checklist.create({
        data: {
          workspaceId,
          workItemId: itemId,
          kind: 'CHECKLIST',
          title,
          rank: rankBetween(last?.rank ?? null, null),
        },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.checklist_added',
        changes: { title },
      });
      return { id: checklist.id };
    });
  }

  async renameChecklist(itemId: string, checklistId: string, title: string): Promise<void> {
    const { count } = await this.tenant.db.checklist.updateMany({
      where: { id: checklistId, workItemId: itemId, kind: 'CHECKLIST' },
      data: { title },
    });
    if (count === 0) throw notFound();
  }

  async deleteChecklist(itemId: string, checklistId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.tenant.db.$transaction(async (tx) => {
      const checklist = await tx.checklist.findFirst({
        where: { id: checklistId, workItemId: itemId, kind: 'CHECKLIST' },
      });
      if (!checklist) throw notFound();
      await tx.checklist.delete({ where: { id: checklistId } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.checklist_removed',
        changes: { title: checklist.title },
      });
    });
  }

  /** `checklistId = "acceptance"`: kabul kriterleri listesi yoksa ilk madde eklenirken oluşturulur. */
  async addEntry(
    itemId: string,
    checklistId: string,
    input: CreateChecklistEntryRequest,
  ): Promise<Created> {
    const { workspaceId } = this.ctx;
    const item = await this.activeItem(itemId);
    const db = this.tenant.db;
    return db.$transaction(async (tx) => {
      let id = checklistId;
      if (checklistId === ACCEPTANCE_CHECKLIST) {
        const found = await tx.checklist.findFirst({
          where: { workItemId: item.id, kind: 'ACCEPTANCE' },
        });
        id = (
          found ??
          (await tx.checklist.create({
            data: {
              workspaceId,
              workItemId: item.id,
              kind: 'ACCEPTANCE',
              title: 'ACCEPTANCE',
              rank: 'a0',
            },
          }))
        ).id;
      } else if (!(await tx.checklist.findFirst({ where: { id, workItemId: item.id } }))) {
        throw notFound();
      }
      const last = await tx.checklistItem.findFirst({
        where: { checklistId: id },
        orderBy: { rank: 'desc' },
        select: { rank: true },
      });
      const entry = await tx.checklistItem.create({
        data: {
          workspaceId,
          checklistId: id,
          text: input.text,
          rank: rankBetween(last?.rank ?? null, null),
        },
      });
      return { id: entry.id };
    });
  }

  async updateEntry(
    itemId: string,
    checklistId: string,
    entryId: string,
    input: UpdateChecklistEntryRequest,
  ): Promise<void> {
    const { count } = await this.tenant.db.checklistItem.updateMany({
      where: { id: entryId, checklistId, checklist: { workItemId: itemId } },
      data: input,
    });
    if (count === 0) throw notFound();
  }

  async deleteEntry(itemId: string, checklistId: string, entryId: string): Promise<void> {
    const { count } = await this.tenant.db.checklistItem.deleteMany({
      where: { id: entryId, checklistId, checklist: { workItemId: itemId } },
    });
    if (count === 0) throw notFound();
  }

  // ---------- Bağlantılar (ADR-050) ----------

  async addLink(itemId: string, input: CreateLinkRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    await this.activeItem(itemId);
    const target = await db.workItem.findFirst({
      where: { id: input.targetId, deletedAt: null, space: { deletedAt: null } },
      select: { id: true, spaceId: true },
    });
    // Görünmeyen Space'teki öğe yokmuş gibi davranır.
    if (!target || !(await this.access.permissionsIn(target.spaceId))) throw notFound();

    const itemIsFrom =
      input.relation === 'BLOCKS' ||
      input.relation === 'DUPLICATES' ||
      input.relation === 'RELATES_TO';
    const type =
      input.relation === 'BLOCKS' || input.relation === 'BLOCKED_BY'
        ? 'BLOCKS'
        : input.relation === 'RELATES_TO'
          ? 'RELATES_TO'
          : 'DUPLICATES';
    const check = canonicalLink(
      itemIsFrom ? itemId : target.id,
      itemIsFrom ? target.id : itemId,
      type,
    );
    if (!check.ok) throw fail(check.code);
    const { fromId, toId } = check.link;

    if (await db.workItemLink.findFirst({ where: { fromId, toId, type } })) {
      throw new ConflictException({ code: ERROR_CODES.WORK_ITEM_LINK_EXISTS });
    }
    return db.$transaction(async (tx) => {
      const link = await tx.workItemLink.create({
        data: { workspaceId, fromId, toId, type, createdById: actorId },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.link_added',
        changes: { relation: input.relation, targetId: target.id },
      });
      return { id: link.id };
    });
  }

  async removeLink(itemId: string, linkId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.tenant.db.$transaction(async (tx) => {
      const link = await tx.workItemLink.findFirst({
        where: { id: linkId, OR: [{ fromId: itemId }, { toId: itemId }] },
      });
      if (!link) throw notFound();
      await tx.workItemLink.delete({ where: { id: linkId } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.link_removed',
        changes: { linkId, type: link.type },
      });
    });
  }

  // ---------- İzleyiciler (ADR-051) ----------

  async setWatching(itemId: string, watching: boolean): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeItem(itemId);
    if (watching) {
      await this.tenant.db.workItemWatcher.createMany({
        data: [{ workItemId: itemId, userId: actorId, workspaceId }],
        skipDuplicates: true,
      });
    } else {
      await this.tenant.db.workItemWatcher.deleteMany({
        where: { workItemId: itemId, userId: actorId },
      });
    }
  }

  // ---------- Task'lara böl (ADR-051) ----------

  async split(itemId: string, titles: string[]): Promise<SplitItemResponse> {
    const { workspaceId, actorId } = this.ctx;
    const story = await this.activeItem(itemId);
    if (story.type !== 'STORY') throw fail(ERROR_CODES.WORK_ITEM_SPLIT_NOT_ALLOWED);
    const status = await this.items.resolveStatus(story.spaceId, undefined);

    return this.tenant.db.$transaction(async (tx) => {
      const last = await tx.workItem.findFirst({
        where: { listId: story.listId, deletedAt: null },
        orderBy: { rank: 'desc' },
        select: { rank: true },
      });
      let rank = last?.rank ?? null;
      const created: SplitItemResponse['items'] = [];
      for (const title of titles) {
        const counter = await tx.space.update({
          where: { id: story.spaceId },
          data: { itemCounter: { increment: 1 } },
          select: { itemCounter: true, key: true },
        });
        rank = rankBetween(rank, null);
        const task = await tx.workItem.create({
          data: {
            workspaceId,
            spaceId: story.spaceId,
            listId: story.listId,
            parentId: story.id,
            type: 'TASK',
            keyPrefix: counter.key,
            number: counter.itemCounter,
            title,
            statusId: status,
            reporterId: actorId,
            rank,
            watchers: { create: [{ workspaceId, userId: actorId }] },
          },
        });
        const key = formatItemKey(task.keyPrefix, task.number);
        created.push({ id: task.id, key });
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'item',
          entityId: task.id,
          action: 'item.created',
          changes: { key, type: 'TASK', title, splitFrom: story.id },
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: story.id,
        action: 'item.split',
        changes: { keys: created.map((c) => c.key) },
      });
      return { items: created };
    });
  }

  // ---------- Öğe arama (bağlantı eklerken) ----------

  /** Başlık veya `MOB-12` ile arar; yalnızca görülebilen Space'lerdeki öğeler döner. */
  async search(query: string, excludeId?: string): Promise<ItemSearchResponse> {
    const q = query.trim();
    if (q.length < 1) return { items: [] };
    const db = this.tenant.db;
    const perms = await this.access.permissionMap({ deletedAt: null });
    const key = parseItemKey(q);
    const rows = await db.workItem.findMany({
      where: {
        spaceId: { in: [...perms.keys()] },
        deletedAt: null,
        archivedAt: null,
        list: { deletedAt: null },
        ...(excludeId && { id: { not: excludeId } }),
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          ...(key ? [{ keyPrefix: key.prefix, number: key.number }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_LIMIT,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        key: formatItemKey(r.keyPrefix, r.number),
        type: r.type,
        title: r.title,
      })),
    };
  }
}
