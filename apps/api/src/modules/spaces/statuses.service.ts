import { HttpStatus, Injectable } from '@nestjs/common';
import {
  checkWorkflow,
  compareRank,
  type Created,
  type CreateStatusRequest,
  ERROR_CODES,
  nextCompletedAt,
  rankForPlacement,
  type UpdateStatusRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { fail } from '../work-items/item-support';
import { notFound } from './space-errors';

type Row = { id: string; name: string; category: 'NOT_STARTED' | 'ACTIVE' | 'DONE'; rank: string };

/**
 * Space durumları (Faz 5.2 WIP limiti, Faz 5.3 özel durum akışı, ADR-080/081).
 * Silinen durum arşivlenir (`archivedAt`): işler taşınır, kayıt eski aktivite/rapor eşlemesi için kalır.
 */
@Injectable()
export class StatusesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  /** Space'in etkin durumları, akış sırasıyla. */
  private async active(spaceId: string): Promise<Row[]> {
    const rows = await this.tenant.db.status.findMany({
      where: { spaceId, archivedAt: null, space: { deletedAt: null } },
      select: { id: true, name: true, category: true, rank: true },
    });
    if (rows.length === 0) throw notFound();
    return rows.sort(compareRank);
  }

  private assertWorkflow(rows: ReadonlyArray<Row>): void {
    const check = checkWorkflow(rows);
    if (!check.ok) throw fail(check.code, HttpStatus.CONFLICT);
  }

  private assertNameFree(rows: ReadonlyArray<Row>, name: string, exceptId?: string): void {
    const wanted = name.toLocaleLowerCase('tr');
    if (rows.some((r) => r.id !== exceptId && r.name.toLocaleLowerCase('tr') === wanted)) {
      throw fail(ERROR_CODES.STATUS_NAME_TAKEN, HttpStatus.CONFLICT);
    }
  }

  async create(spaceId: string, input: CreateStatusRequest): Promise<Created> {
    const { workspaceId } = this.ctx;
    const rows = await this.active(spaceId);
    this.assertNameFree(rows, input.name);
    const afterId = input.afterId === undefined ? (rows.at(-1)?.id ?? null) : input.afterId;
    const rank = rankForPlacement(rows, null, afterId);
    if (!rank) throw notFound();
    const index = afterId === null ? 0 : rows.findIndex((r) => r.id === afterId) + 1;
    this.assertWorkflow([
      ...rows.slice(0, index),
      { id: '', name: input.name, category: input.category, rank },
      ...rows.slice(index),
    ]);
    const status = await this.tenant.db.status.create({
      data: {
        workspaceId,
        spaceId,
        name: input.name,
        color: input.color,
        category: input.category,
        rank,
      },
      select: { id: true },
    });
    return { id: status.id };
  }

  async update(spaceId: string, statusId: string, input: UpdateStatusRequest): Promise<void> {
    const rows = await this.active(spaceId);
    const current = rows.find((r) => r.id === statusId);
    if (!current) throw notFound();
    if (input.name !== undefined) this.assertNameFree(rows, input.name, statusId);
    const categoryChanged = input.category !== undefined && input.category !== current.category;
    if (categoryChanged) {
      this.assertWorkflow(
        rows.map((r) => (r.id === statusId ? { ...r, category: input.category! } : r)),
      );
    }

    await this.tenant.db.$transaction(async (tx) => {
      await tx.status.update({
        where: { id: statusId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.wipLimit !== undefined && { wipLimit: input.wipLimit }),
        },
      });
      // Kategori değişince bu durumdaki işlerin tamamlanma zamanı tutarlı kalır.
      if (categoryChanged) {
        if (input.category === 'DONE') {
          await tx.workItem.updateMany({
            where: { statusId, completedAt: null },
            data: { completedAt: new Date() },
          });
        } else if (current.category === 'DONE') {
          await tx.workItem.updateMany({ where: { statusId }, data: { completedAt: null } });
        }
      }
    });
  }

  async move(spaceId: string, statusId: string, afterId: string | null): Promise<void> {
    const rows = await this.active(spaceId);
    if (!rows.some((r) => r.id === statusId)) throw notFound();
    const rank = rankForPlacement(rows, statusId, afterId);
    if (!rank) throw notFound();
    const others = rows.filter((r) => r.id !== statusId);
    const index = afterId === null ? 0 : others.findIndex((r) => r.id === afterId) + 1;
    const moved = rows.find((r) => r.id === statusId)!;
    this.assertWorkflow([...others.slice(0, index), { ...moved, rank }, ...others.slice(index)]);
    await this.tenant.db.status.update({ where: { id: statusId }, data: { rank } });
  }

  /** Durumu siler (arşivler); varsa işler `moveToId` durumuna taşınır. */
  async remove(spaceId: string, statusId: string, moveToId: string | undefined): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const rows = await this.active(spaceId);
    const target = rows.find((r) => r.id === statusId);
    if (!target) throw notFound();
    const rest = rows.filter((r) => r.id !== statusId);
    this.assertWorkflow(rest);

    const db = this.tenant.db;
    const items = await db.workItem.findMany({
      where: { statusId },
      select: { id: true, completedAt: true },
    });
    const destination = moveToId ? rest.find((r) => r.id === moveToId) : undefined;
    if (items.length > 0 && !destination) {
      throw fail(ERROR_CODES.STATUS_MOVE_TARGET_INVALID, HttpStatus.CONFLICT);
    }

    const now = new Date();
    await db.$transaction(async (tx) => {
      if (destination) {
        for (const item of items) {
          await tx.workItem.update({
            where: { id: item.id },
            data: {
              statusId: destination.id,
              completedAt: nextCompletedAt(
                target.category,
                destination.category,
                item.completedAt,
                now,
              ),
            },
          });
          await this.activity.record(tx, {
            workspaceId,
            actorId,
            entityType: 'item',
            entityId: item.id,
            action: 'item.updated',
            changes: {
              statusId: { from: statusId, to: destination.id },
              system: true,
            },
          });
        }
      }
      await tx.status.update({
        where: { id: statusId },
        data: { archivedAt: now, wipLimit: null },
      });
    });
  }
}
