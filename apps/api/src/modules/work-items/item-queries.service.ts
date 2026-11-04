import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ERROR_CODES,
  MY_SPRINT_WORK_SPRINTS,
  parseItemKey,
  SEARCH_LIMIT,
  SPACE_PERMISSIONS as S,
  type MySprintWorkResponse,
  type MyWorkResponse,
  type MyWorkScope,
  type SearchResponse,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { loadHiddenRoots } from '../../infra/prisma/item-visibility';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { rowInclude, toRow } from './item-support';

const MY_WORK_LIMIT = 500;
const MAX_QUERY_WORDS = 8;
const DOC_SEARCH_LIMIT = 8;

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
   * Bana atananlar → Proje görünümü (ADR-163): Projenin son sprint'leri (aktif ve tamamlananlar en
   * yeniden eskiye, yetmezse en yakın planlananlar) ve her birinde bana atanan işler. Alt görev
   * üst Task'ının sprint'inde sayılır; biten işler de gösterilir.
   */
  async mySprintWork(spaceId: string): Promise<MySprintWorkResponse> {
    const userId = this.cls.get('userId')!;
    if (!(await this.access.permissionsIn(spaceId))) {
      throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
    }
    const db = this.tenant.db;
    const all = await db.sprint.findMany({
      where: { spaceId, status: { not: 'CANCELLED' } },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
    });
    const started = all
      .filter((s) => s.status !== 'PLANNED')
      .sort(
        (a, b) =>
          Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') ||
          b.startDate.getTime() - a.startDate.getTime(),
      );
    const planned = all
      .filter((s) => s.status === 'PLANNED')
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const sprints = [...started, ...planned].slice(0, MY_SPRINT_WORK_SPRINTS);
    const ids = sprints.map((s) => s.id);
    const rows =
      ids.length === 0
        ? []
        : await db.workItem.findMany({
            where: {
              spaceId,
              deletedAt: null,
              archivedAt: null,
              list: { deletedAt: null },
              assignees: { some: { userId } },
              OR: [{ sprintId: { in: ids } }, { parent: { sprintId: { in: ids } } }],
            },
            include: { ...rowInclude, parent: { select: { sprintId: true } } },
            orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
            take: MY_WORK_LIMIT,
          });
    const day = (d: Date) => d.toISOString().slice(0, 10);
    return {
      sprints: sprints.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        startDate: day(s.startDate),
        endDate: day(s.endDate),
        items: rows.filter((r) => (r.sprintId ?? r.parent?.sprintId) === s.id).map((r) => toRow(r)),
      })),
    };
  }

  /**
   * Başlık ve açıklama (Türkçe FTS, ön ek eşleşmeli), başlık parçası (trigram) ve `MOB-12` kimliği.
   * Ham SQL: workspace ve görünür Space listesi açıkça verilir (ADR-053 istisnası).
   */
  async search(query: string): Promise<SearchResponse> {
    const q = query.trim().slice(0, 200);
    if (q.length === 0) return { items: [], docs: [] };
    const workspaceId = this.cls.get('workspaceId')!;
    const spaceIds = [...(await this.access.permissionMap({ deletedAt: null })).keys()];
    if (spaceIds.length === 0) return { items: [], docs: [] };

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

    const hidden = [...(await loadHiddenRoots(this.prisma, this.cls))];
    const hits = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT w."id"
      FROM "work_items" w
      JOIN "lists" l ON l."id" = w."listId" AND l."deletedAt" IS NULL
      JOIN "spaces" s ON s."id" = w."spaceId" AND s."deletedAt" IS NULL
      WHERE w."workspaceId" = ${workspaceId}::uuid
        AND w."spaceId" = ANY(${spaceIds}::uuid[])
        AND w."deletedAt" IS NULL
        AND w."archivedAt" IS NULL
        AND (w."accessRootId" IS NULL OR w."accessRootId" <> ALL(${hidden}::uuid[]))
        AND (${keyMatch} OR w."title" ILIKE ${contains} OR ${textMatch})
      ORDER BY
        CASE WHEN ${keyMatch} THEN 0 WHEN w."title" ILIKE ${startsWith} THEN 1 WHEN w."title" ILIKE ${contains} THEN 2 ELSE 3 END,
        w."createdAt" DESC
      LIMIT ${SEARCH_LIMIT}
    `);
    const docs = await this.searchDocs(workspaceId, q, words, spaceIds);
    if (hits.length === 0) return { items: [], docs };

    const rows = await this.tenant.db.workItem.findMany({
      where: { id: { in: hits.map((h) => h.id) } },
      include: rowInclude,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      docs,
      items: hits.flatMap(({ id }) => {
        const row = byId.get(id);
        if (!row) return [];
        const { key: itemKey, type, title, space, list, status } = toRow(row);
        return { id, key: itemKey, type, title, space, list, status };
      }),
    };
  }

  /** Doküman sayfaları: başlık (parça) ve metin (Türkçe FTS, ön ek); yalnızca `doc.view` izinli Space'ler. */
  private async searchDocs(
    workspaceId: string,
    q: string,
    words: string[],
    spaceIds: string[],
  ): Promise<SearchResponse['docs']> {
    const map = await this.access.permissionMap({ deletedAt: null });
    const viewable = spaceIds.filter((id) => map.get(id)?.includes(S.DOC_VIEW));
    if (viewable.length === 0) return [];
    const tsQuery = words.map((w) => `${w}:*`).join(' & ');
    const contains = `%${escapeLike(q)}%`;
    const startsWith = `${escapeLike(q)}%`;
    const textMatch =
      tsQuery === ''
        ? Prisma.sql`FALSE`
        : Prisma.sql`to_tsvector('turkish', d."title" || ' ' || d."plainText") @@ to_tsquery('turkish', ${tsQuery})`;
    const hits = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d."id"
      FROM "docs" d
      JOIN "spaces" s ON s."id" = d."spaceId" AND s."deletedAt" IS NULL
      WHERE d."workspaceId" = ${workspaceId}::uuid
        AND d."spaceId" = ANY(${viewable}::uuid[])
        AND d."deletedAt" IS NULL
        AND (d."title" ILIKE ${contains} OR ${textMatch})
      ORDER BY
        CASE WHEN d."title" ILIKE ${startsWith} THEN 0 WHEN d."title" ILIKE ${contains} THEN 1 ELSE 2 END,
        d."updatedAt" DESC
      LIMIT ${DOC_SEARCH_LIMIT}
    `);
    if (hits.length === 0) return [];
    const rows = await this.tenant.db.doc.findMany({
      where: { id: { in: hits.map((h) => h.id) } },
      select: {
        id: true,
        title: true,
        space: { select: { id: true, name: true, key: true, color: true, icon: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return hits.flatMap(({ id }) => byId.get(id) ?? []);
  }
}
