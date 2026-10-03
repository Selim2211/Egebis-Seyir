import { Injectable } from '@nestjs/common';
import { ERROR_CODES, type CompleteSprintRequest, sprintTotals } from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isUniqueViolation, notFound } from '../spaces/space-errors';
import { asJson, fail, type TenantTx } from '../work-items/item-support';
import { SprintReportsService } from './sprint-reports.service';
import { conflict, countedItems, loadScrumSpace } from './sprint-support';

/** Sprint başlatma, tamamlama ve iptal (Faz 2.3, brief §6.1, ADR-064). */
@Injectable()
export class SprintLifecycleService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly reports: SprintReportsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private async load(sprintId: string) {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    const space = await loadScrumSpace(db, sprint.spaceId, true);
    return { sprint, space };
  }

  /** Planlı → Aktif. Space başına tek aktif sprint; hedef zorunluluğu Space ayarına bağlı. */
  async start(sprintId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const { sprint } = await this.load(sprintId);
    if (sprint.status !== 'PLANNED') throw conflict(ERROR_CODES.SPRINT_NOT_PLANNED);

    const [active, settings, itemCount] = await Promise.all([
      db.sprint.findFirst({ where: { spaceId: sprint.spaceId, status: 'ACTIVE' } }),
      db.space.findFirstOrThrow({
        where: { id: sprint.spaceId },
        select: { sprintGoalRequired: true },
      }),
      db.workItem.count({ where: { sprintId, ...countedItems } }),
    ]);
    if (active) throw conflict(ERROR_CODES.SPRINT_ACTIVE_EXISTS, { name: active.name });
    if (settings.sprintGoalRequired && !sprint.goal?.trim()) {
      throw fail(ERROR_CODES.SPRINT_GOAL_REQUIRED);
    }

    const committed = await this.reports.liveTotals(sprintId);
    try {
      await db.$transaction(async (tx) => {
        await tx.sprint.update({
          where: { id: sprintId },
          data: { status: 'ACTIVE', startedAt: new Date(), committedPoints: committed.points },
        });
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'sprint',
          entityId: sprintId,
          action: 'sprint.started',
          changes: asJson({ name: sprint.name, itemCount, goal: sprint.goal }),
        });
      });
    } catch (error) {
      // Eşzamanlı iki başlatma: kısmi benzersiz dizin ikincisini reddeder.
      if (isUniqueViolation(error)) throw conflict(ERROR_CODES.SPRINT_ACTIVE_EXISTS);
      throw error;
    }
    await this.reports.capture({ id: sprintId, workspaceId });
    await this.notifySprint('SPRINT_STARTED', sprint);
  }

  /**
   * Aktif → Tamamlandı. Bitmeyen işler sonraki planlı sprint'e devredilir ya da Backlog'a
   * döner; hiçbiri havada kalmaz (brief §6.1.5). Velocity bu anda dondurulur (brief §6.1.7).
   */
  async complete(sprintId: string, input: CompleteSprintRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const { sprint } = await this.load(sprintId);
    if (sprint.status !== 'ACTIVE') throw conflict(ERROR_CODES.SPRINT_NOT_ACTIVE);

    const next =
      input.unfinished === 'NEXT_SPRINT'
        ? await db.sprint.findFirst({
            where: {
              id: input.nextSprintId!,
              spaceId: sprint.spaceId,
              status: 'PLANNED',
              NOT: { id: sprintId },
            },
          })
        : null;
    if (input.unfinished === 'NEXT_SPRINT' && !next) {
      throw fail(ERROR_CODES.SPRINT_NEXT_INVALID);
    }

    const items = await db.workItem.findMany({
      where: { sprintId, ...countedItems },
      select: { id: true, type: true, points: true, status: { select: { category: true } } },
    });
    const totals = sprintTotals(
      items.map((i) => ({ type: i.type, points: i.points, category: i.status.category })),
    );
    const unfinished = items.filter((i) => i.status.category !== 'DONE');

    // Son görüntü, bitmeyen işler sprint'ten çıkmadan alınır: burndown kalan işi gösterir.
    await this.reports.capture({ id: sprintId, workspaceId });

    await db.$transaction(async (tx) => {
      for (const item of unfinished) {
        await this.leave(tx, item, sprint, next);
      }
      await tx.sprint.update({
        where: { id: sprintId },
        data: { status: 'COMPLETED', completedAt: new Date(), completedPoints: totals.donePoints },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.completed',
        changes: asJson({
          name: sprint.name,
          doneItems: totals.doneItemCount,
          unfinishedItems: unfinished.length,
          completedPoints: totals.donePoints,
          unfinishedTo: next ? next.name : 'BACKLOG',
        }),
      });
    });
    await this.notifySprint('SPRINT_COMPLETED', sprint);
  }

  /** Planlı veya aktif sprint iptal edilir; öğeleri Backlog'a döner (brief §6.1.6). */
  async cancel(sprintId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const { sprint } = await this.load(sprintId);
    if (sprint.status !== 'PLANNED' && sprint.status !== 'ACTIVE') {
      throw conflict(ERROR_CODES.SPRINT_CANCEL_NOT_ALLOWED);
    }
    const items = await db.workItem.findMany({
      where: { sprintId, ...countedItems },
      select: { id: true, points: true },
    });

    await db.$transaction(async (tx) => {
      for (const item of items) await this.leave(tx, item, sprint, null);
      await tx.sprint.update({
        where: { id: sprintId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.cancelled',
        changes: asJson({ name: sprint.name, returnedItems: items.length }),
      });
    });
  }

  /**
   * Sprint başladı/bitti bildirimi: Space üyeleri ve sprint öğelerinin atananları (ADR-066).
   * Eylemi yapan ve Space'i göremeyenler serviste süzülür.
   */
  private async notifySprint(
    type: 'SPRINT_STARTED' | 'SPRINT_COMPLETED',
    sprint: { id: string; name: string; spaceId: string },
  ): Promise<void> {
    const db = this.tenant.db;
    const [members, assignees] = await Promise.all([
      db.spaceMember.findMany({ where: { spaceId: sprint.spaceId }, select: { userId: true } }),
      db.workItemAssignee.findMany({
        where: { workItem: { sprintId: sprint.id } },
        select: { userId: true },
      }),
    ]);
    await this.notifications.dispatch({
      type,
      recipientIds: [...members.map((m) => m.userId), ...assignees.map((a) => a.userId)],
      spaceId: sprint.spaceId,
      sprint: { id: sprint.id, name: sprint.name },
    });
  }

  /** Öğe kapanan sprint'ten çıkar: geçmiş + (varsa) devralan sprint + aktivite. */
  private async leave(
    tx: TenantTx,
    item: { id: string; points: number | null },
    from: { id: string; name: string },
    to: { id: string; name: string } | null,
  ): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await tx.workItem.update({ where: { id: item.id }, data: { sprintId: to?.id ?? null } });
    await tx.sprintItemEvent.create({
      data: {
        workspaceId,
        sprintId: from.id,
        workItemId: item.id,
        action: 'REMOVED',
        reason: 'UNFINISHED',
        points: item.points,
        actorId,
      },
    });
    if (to) {
      await tx.sprintItemEvent.create({
        data: {
          workspaceId,
          sprintId: to.id,
          workItemId: item.id,
          action: 'ADDED',
          reason: 'CARRIED_OVER',
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
      changes: asJson({ sprintId: { from: from.name, to: to?.name ?? null } }),
    });
  }
}
