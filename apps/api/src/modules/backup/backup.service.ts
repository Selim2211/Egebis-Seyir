import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  rankBetween,
  SPACE_PERMISSIONS as S,
  type RestoreResult,
} from '@scrum/shared';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StorageService } from '../../infra/storage/storage.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { forbidden, keyTaken, notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  SPRINT_TABLES,
  TABLES,
  type TableSpec,
} from './backup-tables';

type Row = Record<string, unknown>;
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  createMany(args: { data: Row[] }): Promise<unknown>;
};

const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 600 * 1024 * 1024;
const MAX_JSON_BYTES = 120 * 1024 * 1024;
const CHUNK = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
/** Sayfa/açıklama içindeki görsel adresleri (ADR-106); geri yüklemede yeni kimliklere çevrilir. */
const IMAGE_URL =
  /\/api\/workspaces\/[0-9a-f-]{36}\/(docs|items)\/([0-9a-f-]{36})\/attachments\/([0-9a-f-]{36})\?preview=1/gi;
/** İçeriğinde görsel adresi olabilecek alanlar: tablo → alan. */
const IMAGE_FIELDS: Record<string, string> = {
  doc: 'content',
  docVersion: 'content',
  workItem: 'description',
  comment: 'body',
};

interface Manifest {
  format: string;
  version: number;
  kind: 'space' | 'sprint';
  createdAt: string;
  source: { spaceName: string; spaceKey: string; sprintName?: string };
  /** Kaynak kullanıcı kimliği → e-posta. */
  users: Record<string, string>;
  counts: Record<string, number>;
}

interface BackupData {
  space?: Row;
  tables: Record<string, Row[]>;
}

/**
 * Space ve Sprint yedeği (Faz 8.5, ADR-105). Yedek tek bir ZIP dosyasıdır: `manifest.json`,
 * `data.json` (tablo satırları) ve `files/` (ek dosyaları). Geri yükleme her zaman yeni kayıt
 * açar; var olan hiçbir şeyin üzerine yazmaz.
 */
