import { Injectable } from '@nestjs/common';
import {
  checkSprintDates,
  ERROR_CODES,
  type Created,
  type CreateSprintRequest,
  formatItemKey,
  type SetReviewNotesRequest,
  type SprintReview,
  type SprintDetail,
  type SprintsResponse,
  type UpdateSprintRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../spaces/space-errors';
import {
  asJson,
  dateOnly,
  diff,
  fail,
  rowInclude,
  toDate,
  toRow,
} from '../work-items/item-support';
import { assertOpen, conflict, countedItems, loadScrumSpace, summarize } from './sprint-support';

/** Epic > Story > Task > Sub-task en fazla bu kadar iner. */
const MAX_TREE_DEPTH = 4;

/** Sprint oluşturma, düzenleme, silme ve okuma (Faz 2.1, ADR-061). Başlat/tamamla: 2.3. */
@Injectable()
export class SprintsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  async list(spaceId: string): Promise<SprintsResponse> {
    const db = this.tenant.db;
    await loadScrumSpace(db, spaceId, false);
    const sprints = await db.sprint.findMany({
      where: { spaceId },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    return { sprints: await summarize(db, sprints) };
  }

  /**
   * Sprint ve öğeleri. `tree` açıksa (Board) üst düzey öğelerin tüm alt öğeleri de, her üstün
   * hemen arkasında (derinlik önce) gelir; böylece Board kartları üstleriyle yan yana sıralanır.
   */
  async detail(sprintId: string, tree = false): Promise<SprintDetail> {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(db, sprint.spaceId, false);
    const [summary] = await summarize(db, [sprint]);
    const items = await db.workItem.findMany({
      where: { sprintId, ...countedItems },
      include: rowInclude,
      orderBy: [{ backlogRank: 'asc' }, { createdAt: 'asc' }],
    });
    if (!tree) return { sprint: summary!, items: items.map(toRow) };

    const children = new Map<string, typeof items>();
    let level = items.map((i) => i.id);
    for (let depth = 0; depth < MAX_TREE_DEPTH && level.length > 0; depth += 1) {
      const next = await db.workItem.findMany({
        where: { parentId: { in: level }, ...countedItems },
        include: rowInclude,
        orderBy: { rank: 'asc' },
      });
      for (const child of next) {
        const siblings = children.get(child.parentId!) ?? [];
        siblings.push(child);
        children.set(child.parentId!, siblings);
      }
      level = next.map((i) => i.id);
    }
    const flat: typeof items = [];
    const walk = (item: (typeof items)[number]) => {
      flat.push(item);
      for (const child of children.get(item.id) ?? []) walk(child);
    };
    items.forEach(walk);
    return { sprint: summary!, items: flat.map(toRow) };
  }

  async create(spaceId: string, input: CreateSprintRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    await loadScrumSpace(db, spaceId, true);
    return db.$transaction(async (tx) => {
      const sprint = await tx.sprint.create({
        data: {
          workspaceId,
          spaceId,
          name: input.name,
          goal: input.goal || null,
          startDate: toDate(input.startDate)!,
          endDate: toDate(input.endDate)!,
          capacityNote: input.capacityNote || null,
          createdById: actorId,
        },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'sprint',
        entityId: sprint.id,
        action: 'sprint.created',
        changes: asJson({ name: input.name, spaceId }),
      });
      return { id: sprint.id };
    });
  }

  async update(sprintId: string, input: UpdateSprintRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(db, sprint.spaceId, true);
    assertOpen(sprint);

    const startDate = input.startDate ?? dateOnly(sprint.startDate)!;
    const endDate = input.endDate ?? dateOnly(sprint.endDate)!;
    const datesChanged =
      startDate !== dateOnly(sprint.startDate) || endDate !== dateOnly(sprint.endDate);
    // Aktif sprint'in süresi sabittir (brief §6.1.2).
    if (datesChanged && sprint.status === 'ACTIVE') {
      throw conflict(ERROR_CODES.SPRINT_DATES_LOCKED);
    }
    if (datesChanged && checkSprintDates(startDate, endDate)) {
      throw fail(ERROR_CODES.VALIDATION_FAILED, 400);
    }

    const next = {
      name: input.name ?? sprint.name,
      goal: input.goal === undefined ? sprint.goal : input.goal || null,
      startDate,
      endDate,
      capacityNote:
        input.capacityNote === undefined ? sprint.capacityNote : input.capacityNote || null,
    };
    const changes = diff(
      {
        name: sprint.name,
        goal: sprint.goal,
        startDate: dateOnly(sprint.startDate),
        endDate: dateOnly(sprint.endDate),
        capacityNote: sprint.capacityNote,
      },
      next,
    );
    if (Object.keys(changes).length === 0) return;

    await db.$transaction(async (tx) => {
      await tx.sprint.update({
        where: { id: sprintId },
        data: { ...next, startDate: toDate(startDate)!, endDate: toDate(endDate)! },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.updated',
        changes: asJson(changes),
      });
    });
  }

  /**
   * Sprint Review özeti (brief §5.6): tamamlananlar, tamamlanmayanlar, kapsam değişiklikleri ve
   * demo notları. Kapanmış sprint'in bitmeyenleri çıkış olaylarından, açık sprint'in güncel durumdan gelir.
   */
  async review(sprintId: string): Promise<SprintReview> {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(db, sprint.spaceId, false);
    const [summary] = await summarize(db, [sprint]);
    const order = [{ backlogRank: 'asc' as const }, { createdAt: 'asc' as const }];

    const open = sprint.status === 'ACTIVE' || sprint.status === 'PLANNED';
    const [completed, unfinishedRows, events] = await Promise.all([
      db.workItem.findMany({
        where: { sprintId, ...countedItems, status: { category: 'DONE' } },
        include: rowInclude,
        orderBy: order,
      }),
      open
        ? db.workItem.findMany({
            where: { sprintId, ...countedItems, status: { category: { not: 'DONE' } } },
            include: rowInclude,
            orderBy: order,
          })
        : this.leftUnfinished(sprintId),
      db.sprintItemEvent.findMany({
        where: { sprintId, reason: 'SCOPE_CHANGE' },
        include: { workItem: { select: { id: true, keyPrefix: true, number: true, title: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      sprint: summary!,
      completed: completed.map(toRow),
      unfinished: unfinishedRows.map(toRow),
      scopeChanges: events.map((e) => ({
        action: e.action,
        at: e.createdAt.toISOString(),
        points: e.points,
        item: {
          id: e.workItem.id,
          key: formatItemKey(e.workItem.keyPrefix, e.workItem.number),
          title: e.workItem.title,
        },
      })),
      notes: sprint.reviewNotes,
    };
  }

  /** Kapanırken bitmemiş olarak çıkan öğelerin güncel satırları (artık başka yerde olabilir). */
  private async leftUnfinished(sprintId: string) {
    const db = this.tenant.db;
    const left = await db.sprintItemEvent.findMany({
      where: { sprintId, action: 'REMOVED', reason: 'UNFINISHED' },
      select: { workItemId: true },
    });
    if (left.length === 0) return [];
    return db.workItem.findMany({
      where: { id: { in: left.map((e) => e.workItemId) }, deletedAt: null },
      include: rowInclude,
      orderBy: [{ backlogRank: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Demo notları: tamamlanmış sprint'te de yazılabilir (değişiklik aktiviteye düşer). */
  async setReviewNotes(sprintId: string, input: SetReviewNotesRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(db, sprint.spaceId, true);
    const next = input.notes || null;
    if (next === sprint.reviewNotes) return;
    await db.$transaction(async (tx) => {
      await tx.sprint.update({ where: { id: sprintId }, data: { reviewNotes: next } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.updated',
        changes: asJson({
          reviewNotes: { from: sprint.reviewNotes ? 'edited' : null, to: next ? 'edited' : null },
        }),
      });
    });
  }

  /** Yalnızca planlı sprint silinir; öğeleri Backlog'a döner (brief §6.1.5: havada öğe kalmaz). */
  async remove(sprintId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(db, sprint.spaceId, true);
    if (sprint.status !== 'PLANNED') throw conflict(ERROR_CODES.SPRINT_NOT_PLANNED);
    await db.$transaction(async (tx) => {
      await tx.sprint.delete({ where: { id: sprintId } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'sprint',
        entityId: sprintId,
        action: 'sprint.deleted',
        changes: asJson({ name: sprint.name, spaceId: sprint.spaceId }),
      });
    });
  }
}
