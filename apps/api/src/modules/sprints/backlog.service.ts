import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  formatItemKey,
  isSprintOpen,
  ranksAfter,
  ranksBetween,
  SPACE_PERMISSIONS as S,
  SPRINT_ITEM_TYPES,
  sprintEligibility,
  sprintMoveReason,
  type BacklogResponse,
  type MoveBacklogItemsRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { forbidden, notFound } from '../spaces/space-errors';
import { asJson, fail, rowInclude, toRow, type TenantTx } from '../work-items/item-support';
import { assertOpen, conflict, countedItems, loadScrumSpace, summarize } from './sprint-support';

const BACKLOG_LIMIT = 5000;

/** Sprint'e girebilen kayıtlar: üst düzey Story/Bug/Task (ADR-061). */
const eligibleShape = (spaceId: string): Prisma.WorkItemWhereInput => ({
  spaceId,
  type: { in: [...SPRINT_ITEM_TYPES] },
  OR: [{ parentId: null }, { parent: { type: 'EPIC' } }],
  ...countedItems,
  list: { deletedAt: null, archivedAt: null },
});

/** Backlog: sprint'e atanmamış, tamamlanmamış uygun öğeler (ADR-062). */
const backlogWhere = (spaceId: string): Prisma.WorkItemWhereInput => ({
  ...eligibleShape(spaceId),
  sprintId: null,
  status: { category: { not: 'DONE' } },
});

const byPriority = [{ backlogRank: 'asc' as const }, { createdAt: 'asc' as const }];