@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private need(permission: string): void {
    if (!(this.cls.get('spacePermissions') ?? []).includes(permission)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
  }

  private delegate(client: object, spec: TableSpec): Delegate {
    return (client as Record<string, Delegate>)[spec.delegate]!;
  }

  // ---------- Yedek alma ----------

  async backupSpace(spaceId: string): Promise<{ name: string; file: Buffer }> {
    this.need(S.SPACE_SETTINGS);
    const db = this.tenant.db;
    const space = await db.space.findFirst({ where: { id: spaceId, deletedAt: null } });
    if (!space) throw notFound();
    const wheres: Record<string, object> = {
      status: { spaceId },
      folder: { spaceId },
      list: { spaceId },
      label: { spaceId },
      customField: { spaceId },
      sprint: { spaceId },
      workItem: { spaceId },
      workItemAssignee: { workItem: { spaceId } },
      workItemLabel: { workItem: { spaceId } },
      checklist: { workItem: { spaceId } },
      checklistItem: { checklist: { workItem: { spaceId } } },
      workItemLink: { from: { spaceId } },
      doc: { spaceId },
      docVersion: { doc: { spaceId } },
      comment: { OR: [{ workItem: { spaceId } }, { doc: { spaceId } }] },
      attachment: { OR: [{ workItem: { spaceId } }, { doc: { spaceId } }] },
      sprintItemEvent: { sprint: { spaceId } },
    };
    const file = await this.pack('space', { name: space.name, key: space.key }, space, wheres);
    await this.record(spaceId, 'space', 'space.backup_created', { name: space.name });
    return { name: `${space.key}-yedek`, file };
  }

  async backupSprint(sprintId: string): Promise<{ name: string; file: Buffer }> {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({
      where: { id: sprintId },
      include: { space: true },
    });
    if (!sprint) throw notFound();
    this.need(S.SPRINT_PLAN);
    // Sprint öğeleri ve altlarındaki tüm alt öğeler.
    const ids = new Set(
      (await db.workItem.findMany({ where: { sprintId }, select: { id: true } })).map((i) => i.id),
    );
    let frontier = [...ids];
    while (frontier.length > 0) {
      const children = await db.workItem.findMany({
        where: { parentId: { in: frontier }, id: { notIn: [...ids] } },
        select: { id: true },
      });
      frontier = children.map((c) => c.id);
      frontier.forEach((id) => ids.add(id));
    }
    const items = [...ids];
    const wheres: Record<string, object> = {
      status: { spaceId: sprint.spaceId },
      label: { spaceId: sprint.spaceId },
      sprint: { id: sprintId },
      workItem: { id: { in: items } },
      workItemAssignee: { workItemId: { in: items } },
      workItemLabel: { workItemId: { in: items } },
      checklist: { workItemId: { in: items } },
      checklistItem: { checklist: { workItemId: { in: items } } },
      workItemLink: { fromId: { in: items }, toId: { in: items } },
      comment: { workItemId: { in: items } },
      attachment: { workItemId: { in: items } },
      sprintItemEvent: { sprintId },
    };
    const file = await this.pack(
      'sprint',
      { name: sprint.space.name, key: sprint.space.key, sprintName: sprint.name },
      null,
      wheres,
    );
    await this.record(sprintId, 'sprint', 'sprint.backup_created', { name: sprint.name });
    return { name: `${sprint.name}-yedek`, file };
  }

  private async pack(
    kind: 'space' | 'sprint',
    source: { name: string; key: string; sprintName?: string },
    space: Row | null,
    wheres: Record<string, object>,
  ): Promise<Buffer> {
    const db = this.tenant.db;
    const tables: Record<string, Row[]> = {};
    for (const spec of TABLES) {
      const where = wheres[spec.name];
      if (!where) continue;
      tables[spec.name] = await this.delegate(db, spec).findMany({ where });
    }

    // Kullanıcı kimlikleri e-postaya çevrilebilsin diye haritalanır.
    const userIds = new Set<string>();
    for (const spec of TABLES) {
      for (const row of tables[spec.name] ?? []) {
        for (const field of spec.users) {
          if (typeof row[field] === 'string') userIds.add(row[field]);
        }
      }
    }
    const users = Object.fromEntries(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, email: true },
        })
      ).map((u) => [u.id, u.email]),
    );

    const files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const row of tables.attachment ?? []) {
      const key = String(row.storageKey);
      if (!(await this.storage.exists(key))) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of this.storage.open(key)) chunks.push(chunk as Buffer);
      const data = Buffer.concat(chunks);
      total += data.length;
      if (total > MAX_UNPACKED_BYTES)
        throw fail(ERROR_CODES.BACKUP_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE);
      files[`files/${String(row.id)}`] = data;
    }

    const manifest: Manifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      kind,
      createdAt: new Date().toISOString(),
      source: { spaceName: source.name, spaceKey: source.key, sprintName: source.sprintName },
      users,
      counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    };
    const data: BackupData = { ...(space ? { space } : {}), tables };
    const zip = zipSync(
      {
        'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
        'data.json': strToU8(JSON.stringify(data)),
        ...files,
      },
      { level: 6 },
    );
    return Buffer.from(zip);
  }

  // ---------- Geri yükleme ----------

  /** Yedeği açıp doğrular; hata durumunda tek bir BACKUP_INVALID. */
  private unpack(file: Buffer | undefined): {
    manifest: Manifest;
    data: BackupData;
    files: Record<string, Uint8Array>;
  } {
    if (!file || file.length === 0) throw fail(ERROR_CODES.BACKUP_INVALID);
    if (file.length > MAX_ZIP_BYTES)
      throw fail(ERROR_CODES.BACKUP_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE);
    let unpacked: Record<string, Uint8Array>;
    let budget = MAX_UNPACKED_BYTES;
    try {
      unpacked = unzipSync(new Uint8Array(file), {
        filter: (entry) => {
          budget -= entry.originalSize;
          if (budget < 0) throw new Error('too large');
          return (
            entry.name === 'manifest.json' ||
            entry.name === 'data.json' ||
            /^files\/[0-9a-f-]{36}$/i.test(entry.name)
          );
        },
      });
    } catch {
      throw fail(ERROR_CODES.BACKUP_INVALID);
    }
    const manifestRaw = unpacked['manifest.json'];
    const dataRaw = unpacked['data.json'];
    if (!manifestRaw || !dataRaw || dataRaw.length > MAX_JSON_BYTES) {
      throw fail(ERROR_CODES.BACKUP_INVALID);
    }
    let manifest: Manifest;
    let data: BackupData;
    try {
      manifest = JSON.parse(strFromU8(manifestRaw)) as Manifest;
      data = JSON.parse(strFromU8(dataRaw)) as BackupData;
    } catch {
      throw fail(ERROR_CODES.BACKUP_INVALID);
    }
    if (
      manifest.format !== BACKUP_FORMAT ||
      (manifest.kind !== 'space' && manifest.kind !== 'sprint')
    ) {
      throw fail(ERROR_CODES.BACKUP_INVALID);
    }
    if (manifest.version > BACKUP_VERSION) throw fail(ERROR_CODES.BACKUP_VERSION_UNSUPPORTED);
    if (typeof data.tables !== 'object' || data.tables === null)
      throw fail(ERROR_CODES.BACKUP_INVALID);
    for (const spec of TABLES) {
      const rows = data.tables[spec.name];
      if (rows === undefined) continue;
      if (!Array.isArray(rows) || rows.some((r) => typeof r !== 'object' || r === null)) {
        throw fail(ERROR_CODES.BACKUP_INVALID);
      }
      if (!spec.noId && rows.some((r) => typeof r.id !== 'string' || !UUID.test(r.id))) {
        throw fail(ERROR_CODES.BACKUP_INVALID);
      }
    }
    const files = Object.fromEntries(
      Object.entries(unpacked).filter(([name]) => name.startsWith('files/')),
    );
    return { manifest, data, files };
  }

  /** Her satıra yeni kimlik verir; tablolar arası bağlar ve içerikteki görsel adresleri bunu kullanır. */
  private seedIds(data: BackupData, maps: Map<string, Map<string, string>>): void {
    for (const spec of TABLES) {
      if (spec.noId) continue;
      const own = maps.get(spec.name) ?? new Map<string, string>();
      maps.set(spec.name, own);
      for (const row of data.tables[spec.name] ?? []) own.set(String(row.id), randomUUID());
    }
  }

  private rewriteImages(
    value: unknown,
    maps: Map<string, Map<string, string>>,
    workspaceId: string,
  ): unknown {
    if (value === null || value === undefined) return value;
    const text = JSON.stringify(value);
    if (!text.includes('/attachments/')) return value;
    return JSON.parse(
      text.replace(IMAGE_URL, (match, kind: string, owner: string, attachment: string) => {
        const newOwner = maps.get(kind === 'docs' ? 'doc' : 'workItem')?.get(owner);
        const newAttachment = maps.get('attachment')?.get(attachment);
        return newOwner && newAttachment
          ? `/api/workspaces/${workspaceId}/${kind}/${newOwner}/attachments/${newAttachment}?preview=1`
          : match;
      }),
    ) as unknown;
  }

  /** Workspace üyelerinin e-posta → kullanıcı kimliği tablosu. */
  private async memberIds(emails: Iterable<string>): Promise<Map<string, string>> {
    const members = await this.tenant.db.membership.findMany({
      where: { user: { email: { in: [...emails].map((e) => e.toLowerCase()) } } },
      select: { user: { select: { id: true, email: true } } },
    });
    return new Map(members.map((m) => [m.user.email.toLowerCase(), m.user.id]));
  }

  /** Yedekten yeni bir Space açar (yalnız Sahip/Yönetici). */
  async restoreSpace(
    file: Buffer | undefined,
    input: { key: string; name?: string },
  ): Promise<RestoreResult> {
    const { manifest, data, files } = this.unpack(file);
    if (manifest.kind !== 'space' || !data.space) throw fail(ERROR_CODES.BACKUP_INVALID);
    if (!KEY_PATTERN.test(input.key)) throw fail(ERROR_CODES.BACKUP_INVALID);
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    if (await db.spaceKey.findFirst({ where: { key: input.key } })) throw keyTaken();

    const users = await this.memberIds(Object.values(manifest.users));
    const last = await db.space.findFirst({
      where: { deletedAt: null },
      orderBy: { rank: 'desc' },
    });
    const spaceId = randomUUID();
    const maps = new Map<string, Map<string, string>>([
      ['space', new Map([[String(data.space.id), spaceId]])],
    ]);
    const skipped: Record<string, number> = {};
    this.seedIds(data, maps);

    try {
      await db.$transaction(
        async (tx) => {
          const src = data.space!;
          await tx.space.create({
            data: {
              id: spaceId,
              workspaceId,
              name: input.name?.trim() || String(src.name),
              key: input.key,
              color: String(src.color),
              icon: (src.icon as string | null) ?? null,
              description: (src.description as string | null) ?? null,
              isPrivate: Boolean(src.isPrivate),
              scrumEnabled: Boolean(src.scrumEnabled),
              sprintLengthWeeks: Number(src.sprintLengthWeeks ?? 2),
              sprintGoalRequired: Boolean(src.sprintGoalRequired),
              dodItems: (src.dodItems as string[]) ?? [],
              dorItems: (src.dorItems as string[]) ?? [],
              dodEnforced: Boolean(src.dodEnforced),
              estimationScale: src.estimationScale as 'FIBONACCI' | 'TSHIRT' | 'NUMBER',
              rank: rankBetween(last?.rank ?? null, null),
              itemCounter: Number(src.itemCounter ?? 0),
              createdById: actorId,
            },
          });
          await tx.spaceKey.create({ data: { workspaceId, spaceId, key: input.key } });
          for (const spec of TABLES) {
            const rows = data.tables[spec.name] ?? [];
            skipped[spec.name] = await this.insertRows(tx, spec, rows, maps, users, manifest, {
              spaceKey: input.key,
              spaceId,
            });
          }
          await this.activity.record(tx, {
            workspaceId,
            actorId,
            entityType: 'space',
            entityId: spaceId,
            action: 'space.restored',
            changes: asJson({
              name: input.name ?? String(src.name),
              from: manifest.source.spaceKey,
            }),
          });
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (error) {
      throw this.restoreError(error);
    }
    await this.restoreFiles(maps, files);
    return { spaceId, sprintId: null, counts: manifest.counts, skipped };
  }

  /** Sprint yedeğini var olan bir Space'e yeni sprint olarak ekler. */
  async restoreSprint(
    spaceId: string,
    file: Buffer | undefined,
    input: { listId: string },
  ): Promise<RestoreResult> {
    this.need(S.SPRINT_PLAN);
    this.need(S.WORK_ITEM_WRITE);
    const { manifest, data, files } = this.unpack(file);
    if (manifest.kind !== 'sprint') throw fail(ERROR_CODES.BACKUP_INVALID);
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const space = await db.space.findFirst({ where: { id: spaceId, deletedAt: null } });
    if (!space) throw notFound();
    const list = await db.list.findFirst({
      where: { id: input.listId, spaceId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    if (!list) throw notFound();

    const users = await this.memberIds(Object.values(manifest.users));
    const maps = new Map<string, Map<string, string>>([['space', new Map()]]);
    const skipped: Record<string, number> = {};
    this.seedIds(data, maps);

    try {
      const sprintId = await db.$transaction(
        async (tx) => {
          // Durumlar ve etiketler adla eşlenir (yoksa etiket açılır, durum için ilk durum).
          const statuses = await tx.status.findMany({
            where: { spaceId, archivedAt: null },
            orderBy: { rank: 'asc' },
          });
          const statusMap = new Map<string, string>();
          for (const row of data.tables.status ?? []) {
            const match = statuses.find(
              (s) => s.name.toLowerCase() === String(row.name).toLowerCase(),
            );
            statusMap.set(String(row.id), (match ?? statuses[0]!).id);
          }
          maps.set('status', statusMap);
          const labelMap = new Map<string, string>();
          for (const row of data.tables.label ?? []) {
            const existing = await tx.label.findFirst({
              where: { spaceId, name: String(row.name) },
            });
            const made =
              existing ??
              (await tx.label.create({
                data: { workspaceId, spaceId, name: String(row.name), color: String(row.color) },
              }));
            labelMap.set(String(row.id), made.id);
          }
          maps.set('label', labelMap);

          const items = data.tables.workItem ?? [];
          const counter = await tx.space.update({
            where: { id: spaceId },
            data: { itemCounter: { increment: items.length } },
            select: { itemCounter: true },
          });
          let number = counter.itemCounter - items.length;
          const overrides = new Map<string, Row>();
          for (const row of items) {
            number += 1;
            overrides.set(String(row.id), {
              spaceId,
              listId: list.id,
              keyPrefix: space.key,
              number,
              backlogRank: null,
              customFields: {},
              externalSource: null,
              externalId: null,
            });
          }
          for (const spec of TABLES) {
            if (!SPRINT_TABLES.has(spec.name)) continue;
            skipped[spec.name] = await this.insertRows(
              tx,
              spec,
              data.tables[spec.name] ?? [],
              maps,
              users,
              manifest,
              {
                spaceKey: space.key,
                spaceId,
                overrides: spec.name === 'workItem' ? overrides : undefined,
                sprintToPlanned: spec.name === 'sprint',
              },
            );
          }
          const newSprint = [...(maps.get('sprint')?.values() ?? [])][0] ?? null;
          await this.activity.record(tx, {
            workspaceId,
            actorId,
            entityType: 'sprint',
            entityId: newSprint ?? spaceId,
            action: 'sprint.restored',
            changes: asJson({ name: manifest.source.sprintName ?? '', items: items.length }),
          });
          return newSprint;
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      await this.restoreFiles(maps, files);
      return { spaceId, sprintId, counts: manifest.counts, skipped };
    } catch (error) {
      throw this.restoreError(error);
    }
  }

  /** Tablo satırlarını kimlikleri yenileyerek yazar; atlanan satır sayısını döner. */
  private async insertRows(
    tx: object,
    spec: TableSpec,
    rows: Row[],
    maps: Map<string, Map<string, string>>,
    users: Map<string, string>,
    manifest: Manifest,
    context: {
      spaceKey: string;
      spaceId: string;
      overrides?: Map<string, Row>;
      sprintToPlanned?: boolean;
    },
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const { workspaceId } = this.ctx;
    const own = maps.get(spec.name) ?? new Map<string, string>();
    maps.set(spec.name, own);
    // Üst kayıtlar önce yazılsın (kendine işaret eden tablolar).
    const selfField = Object.entries(spec.refs).find(([, kind]) => kind === spec.name)?.[0];
    const ordered = selfField ? this.parentsFirst(rows, selfField) : rows;
    if (!spec.noId)
      for (const row of rows) if (!own.has(String(row.id))) own.set(String(row.id), randomUUID());

    const mapRef = (kind: string, value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      return maps.get(kind)?.get(value) ?? null;
    };
    const emailOf = (id: unknown) => (typeof id === 'string' ? manifest.users[id] : undefined);
    const customFieldIds = maps.get('customField');
    const keys = maps.get('attachmentKey') ?? new Map<string, string>();
    maps.set('attachmentKey', keys);

    let skipped = 0;
    const out: Row[] = [];
    for (const source of ordered) {
      const row: Row = { ...source, workspaceId };
      if (!spec.noId) row.id = own.get(String(source.id));
      let drop = false;
      const override = context.overrides?.get(String(source.id));
      for (const [field, kind] of Object.entries(spec.refs)) {
        if (source[field] === null || source[field] === undefined) continue;
        if (override && field in override) continue;
        const mapped = mapRef(kind, source[field]);
        // Bağlı kaydı yedekte olmayan zorunlu bağlar (ör. başka Space'in durumu) satırı atlatır.
        if (mapped === null) {
          if (kind === 'space') row[field] = context.spaceId;
          else if (['sprintId', 'parentId', 'folderId'].includes(field)) row[field] = null;
          else drop = true;
        } else row[field] = mapped;
      }
      if (spec.refs.spaceId) row.spaceId = context.spaceId;
      for (const field of spec.users) {
        const email = emailOf(source[field]);
        const id = email ? users.get(email.toLowerCase()) : undefined;
        row[field] = id ?? null;
        if (!id && spec.requiredUsers?.includes(field)) drop = true;
      }
      if (spec.name === 'workItem') {
        row.keyPrefix = context.spaceKey;
        const raw = (source.customFields ?? {}) as Record<string, unknown>;
        row.customFields = Object.fromEntries(
          Object.entries(raw).flatMap(([id, value]) => {
            const mapped = customFieldIds?.get(id);
            return mapped ? [[mapped, value]] : [];
          }),
        );
        row.externalSource = null;
        row.externalId = null;
        Object.assign(row, override ?? {});
      }
      if (spec.name === 'sprint' && context.sprintToPlanned && row.status === 'ACTIVE') {
        row.status = 'PLANNED';
        row.startedAt = null;
      }
      const imageField = IMAGE_FIELDS[spec.name];
      if (imageField && row[imageField] !== undefined) {
        row[imageField] = this.rewriteImages(row[imageField], maps, workspaceId);
      }
      if (spec.name === 'attachment') {
        row.storageKey = `${workspaceId}/${randomUUID()}`;
        keys.set(String(source.id), String(row.storageKey));
      }
      for (const field of spec.nullableJson ?? []) {
        if (row[field] === null || row[field] === undefined) row[field] = Prisma.DbNull;
      }
      if (drop) skipped += 1;
      else out.push(row);
    }
    // Sprint geri yüklemede yedekteki sprint tablosu tek satırdır; tablolar arası haritalar yukarıda dolar.
    for (let i = 0; i < out.length; i += CHUNK) {
      await this.delegate(tx, spec).createMany({ data: out.slice(i, i + CHUNK) });
    }
    return skipped;
  }

  /** Üst öğesi önce gelecek şekilde sıralar (döngü ya da dışarıdaki üst: kök sayılır). */
  private parentsFirst(rows: Row[], parentField: string): Row[] {
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const ordered: Row[] = [];
    const seen = new Set<string>();
    const visit = (row: Row, trail: Set<string>) => {
      const id = String(row.id);
      if (seen.has(id) || trail.has(id)) return;
      trail.add(id);
      const parent = typeof row[parentField] === 'string' ? byId.get(row[parentField]) : undefined;
      if (parent) visit(parent, trail);
      seen.add(id);
      ordered.push(row);
    };
    for (const row of rows) visit(row, new Set());
    return ordered;
  }

  /** Ek dosyalarını yeni anahtarlarla diske yazar (kayıtlar işlem tamamlandıktan sonra). */
  private async restoreFiles(
    maps: Map<string, Map<string, string>>,
    files: Record<string, Uint8Array>,
  ): Promise<void> {
    for (const [oldId, key] of maps.get('attachmentKey') ?? []) {
      const bytes = files[`files/${oldId}`];
      if (bytes) await this.storage.write(key, Buffer.from(bytes));
    }
  }

  private restoreError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return keyTaken();
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      return fail(ERROR_CODES.BACKUP_INVALID);
    }
    return error;
  }

  private async record(
    entityId: string,
    entityType: 'space' | 'sprint',
    action: string,
    changes: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.activity.record(this.tenant.db, {
      workspaceId: this.ctx.workspaceId,
      actorId: this.ctx.actorId,
      entityType,
      entityId,
      action,
      changes,
    });
  }
}
