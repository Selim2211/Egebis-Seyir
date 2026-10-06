import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  formatItemKey,
  goalPercent,
  MAX_GOALS_PER_WORKSPACE,
  MAX_ITEMS_PER_GOAL,
  type CreateGoalData,
  type Created,
  type Goal,
  type GoalsResponse,
  type UpdateGoalRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { notFound } from '../spaces/space-errors';
import { dateOnly, fail, toDate } from '../work-items/item-support';

/**
 * Hedefler (Faz 7.9, ADR-097): workspace düzeyinde, görev bazlı veya sayısal. Free ClickUp gibi yalın:
 * Guest dışındaki her üye hedef oluşturur ve düzenler; ilerlemede yalnızca okuyanın görebildiği
 * Space'lerdeki görevler sayılır.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
  ) {}

  private assertMember(): void {
    if (this.cls.get('workspaceRole') === 'GUEST') {
      throw new ForbiddenException({ code: ERROR_CODES.FORBIDDEN });
    }
  }

  private async assertOwner(ownerId: string | null | undefined): Promise<void> {
    if (!ownerId) return;
    const member = await this.tenant.db.membership.findFirst({
      where: { userId: ownerId },
      select: { id: true },
    });
    if (!member) throw notFound();
  }

  async list(): Promise<GoalsResponse> {
    this.assertMember();
    const db = this.tenant.db;
    const [rows, visible] = await Promise.all([
      db.goal.findMany({
        include: {
          owner: { select: { id: true, name: true } },
          items: {
            include: {
              workItem: {
                select: {
                  id: true,
                  keyPrefix: true,
                  number: true,
                  type: true,
                  title: true,
                  spaceId: true,
                  deletedAt: true,
                  status: { select: { category: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.access.permissionMap({ deletedAt: null }),
    ]);
    const goals: Goal[] = rows.map((row) => {
      const live = row.items.filter((i) => !i.workItem.deletedAt);
      const shown = live.filter((i) => visible.has(i.workItem.spaceId));
      const items = shown.map(({ workItem: w }) => ({
        id: w.id,
        key: formatItemKey(w.keyPrefix, w.number),
        type: w.type,
        title: w.title,
        done: w.status.category === 'DONE',
      }));
      const percent =
        row.kind === 'TASKS'
          ? goalPercent({
              kind: 'TASKS',
              done: items.filter((i) => i.done).length,
              total: items.length,
            })
          : goalPercent({
              kind: 'NUMBER',
              start: row.startValue ?? 0,
              current: row.currentValue ?? row.startValue ?? 0,
              target: row.targetValue ?? 0,
            });
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        color: row.color,
        kind: row.kind,
        dueDate: dateOnly(row.dueDate),
        owner: row.owner,
        startValue: row.startValue,
        currentValue: row.currentValue,
        targetValue: row.targetValue,
        unit: row.unit,
        percent,
        items,
        hiddenItemCount: live.length - shown.length,
      };
    });
    return { goals };
  }

  async create(input: CreateGoalData): Promise<Created> {
    this.assertMember();
    const db = this.tenant.db;
    await this.assertOwner(input.ownerId);
    if ((await db.goal.count()) >= MAX_GOALS_PER_WORKSPACE) {
      throw fail(ERROR_CODES.GOAL_LIMIT, HttpStatus.CONFLICT);
    }
    const number = input.kind === 'NUMBER';
    const row = await db.goal.create({
      data: {
        workspaceId: this.cls.get('workspaceId'),
        name: input.name,
        description: input.description,
        color: input.color,
        kind: input.kind,
        dueDate: toDate(input.dueDate),
        ownerId: input.ownerId,
        startValue: number ? input.startValue : null,
        currentValue: number ? input.startValue : null,
        targetValue: number ? input.targetValue : null,
        unit: number ? input.unit : null,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async update(goalId: string, input: UpdateGoalRequest): Promise<void> {
    this.assertMember();
    const db = this.tenant.db;
    const goal = await db.goal.findFirst({ where: { id: goalId } });
    if (!goal) throw notFound();
    const numeric = [input.startValue, input.currentValue, input.targetValue, input.unit];
    if (goal.kind === 'TASKS' && numeric.some((v) => v !== undefined)) {
      throw fail(ERROR_CODES.GOAL_WRONG_KIND);
    }
    if (input.ownerId !== undefined) await this.assertOwner(input.ownerId);
    await db.goal.update({
      where: { id: goalId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.dueDate !== undefined && { dueDate: toDate(input.dueDate) }),
        ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
        ...(input.startValue !== undefined && { startValue: input.startValue }),
        ...(input.currentValue !== undefined && { currentValue: input.currentValue }),
        ...(input.targetValue !== undefined && { targetValue: input.targetValue }),
        ...(input.unit !== undefined && { unit: input.unit }),
      },
    });
  }

  async remove(goalId: string): Promise<void> {
    this.assertMember();
    const result = await this.tenant.db.goal.deleteMany({ where: { id: goalId } });
    if (result.count === 0) throw notFound();
  }

  async link(goalId: string, itemId: string): Promise<void> {
    this.assertMember();
    const db = this.tenant.db;
    const goal = await db.goal.findFirst({ where: { id: goalId } });
    if (!goal) throw notFound();
    if (goal.kind !== 'TASKS') throw fail(ERROR_CODES.GOAL_WRONG_KIND);
    const item = await db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      select: { id: true, spaceId: true },
    });
    const visible = item
      ? await this.access.permissionMap({ id: item.spaceId, deletedAt: null })
      : null;
    if (!item || !visible?.has(item.spaceId)) throw notFound();
    if ((await db.goalItem.count({ where: { goalId } })) >= MAX_ITEMS_PER_GOAL) {
      throw fail(ERROR_CODES.GOAL_LIMIT, HttpStatus.CONFLICT);
    }
    await db.goalItem.createMany({
      data: [{ goalId, workItemId: itemId, workspaceId: this.cls.get('workspaceId') }],
      skipDuplicates: true,
    });
  }

  async unlink(goalId: string, itemId: string): Promise<void> {
    this.assertMember();
    const result = await this.tenant.db.goalItem.deleteMany({
      where: { goalId, workItemId: itemId },
    });
    if (result.count === 0) throw notFound();
  }
}
