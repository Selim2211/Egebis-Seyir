import { Injectable } from '@nestjs/common';
import {
  parseItemKey,
  SEARCH_LIMIT,
  type MyWorkResponse,
  type MyWorkScope,
  type SearchResponse,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { rowInclude, toRow } from './item-support';

const MY_WORK_LIMIT = 500;
const MAX_QUERY_WORDS = 8;

/** `%` ve `_` kullanıcı girdisinde düz karakterdir. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Birden çok Space'i kapsayan okumalar: global arama ve "Benim işlerim" (ADR-053, ADR-054). */
@Injectable()
export class ItemQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
  ) {}

  async myWork(scope: MyWorkScope, includeDone: boolean): Promise<MyWorkResponse> {
    const userId = this.cls.get('userId')!;
    const visible = await this.access.permissionMap({ deletedAt: null });
    const rows = await this.tenant.db.workItem.findMany({
      where: {
        spaceId: { in: [...visible.keys()] },
        deletedAt: null,
        archivedAt: null,
        list: { deletedAt: null },
        ...(includeDone ? {} : { status: { category: { not: 'DONE' } } }),
        ...(scope === 'assigned' && { assignees: { some: { userId } } }),
        ...(scope === 'created' && { reporterId: userId }),
        ...(scope === 'watching' && { watchers: { some: { userId } } }),
      },
      include: rowInclude,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: MY_WORK_LIMIT,
    });
    return { items: rows.map(toRow) };
  }

  /**
   * Başlık ve açıklama (Türkçe FTS, ön ek eşleşmeli), başlık parçası (trigram) ve `MOB-12` kimliği.
   * Ham SQL: workspace ve görünür Space listesi açıkça verilir (ADR-053 istisnası).
   */
  async search(query: string): Promise<SearchResponse> {
    const q = query.trim().slice(0, 200);
    if (q.length === 0) return { items: [] };
    const workspaceId = this.cls.get('workspaceId')!;
    const spaceIds = [...(await this.access.permissionMap({ deletedAt: null })).keys()];
    if (spaceIds.length === 0) return { items: [] };

    const words = (q.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_QUERY_WORDS);
    const tsQuery = words.map((w) => `${w}:*`).join(' & ');
    const key = parseItemKey(q);
    const contains = `%${escapeLike(q)}%`;
    const startsWith = `${escapeLike(q)}%`;

    const textMatch =
      tsQuery === ''
        ? Prisma.sql`FALSE`
        : Prisma.sql`to_tsvector('turkish', w."title" || ' ' || coalesce(w."descriptionText", '')) @@ to_tsquery('turkish', ${tsQuery})`;
    const keyMatch = key
      ? Prisma.sql`(w."keyPrefix" = ${key.prefix} AND w."number" = ${key.number})`
      : Prisma.sql`FALSE`;

    const hits = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT w."id"
      FROM "work_items" w
      JOIN "lists" l ON l."id" = w."listId" AND l."deletedAt" IS NULL
      JOIN "spaces" s ON s."id" = w."spaceId" AND s."deletedAt" IS NULL
      WHERE w."workspaceId" = ${workspaceId}::uuid
        AND w."spaceId" = ANY(${spaceIds}::uuid[])
        AND w."deletedAt" IS NULL
        AND w."archivedAt" IS NULL
        AND (${keyMatch} OR w."title" ILIKE ${contains} OR ${textMatch})
      ORDER BY
        CASE WHEN ${keyMatch} THEN 0 WHEN w."title" ILIKE ${startsWith} THEN 1 WHEN w."title" ILIKE ${contains} THEN 2 ELSE 3 END,
        w."createdAt" DESC
      LIMIT ${SEARCH_LIMIT}
    `);
    if (hits.length === 0) return { items: [] };

    const rows = await this.tenant.db.workItem.findMany({
      where: { id: { in: hits.map((h) => h.id) } },
      include: rowInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      items: hits.flatMap(({ id }) => {
        const row = byId.get(id);
        if (!row) return [];
        const { key: itemKey, type, title, space, list, status } = toRow(row);
        return { id, key: itemKey, type, title, space, list, status };
      }),
    };
  }
}