/** Product Backlog okuma, sıralama ve sprint'e taşıma (Faz 2.1, ADR-062). */
@Injectable()
export class BacklogService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  async backlog(spaceId: string): Promise<BacklogResponse> {
    const db = this.tenant.db;
    await loadScrumSpace(db, spaceId, false);
    await this.ensureRanks(db, spaceId);
    const [items, epics, labels, sprints] = await Promise.all([
      db.workItem.findMany({
        where: backlogWhere(spaceId),
        include: rowInclude,
        orderBy: byPriority,
        take: BACKLOG_LIMIT,
      }),
      db.workItem.findMany({
        where: { spaceId, type: 'EPIC', ...countedItems },
        select: { id: true, keyPrefix: true, number: true, title: true, color: true },
        orderBy: { rank: 'asc' },
      }),
      db.label.findMany({ where: { spaceId }, orderBy: { name: 'asc' } }),
      db.sprint.findMany({
        where: { spaceId, status: { in: ['PLANNED', 'ACTIVE'] } },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    return {
      items: items.map(toRow),
      epics: epics.map((e) => ({
        id: e.id,
        key: formatItemKey(e.keyPrefix, e.number),
        title: e.title,
        color: e.color,
      })),
      labels: labels.map(({ id, name, color }) => ({ id, name, color })),
      sprints: await summarize(db, sprints),
    };
  }

  /**
   * Öğeleri Backlog'a (`sprintId = null`) veya açık bir sprint'e taşır / konumunu değiştirir.
   * Kapsayıcı değişiyorsa `sprint.plan`, yalnızca sıra değişiyorsa `backlog.rank` gerekir.
   */
  async move(spaceId: string, input: MoveBacklogItemsRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    await loadScrumSpace(db, spaceId, true);
    // Sırası boş öğeler, aşağıda okunmadan önce sıralanmalı; yoksa mevcut sıra yanlışlıkla boş yazılır.
    await this.ensureRanks(db, spaceId);

    const ids = [...new Set(input.itemIds)];
    const items = await db.workItem.findMany({
      where: { id: { in: ids }, spaceId, ...countedItems },
      include: {
        status: { select: { category: true } },
        parent: { select: { type: true } },
        sprint: { select: { id: true, name: true, status: true } },
      },
    });
    if (items.length !== ids.length) throw notFound();
    for (const item of items) {
      const reason = sprintEligibility({
        type: item.type,
        parentType: item.parent?.type ?? null,
        category: item.status.category,
      });
      // Tamamlanmış öğe zaten sprint'teyse ve olduğu yerde sıralanıyorsa sorun yok.
      if (reason && !(reason === 'DONE' && item.sprintId === input.sprintId)) {
        throw fail(ERROR_CODES.SPRINT_ITEM_NOT_ELIGIBLE, 422, { itemId: item.id, reason });
      }
      if (item.sprint && !isSprintOpen(item.sprint.status)) {
        throw conflict(ERROR_CODES.SPRINT_READONLY);
      }
    }

    const target = input.sprintId
      ? await db.sprint.findFirst({ where: { id: input.sprintId, spaceId } })
      : null;
    if (input.sprintId && !target) throw notFound();
    if (target) assertOpen(target);

    const containerChanged = items.some((i) => i.sprintId !== input.sprintId);
    if (!this.can(containerChanged ? S.SPRINT_PLAN : S.BACKLOG_RANK)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    // Kapsayıcı aynı ve konum verilmediyse yapılacak bir şey yok.
    if (!containerChanged && input.afterId === undefined) return;

    await db.$transaction(async (tx) => {
      await this.ensureRanks(tx, spaceId);
      const ordered = ids.map((id) => items.find((i) => i.id === id)!);

      let ranks: Array<string | null>;
      if (input.afterId === undefined) {
        // Öncelik sırası korunur: öğe önceliğiyle birlikte yeni kapsayıcıya geçer.
        ranks = ordered.map((i) => i.backlogRank);
      } else {
        const siblings = await tx.workItem.findMany({
          where: {
            ...(input.sprintId
              ? { sprintId: input.sprintId, ...countedItems }
              : backlogWhere(spaceId)),
            id: { notIn: ids },
          },
          select: { id: true, backlogRank: true },
          orderBy: byPriority,
        });
        let before: string | null = null;
        let after: string | null = siblings[0]?.backlogRank ?? null;
        if (input.afterId !== null) {
          const index = siblings.findIndex((s) => s.id === input.afterId);
          if (index === -1) throw notFound();
          before = siblings[index]!.backlogRank;
          after = siblings[index + 1]?.backlogRank ?? null;
        }
        ranks = ranksBetween(before, after, ordered.length);
      }

      for (const [index, item] of ordered.entries()) {
        await tx.workItem.update({
          where: { id: item.id },
          data: { sprintId: input.sprintId, backlogRank: ranks[index] ?? null },
        });
        if (item.sprintId === input.sprintId) continue;
        await this.recordMembership(tx, item, target, workspaceId, actorId);
      }
    });
  }

  /** Sprint üyeliği geçmişi + aktivite (ADR-061). */
  private async recordMembership(
    tx: TenantTx,
    item: {
      id: string;
      points: number | null;
      sprintId: string | null;
      sprint: {
        id: string;
        name: string;
        status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      } | null;
    },
    target: {
      id: string;
      name: string;
      status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    } | null,
    workspaceId: string,
    actorId: string,
  ): Promise<void> {
    if (item.sprint) {
      await tx.sprintItemEvent.create({
        data: {
          workspaceId,
          sprintId: item.sprint.id,
          workItemId: item.id,
          action: 'REMOVED',
          reason: sprintMoveReason(item.sprint.status),
          points: item.points,
          actorId,
        },
      });
    }
    if (target) {
      await tx.sprintItemEvent.create({
        data: {
          workspaceId,
          sprintId: target.id,
          workItemId: item.id,
          action: 'ADDED',
          reason: sprintMoveReason(target.status),
          points: item.points,
          actorId,
        },
      });
    }
    await this.activity.record(tx, {
      workspaceId,
      actorId,
      entityType: 'item',
      entityId: item.id,
      action: 'item.updated',
      changes: asJson({ sprintId: { from: item.sprint?.name ?? null, to: target?.name ?? null } }),
    });
  }

  /**
   * Sırası henüz atanmamış öğelere (eski veya yeni oluşturulmuş) oluşturulma sırasıyla,
   * mevcut en son sıranın arkasından anahtar verir. Idempotent; okumada çağrılır.
   */
  private async ensureRanks(db: TenantTx, spaceId: string): Promise<void> {
    const missing = await db.workItem.findMany({
      where: { spaceId, backlogRank: null, type: { in: [...SPRINT_ITEM_TYPES] }, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (missing.length === 0) return;
    const last = await db.workItem.findFirst({
      where: { spaceId, backlogRank: { not: null } },
      orderBy: { backlogRank: 'desc' },
      select: { backlogRank: true },
    });
    const ranks = ranksAfter(last?.backlogRank ?? null, missing.length);
    for (const [index, { id }] of missing.entries()) {
      await db.workItem.update({ where: { id }, data: { backlogRank: ranks[index]! } });
    }
  }
}
