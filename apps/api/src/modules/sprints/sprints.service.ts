import { Injectable } from '@nestjs/common';
import {
  checkSprintDates,
  ERROR_CODES,
  type Created,
  type CreateSprintRequest,
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
