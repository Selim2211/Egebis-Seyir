import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  type BugStatus,
  type BugsResponse,
  type CreateBugRequest,
  CreateBugRequestSchema,
  CreateWorkItemRequestSchema,
  type CreatedItem,
  ERROR_CODES,
  formatItemKey,
  SPACE_PERMISSIONS as S,
  type StatusCategory,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { notFound } from '../spaces/space-errors';
import { WorkItemsService } from './work-items.service';

/** Bug durumunun panodaki durum kategorisi karşılığı (ADR-117). */
const CATEGORY_OF: Record<BugStatus, StatusCategory> = {
  UNASSIGNED: 'NOT_STARTED',
  ASSIGNED: 'NOT_STARTED',
  IN_PROGRESS: 'ACTIVE',
  RESOLVED: 'DONE',
};

/**
 * Bug ekranı (ADR-117): Bug'ı açan kişi sahibidir (reporter); Bug'ı yalnızca `bug.assign` izni olan
 * (Product Owner, Scrum Master, Owner/Admin) birine atar. Durum: atanmadı → atandı → işleniyor → çözüldü.
 * Her adım bildirim (uygulama içi + e-posta) üretir.
 */
@Injectable()
export class BugsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly items: WorkItemsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  async list(spaceId: string): Promise<BugsResponse> {
    const person = { select: { id: true, name: true, avatarVersion: true } } as const;
    const rows = await this.tenant.db.workItem.findMany({
      where: {
        spaceId,
        type: 'BUG',
        deletedAt: null,
        archivedAt: null,
        list: { deletedAt: null },
      },
      include: { reporter: person, assignees: { select: { user: person }, take: 1 } },
      orderBy: [{ createdAt: 'desc' }],
      take: 1000,
    });
    return {
      bugs: rows.map((r) => ({
        id: r.id,
        key: formatItemKey(r.keyPrefix, r.number),
        title: r.title,
        listId: r.listId,
        bugStatus: r.bugStatus ?? (r.assignees.length > 0 ? 'ASSIGNED' : 'UNASSIGNED'),
        severity: r.severity,
        priority: r.priority,
        reporter: r.reporter,
        assignee: r.assignees[0]?.user ?? null,
        environment: r.environment,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  async create(spaceId: string, raw: CreateBugRequest): Promise<CreatedItem> {
    const input = CreateBugRequestSchema.parse(raw);
    const db = this.tenant.db;
    const list = await db.list.findFirst({
      where: {
        spaceId,
        deletedAt: null,
        archivedAt: null,
        ...(input.listId ? { id: input.listId } : {}),
      },
      orderBy: [{ folderId: { sort: 'asc', nulls: 'first' } }, { rank: 'asc' }],
      select: { id: true },
    });
    if (!list) throw notFound();
    const created = await this.items.create(
      list.id,
      CreateWorkItemRequestSchema.parse({
        type: 'BUG',
        title: input.title,
        severity: input.severity,
        priority: input.priority,
        stepsToReproduce: input.stepsToReproduce ?? null,
        expectedResult: input.expectedResult ?? null,
        actualResult: input.actualResult ?? null,
        environment: input.environment ?? null,
      }),
    );
    await this.notifications.dispatch({
      type: 'BUG_REPORTED',
      recipientIds: await this.triagers(spaceId),
      spaceId,
      item: { id: created.id, key: created.key, title: input.title },
    });
    return created;
  }

  /** Bug'ı atayacak kişiler: Owner/Admin ve Space'te `bug.assign` izni olan rollerdeki üyeler. */
  private async triagers(spaceId: string): Promise<string[]> {
    const db = this.tenant.db;
    const [admins, members] = await Promise.all([
      db.membership.findMany({
        where: { role: { key: { in: ['OWNER', 'ADMIN'] } } },
        select: { userId: true },
      }),
      db.spaceMember.findMany({
        where: { spaceId, role: { permissions: { has: S.BUG_ASSIGN } } },
        select: { userId: true },
      }),
    ]);
    return [...new Set([...admins, ...members].map((m) => m.userId))];
  }

  private async bug(itemId: string) {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, type: 'BUG', deletedAt: null },
      include: {
        status: { select: { category: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (!item) throw notFound();
    return item;
  }

  async setAssignee(itemId: string, userId: string | null): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const item = await this.bug(itemId);
    if (userId) {
      const member = await db.membership.findFirst({ where: { userId }, select: { id: true } });
      if (!member) throw notFound();
    }
    const before = item.assignees.map((a) => a.userId);
    if (before.length === (userId ? 1 : 0) && (userId === null || before[0] === userId)) return;
    const current = item.bugStatus ?? 'UNASSIGNED';
    const next: BugStatus = userId
      ? current === 'UNASSIGNED'
        ? 'ASSIGNED'
        : current
      : current === 'ASSIGNED'
        ? 'UNASSIGNED'
        : current;

    await db.$transaction(async (tx) => {
      await tx.workItemAssignee.deleteMany({ where: { workItemId: itemId } });
      if (userId) {
        await tx.workItemAssignee.create({ data: { workspaceId, workItemId: itemId, userId } });
        await tx.workItemWatcher.createMany({
          data: [{ workspaceId, workItemId: itemId, userId }],
          skipDuplicates: true,
        });
      }
      if (next !== current) {
        await tx.workItem.update({ where: { id: itemId }, data: { bugStatus: next } });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.updated',
        changes: {
          assigneeIds: { from: before, to: userId ? [userId] : [] },
          ...(next !== current ? { bugStatus: { from: current, to: next } } : {}),
        },
      });
    });
    const ref = { id: item.id, key: formatItemKey(item.keyPrefix, item.number), title: item.title };
    if (userId) {
      await this.notifications.dispatch({
        type: 'ASSIGNED',
        recipientIds: [userId],
        spaceId: item.spaceId,
        item: ref,
      });
    }
    if (next !== current) await this.notifyStatus(item, ref, next, userId ? [userId] : []);
  }

  async setStatus(itemId: string, status: BugStatus): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const item = await this.bug(itemId);
    const assignees = item.assignees.map((a) => a.userId);
    // Durumu Bug'ı atayan, yazma yetkisi olan ya da Bug'a atanmış kişi değiştirir.
    const allowed =
      this.can(S.BUG_ASSIGN) || this.can(S.WORK_ITEM_WRITE) || assignees.includes(actorId);
    if (!allowed) throw new ForbiddenException({ code: ERROR_CODES.BUG_STATUS_FORBIDDEN });
    const current = item.bugStatus ?? 'UNASSIGNED';
    if (current === status) return;

    // Panodaki durum da kategoriye göre güncellenir; kategori aynıysa dokunulmaz.
    const category = CATEGORY_OF[status];
    const target =
      item.status.category === category
        ? null
        : await db.status.findFirst({
            where: { spaceId: item.spaceId, category, archivedAt: null },
            orderBy: { rank: 'asc' },
            select: { id: true, name: true },
          });
    await db.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: itemId },
        data: {
          bugStatus: status,
          ...(target && {
            statusId: target.id,
            completedAt: category === 'DONE' ? new Date() : null,
          }),
        },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.updated',
        changes: {
          bugStatus: { from: current, to: status },
          ...(target ? { statusId: { from: item.statusId, to: target.id } } : {}),
        },
      });
    });
    const ref = { id: item.id, key: formatItemKey(item.keyPrefix, item.number), title: item.title };
    await this.notifyStatus(item, ref, status, assignees);
  }

  /** Durum değişikliği: Bug sahibi, atanan ve izleyenlere (uygulama içi + e-posta). */
  private async notifyStatus(
    item: { id: string; spaceId: string; reporterId: string | null },
    ref: { id: string; key: string; title: string },
    status: BugStatus,
    assignees: string[],
  ): Promise<void> {
    const watchers = await this.tenant.db.workItemWatcher.findMany({
      where: { workItemId: item.id },
      select: { userId: true },
    });
    await this.notifications.dispatch({
      type: 'BUG_STATUS',
      recipientIds: [
        ...(item.reporterId ? [item.reporterId] : []),
        ...assignees,
        ...watchers.map((w) => w.userId),
      ],
      spaceId: item.spaceId,
      item: ref,
      detail: status,
    });
  }
}
