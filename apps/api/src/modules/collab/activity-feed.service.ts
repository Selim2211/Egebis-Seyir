import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_PAGE_SIZE,
  formatItemKey,
  type ActivityChange,
  type ActivityEvent,
  type ActivityResponse,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { notFound } from '../spaces/space-errors';

/** Sayfa imleci: `<ISO zaman>|<id>`; base64url. */
const encodeCursor = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');

function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null;
}

type Raw = Record<string, unknown>;
interface Change {
  from?: unknown;
  to?: unknown;
}
const isChange = (value: unknown): value is Change =>
  typeof value === 'object' && value !== null && ('from' in value || 'to' in value);

/** Aktivite akışları (ADR-057): kayıttaki kimlikleri adlara çevirir, imleçle sayfalar. */
@Injectable()
export class ActivityFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
  ) {}

  /** Tek öğenin akışı. */
  async forItem(itemId: string, cursor?: string): Promise<ActivityResponse> {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId },
      select: { id: true },
    });
    if (!item) throw notFound();
    const at = decodeCursor(cursor);
    const rows = await this.tenant.db.activityEvent.findMany({
      where: {
        entityType: 'item',
        entityId: itemId,
        ...(at && { OR: [{ createdAt: { lt: at.at } }, { createdAt: at.at, id: { lt: at.id } }] }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ACTIVITY_PAGE_SIZE + 1,
    });
    return this.present(rows);
  }

  /** Görülebilen Space'lerdeki öğe olayları (Ana sayfa "Son aktivite"). Ham SQL: ADR-053 ile aynı istisna. */
  async recent(cursor?: string, limit = ACTIVITY_PAGE_SIZE): Promise<ActivityResponse> {
    const workspaceId = this.cls.get('workspaceId')!;
    const spaceIds = [...(await this.access.permissionMap({ deletedAt: null })).keys()];
    if (spaceIds.length === 0) return { events: [], next: null };
    const size = Math.min(Math.max(limit, 1), ACTIVITY_PAGE_SIZE);
    const at = decodeCursor(cursor);

    const hits = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT e."id"
      FROM "activity_events" e
      JOIN "work_items" w ON w."id" = e."entityId"
      JOIN "lists" l ON l."id" = w."listId" AND l."deletedAt" IS NULL
      WHERE e."workspaceId" = ${workspaceId}::uuid
        AND e."entityType" = 'item'
        AND w."spaceId" = ANY(${spaceIds}::uuid[])
        AND w."deletedAt" IS NULL
        ${at ? Prisma.sql`AND (e."createdAt" < ${at.at} OR (e."createdAt" = ${at.at} AND e."id" < ${at.id}::uuid))` : Prisma.empty}
      ORDER BY e."createdAt" DESC, e."id" DESC
      LIMIT ${size + 1}
    `);
    const rows = await this.tenant.db.activityEvent.findMany({
      where: { id: { in: hits.map((h) => h.id) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return this.present(rows, size);
  }

  // ---------- Sunum ----------

  private async present(
    rows: Array<{
      id: string;
      actorId: string | null;
      entityId: string;
      action: string;
      changes: unknown;
      createdAt: Date;
    }>,
    size = ACTIVITY_PAGE_SIZE,
  ): Promise<ActivityResponse> {
    const page = rows.slice(0, size);
    const next = rows.length > size ? encodeCursor(page.at(-1)!.createdAt, page.at(-1)!.id) : null;
    const db = this.tenant.db;

    const raws = page.map((r) =>
      r.changes && typeof r.changes === 'object' ? (r.changes as Raw) : {},
    );
    const flat = (value: unknown): unknown[] =>
      Array.isArray(value) ? (value as unknown[]) : [value];
    const idsOf = (field: string) =>
      [
        ...new Set(
          raws.flatMap((raw) => {
            const entry = raw[field];
            return isChange(entry) ? [...flat(entry.from), ...flat(entry.to)] : [];
          }),
        ),
      ].filter((v): v is string => typeof v === 'string');

    const [statuses, users, labels, lists, spaces, items, actors] = await Promise.all([
      db.status.findMany({
        where: { id: { in: idsOf('statusId') } },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: idsOf('assigneeIds') } },
        select: { id: true, name: true },
      }),
      db.label.findMany({
        where: { id: { in: idsOf('labelIds') } },
        select: { id: true, name: true },
      }),
      db.list.findMany({
        where: { id: { in: idsOf('listId') } },
        select: { id: true, name: true },
      }),
      db.space.findMany({
        where: { id: { in: idsOf('spaceId') } },
        select: { id: true, name: true },
      }),
      db.workItem.findMany({
        where: { id: { in: [...new Set(page.map((r) => r.entityId))] } },
        select: { id: true, keyPrefix: true, number: true, title: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(page.flatMap((r) => (r.actorId ? [r.actorId] : [])))] } },
        select: { id: true, name: true, avatarVersion: true },
      }),
    ]);
    const names = {
      statusId: new Map(statuses.map((s) => [s.id, s.name])),
      assigneeIds: new Map(users.map((u) => [u.id, u.name])),
      labelIds: new Map(labels.map((l) => [l.id, l.name])),
      listId: new Map(lists.map((l) => [l.id, l.name])),
      spaceId: new Map(spaces.map((s) => [s.id, s.name])),
    } as const;
    const itemById = new Map(items.map((i) => [i.id, i]));
    const actorById = new Map(actors.map((a) => [a.id, a]));

    const resolve = (field: string, value: unknown): string | string[] | null => {
      if (value === null || value === undefined) return null;
      const lookup = names[field as keyof typeof names];
      const one = (v: unknown) =>
        typeof v === 'string'
          ? (lookup?.get(v) ?? v)
          : typeof v === 'object'
            ? JSON.stringify(v)
            : `${v as number | boolean}`;
      return Array.isArray(value) ? value.map(one) : one(value);
    };

    const events: ActivityEvent[] = page.map((row, index) => {
      const raw = raws[index]!;
      const changes: ActivityChange[] = Object.entries(raw).flatMap(([field, entry]) =>
        isChange(entry)
          ? [{ field, from: resolve(field, entry.from), to: resolve(field, entry.to) }]
          : [],
      );
      const item = itemById.get(row.entityId);
      const detail = ['title', 'fileName', 'name', 'key']
        .map((k) => raw[k])
        .find((v): v is string => typeof v === 'string');
      return {
        id: row.id,
        action: row.action,
        actor: row.actorId ? (actorById.get(row.actorId) ?? null) : null,
        at: row.createdAt.toISOString(),
        item: item
          ? { id: item.id, key: formatItemKey(item.keyPrefix, item.number), title: item.title }
          : null,
        changes,
        detail: detail ?? null,
      };
    });
    return { events, next };
  }
}
