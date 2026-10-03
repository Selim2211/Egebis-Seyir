import { Injectable } from '@nestjs/common';
import {
  CreateWorkItemRequestSchema,
  ERROR_CODES,
  formatItemKey,
  SPACE_PERMISSIONS as S,
  type CreateRetroItemRequest,
  type Created,
  type RetroResponse,
  type RetroTaskCreated,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { forbidden, notFound } from '../spaces/space-errors';
import { WorkItemsService } from '../work-items/work-items.service';
import { asJson } from '../work-items/item-support';
import { conflict, loadScrumSpace } from './sprint-support';

/** Sprint retrospektifi: maddeler, oylar ve aksiyondan görev (Faz 3.4, ADR-071). */
@Injectable()
export class RetroService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
    private readonly items: WorkItemsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  /** Retrospektif aktif ve tamamlanmış sprint'lerde yapılır; planlı/iptal edilmişte anlamsızdır. */
  private async loadSprint(sprintId: string, write: boolean) {
    const sprint = await this.tenant.db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(this.tenant.db, sprint.spaceId, write);
    if (sprint.status !== 'ACTIVE' && sprint.status !== 'COMPLETED') {
      throw conflict(ERROR_CODES.RETRO_NOT_AVAILABLE);
    }
    return sprint;
  }

  async get(sprintId: string): Promise<RetroResponse> {
    const { actorId } = this.ctx;
    const sprint = await this.loadSprint(sprintId, false);
    const rows = await this.tenant.db.retroItem.findMany({
      where: { sprintId },
      include: {
        author: { select: { id: true, name: true } },
        votes: { select: { userId: true } },
        task: {
          select: { id: true, keyPrefix: true, number: true, title: true, deletedAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const canModerate = this.can(S.SPRINT_COMPLETE);
    return {
      sprint: { id: sprint.id, name: sprint.name, spaceId: sprint.spaceId },
      canParticipate: this.can(S.WORK_ITEM_WRITE),
      items: rows
        .map((row) => ({
          id: row.id,
          column: row.column,
          text: row.text,
          author: row.author,
          votes: row.votes.length,
          voted: row.votes.some((v) => v.userId === actorId),
          task:
            row.task && !row.task.deletedAt
              ? {
                  id: row.task.id,
                  key: formatItemKey(row.task.keyPrefix, row.task.number),
                  title: row.task.title,
                }
              : null,
          canDelete: row.authorId === actorId || canModerate,
        }))
        // Çok oy alan üstte; eşitlikte eklenme sırası korunur (sıralama kararlı).
        .sort((a, b) => b.votes - a.votes),
    };
  }

  async add(sprintId: string, input: CreateRetroItemRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    const sprint = await this.loadSprint(sprintId, true);
    const created = await this.tenant.db.retroItem.create({
      data: { workspaceId, sprintId, column: input.column, text: input.text, authorId: actorId },
    });
    await this.activity.record(this.tenant.db, {
      workspaceId,
      actorId,
      entityType: 'sprint',
      entityId: sprintId,
      action: 'sprint.retro_item_added',
      changes: asJson({ name: sprint.name, column: input.column }),
    });
    return { id: created.id };
  }

  /** Yazar veya sprint'i yöneten (Scrum Master / PO) siler. */
  async remove(sprintId: string, retroItemId: string): Promise<void> {
    const { actorId } = this.ctx;
    await this.loadSprint(sprintId, true);
    const existing = await this.tenant.db.retroItem.findFirst({
      where: { id: retroItemId, sprintId },
    });
    if (!existing) throw notFound();
    if (existing.authorId !== actorId && !this.can(S.SPRINT_COMPLETE)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    await this.tenant.db.retroItem.delete({ where: { id: retroItemId } });
  }

  /** Oyu açar veya kapatır (kişi başına madde başına en çok bir oy). */
  async toggleVote(sprintId: string, retroItemId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.loadSprint(sprintId, true);
    const db = this.tenant.db;
    if (!(await db.retroItem.findFirst({ where: { id: retroItemId, sprintId } }))) {
      throw notFound();
    }
    const where = { retroItemId_userId: { retroItemId, userId: actorId } };
    if (await db.retroVote.findUnique({ where })) await db.retroVote.delete({ where });
    else await db.retroVote.create({ data: { workspaceId, retroItemId, userId: actorId } });
  }

  /** Aksiyon maddesini Space'in ilk List'inde bir Task'a çevirir (Backlog'a düşer). */
  async toTask(sprintId: string, retroItemId: string): Promise<RetroTaskCreated> {
    const { workspaceId, actorId } = this.ctx;
    const sprint = await this.loadSprint(sprintId, true);
    const db = this.tenant.db;
    const item = await db.retroItem.findFirst({ where: { id: retroItemId, sprintId } });
    if (!item) throw notFound();
    if (item.column !== 'ACTION') throw conflict(ERROR_CODES.RETRO_NOT_ACTION);
    if (item.taskId) {
      const existing = await db.workItem.findFirst({
        where: { id: item.taskId, deletedAt: null },
        select: { id: true },
      });
      if (existing) throw conflict(ERROR_CODES.RETRO_ALREADY_CONVERTED);
    }
    const list = await db.list.findFirst({
      where: { spaceId: sprint.spaceId, deletedAt: null, archivedAt: null },
      orderBy: { rank: 'asc' },
      select: { id: true },
    });
    if (!list) throw conflict(ERROR_CODES.RETRO_NO_LIST);

    const task = await this.items.create(
      list.id,
      CreateWorkItemRequestSchema.parse({ type: 'TASK', title: item.text }),
    );
    await db.retroItem.update({ where: { id: retroItemId }, data: { taskId: task.id } });
    await this.activity.record(db, {
      workspaceId,
      actorId,
      entityType: 'sprint',
      entityId: sprintId,
      action: 'sprint.retro_action_converted',
      changes: asJson({ name: sprint.name, taskId: task.id }),
    });
    return { id: task.id, key: task.key };
  }
}
