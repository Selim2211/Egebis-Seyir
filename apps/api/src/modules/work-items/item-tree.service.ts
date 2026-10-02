import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BULK_MAX_ITEMS,
  compareRank,
  ERROR_CODES,
  formatItemKey,
  nextCompletedAt,
  rankBetween,
  rankForPlacement,
  SPACE_PERMISSIONS as S,
  type BulkUpdateRequest,
  type CopyItemRequest,
  type CreatedItem,
  type MoveItemRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { archivedParent, forbidden, notFound } from '../spaces/space-errors';
import { asJson, fail, type TenantTx } from './item-support';
import { WorkItemsService } from './work-items.service';

type Tx = TenantTx;
export type ItemLifecycleAction = 'archive' | 'unarchive' | 'delete' | 'restore';

const ACTIVITY_ACTION: Record<ItemLifecycleAction, string> = {
  archive: 'item.archived',
  unarchive: 'item.unarchived',
  delete: 'item.trashed',
  restore: 'item.restored',
};

/** Taşıma, kopyalama, arşiv/çöp ve toplu düzenleme (ADR-046, ADR-047). */
@Injectable()
export class ItemTreeService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
    private readonly items: WorkItemsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  /** Öğe ve tüm alt öğelerinin id'leri (silinmiş/arşivli dahil), kökten başlayarak. */
  private async subtree(
    db: Tx,
    rootId: string,
    only?: Prisma.WorkItemWhereInput,
  ): Promise<string[]> {
    const all = [rootId];
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await db.workItem.findMany({
        where: { parentId: { in: frontier }, ...only },
        select: { id: true },
      });
      frontier = children.map((c) => c.id);
      all.push(...frontier);
    }
    return all;
  }

  /** Hedef List'e yazma izni ve aktiflik kontrolü; Space bilgisini döner. */
  private async targetList(listId: string) {
    const list = await this.tenant.db.list.findFirst({
      where: { id: listId, deletedAt: null, space: { deletedAt: null } },
      include: {
        space: { select: { id: true, key: true, archivedAt: true } },
        folder: { select: { archivedAt: true } },
      },
    });
    if (!list) throw notFound();
    const perms = await this.access.permissionsIn(list.spaceId);
    if (!perms) throw notFound();
    if (!perms.includes(S.WORK_ITEM_WRITE)) throw forbidden(ERROR_CODES.FORBIDDEN);
    if (list.archivedAt || list.space.archivedAt || list.folder?.archivedAt) throw archivedParent();
    return list;
  }

  // ---------- Taşıma ----------

  async move(itemId: string, input: MoveItemRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({
      where: { id: itemId, deletedAt: null },
    });
    if (!item) throw notFound();
    const target = await this.targetList(input.listId);
    const crossSpace = target.spaceId !== item.spaceId;

    if (crossSpace && item.parentId && item.type === 'SUBTASK') {
      // Sub-task üst öğesiz var olamaz; önce üst öğe taşınmalı.
      throw fail(ERROR_CODES.WORK_ITEM_PARENT_REQUIRED);
    }

    await db.$transaction(async (tx) => {
      const ids = await this.subtree(tx, itemId, { deletedAt: null });
      const siblings = await tx.workItem.findMany({
        where: { listId: target.id, deletedAt: null, id: { notIn: ids } },
        select: { id: true, rank: true },
      });
      const rank = rankForPlacement(siblings.sort(compareRank), itemId, input.afterId ?? null);
      if (!rank) throw notFound();

      if (crossSpace) await this.remapAcrossSpaces(tx, ids, target.spaceId);
      await tx.workItem.updateMany({
        where: { id: { in: ids } },
        data: { listId: target.id, ...(crossSpace && { spaceId: target.spaceId }) },
      });
      await tx.workItem.update({
        where: { id: itemId },
        data: { rank, ...(crossSpace && { parentId: null }) },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.moved',
        changes: asJson({
          listId: { from: item.listId, to: target.id },
          ...(crossSpace && { spaceId: { from: item.spaceId, to: target.spaceId } }),
        }),
      });
    });
  }

  /**
   * Başka Space'e taşırken durumları (aynı kategori, mümkünse aynı ad) ve etiketleri
   * (aynı ad; yoksa düşer) hedefe eşler (ADR-047).
   */
  private async remapAcrossSpaces(tx: Tx, ids: string[], spaceId: string) {
    const [targetStatuses, rows] = await Promise.all([
      tx.status.findMany({ where: { spaceId }, orderBy: { rank: 'asc' } }),
      tx.workItem.findMany({
        where: { id: { in: ids } },
        include: { status: true, labels: { include: { label: true } } },
      }),
    ]);
    const targetLabels = await tx.label.findMany({ where: { spaceId } });
    const now = new Date();

    for (const row of rows) {
      const sameCategory = targetStatuses.filter((s) => s.category === row.status.category);
      const status =
        sameCategory.find((s) => s.name.toLowerCase() === row.status.name.toLowerCase()) ??
        sameCategory[0] ??
        targetStatuses[0]!;
      await tx.workItem.update({
        where: { id: row.id },
        data: {
          statusId: status.id,
          completedAt: nextCompletedAt(row.status.category, status.category, row.completedAt, now),
        },
      });
      await tx.workItemLabel.deleteMany({ where: { workItemId: row.id } });
      const mapped = row.labels
        .map((l) => targetLabels.find((t) => t.name.toLowerCase() === l.label.name.toLowerCase()))
        .filter((l) => l !== undefined);
      if (mapped.length > 0) {
        await tx.workItemLabel.createMany({
          data: mapped.map((l) => ({
            workItemId: row.id,
            labelId: l.id,
            workspaceId: row.workspaceId,
          })),
        });
      }
    }
  }

  // ---------- Kopyalama ----------

  async copy(itemId: string, input: CopyItemRequest): Promise<CreatedItem> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const source = await db.workItem.findFirst({
      where: { id: itemId, deletedAt: null },
      include: { labels: { include: { label: true } }, assignees: true },
    });
    if (!source) throw notFound();
    const target = await this.targetList(input.listId ?? source.listId);
    const crossSpace = target.spaceId !== source.spaceId;
    if (crossSpace && source.type === 'SUBTASK') throw fail(ERROR_CODES.WORK_ITEM_PARENT_REQUIRED);

    const firstStatus = await db.status.findFirstOrThrow({
      where: { spaceId: target.spaceId },
      orderBy: { rank: 'asc' },
    });
    const targetLabels = await db.label.findMany({ where: { spaceId: target.spaceId } });
    return db.$transaction(async (tx) => {
      const ids = input.includeChildren
        ? await this.subtree(tx, itemId, { deletedAt: null })
        : [itemId];
      const rows = await tx.workItem.findMany({
        where: { id: { in: ids } },
        include: {
          labels: { include: { label: true } },
          assignees: true,
          checklists: { include: { items: true } },
        },
      });
      // Kökten yaprağa sıra (üst öğe önce oluşsun).
      const order = new Map(ids.map((id, i) => [id, i]));
      rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

      const last = await tx.workItem.findFirst({
        where: { listId: target.id, deletedAt: null },
        orderBy: { rank: 'desc' },
        select: { rank: true },
      });
      const created = new Map<string, string>();
      let root: CreatedItem | null = null;

      for (const row of rows) {
        const counter = await tx.space.update({
          where: { id: target.spaceId },
          data: { itemCounter: { increment: 1 } },
          select: { itemCounter: true, key: true },
        });
        const isRoot = row.id === itemId;
        const parentId = isRoot
          ? crossSpace
            ? null
            : source.parentId
          : (created.get(row.parentId!) ?? null);
        const labels = crossSpace
          ? row.labels
              .map((l) =>
                targetLabels.find((t) => t.name.toLowerCase() === l.label.name.toLowerCase()),
              )
              .filter((l) => l !== undefined)
              .map((l) => l.id)
          : row.labels.map((l) => l.labelId);

        const copy = await tx.workItem.create({
          data: {
            workspaceId,
            spaceId: target.spaceId,
            listId: target.id,
            parentId,
            type: row.type,
            keyPrefix: counter.key,
            number: counter.itemCounter,
            title: row.title,
            statusId: firstStatus.id,
            priority: row.priority,
            reporterId: actorId,
            startDate: row.startDate,
            dueDate: row.dueDate,
            points: row.points,
            estimateHours: row.estimateHours,
            rank: isRoot ? rankBetween(last?.rank ?? null, null) : row.rank,
            severity: row.severity,
            stepsToReproduce: row.stepsToReproduce,
            expectedResult: row.expectedResult,
            actualResult: row.actualResult,
            environment: row.environment,
            foundInVersion: row.foundInVersion,
            goal: row.goal,
            tshirtSize: row.tshirtSize,
            color: row.color,
            assignees: {
              create: row.assignees.map((a) => ({ workspaceId, userId: a.userId })),
            },
            labels: { create: labels.map((labelId) => ({ workspaceId, labelId })) },
          },
        });
        created.set(row.id, copy.id);
        // Checklist'ler kopyalanır, maddeler işaretsiz gelir (ADR-049).
        for (const checklist of row.checklists) {
          await tx.checklist.create({
            data: {
              workspaceId,
              workItemId: copy.id,
              kind: checklist.kind,
              title: checklist.title,
              rank: checklist.rank,
              items: {
                create: checklist.items.map((i) => ({
                  workspaceId,
                  text: i.text,
                  rank: i.rank,
                })),
              },
            },
          });
        }
        const key = formatItemKey(copy.keyPrefix, copy.number);
        if (isRoot) root = { id: copy.id, key };
        await this.activity.record(tx, {
          workspaceId,
          actorId,
          entityType: 'item',
          entityId: copy.id,
          action: 'item.copied',
          changes: { key, from: formatItemKey(row.keyPrefix, row.number) },
        });
      }
      return root!;
    });
  }

  // ---------- Arşiv ve çöp kutusu (ADR-046) ----------

  /** Arşivle / arşivden çıkar / sil / geri getir; alt ağaç aynı zaman damgasıyla işlenir. */
  async change(itemId: string, action: ItemLifecycleAction): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.tenant.db.$transaction(async (tx) => {
      const item = await tx.workItem.findFirst({ where: { id: itemId } });
      if (!item) throw notFound();
      const now = new Date();

      if (action === 'delete' || action === 'archive') {
        if (item.deletedAt) throw notFound();
        const ids = await this.subtree(tx, itemId, { deletedAt: null });
        await tx.workItem.updateMany({
          where: action === 'delete' ? { id: { in: ids } } : { id: { in: ids }, archivedAt: null },
          data:
            action === 'delete' ? { deletedAt: now, deletedById: actorId } : { archivedAt: now },
        });
      } else if (action === 'restore') {
        if (!item.deletedAt) throw notFound();
        if (item.parentId) {
          // Üst öğe de aynı anda silindiyse önce o geri getirilir.
          const parent = await tx.workItem.findFirst({ where: { id: item.parentId } });
          if (parent?.deletedAt?.getTime() === item.deletedAt.getTime()) throw notFound();
        }
        const ids = await this.subtree(tx, itemId, { deletedAt: item.deletedAt });
        await tx.workItem.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: null, deletedById: null },
        });
      } else {
        if (item.deletedAt || !item.archivedAt) throw notFound();
        const ids = await this.subtree(tx, itemId, {
          archivedAt: item.archivedAt,
          deletedAt: null,
        });
        await tx.workItem.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } });
      }

      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: ACTIVITY_ACTION[action],
      });
    });
  }

  // ---------- Toplu düzenleme ----------

  async bulk(spaceId: string, input: BulkUpdateRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const ids = [...new Set(input.ids)].slice(0, BULK_MAX_ITEMS);
    const { patch } = input;

    const rows = await db.workItem.findMany({
      where: { id: { in: ids }, spaceId, deletedAt: null },
      include: {
        status: { select: { category: true } },
        assignees: { select: { userId: true } },
        labels: { select: { labelId: true } },
      },
    });
    if (rows.length !== ids.length) throw notFound();

    await this.items.validateRefs(
      spaceId,
      [...(patch.addAssigneeIds ?? []), ...(patch.removeAssigneeIds ?? [])],
      [...(patch.addLabelIds ?? []), ...(patch.removeLabelIds ?? [])],
    );
    const status = patch.statusId
      ? await db.status.findFirst({ where: { id: patch.statusId, spaceId } })
      : null;
    if (patch.statusId && !status) throw notFound();

    // Done'a çekilen öğelerde açık alt öğe uyarısı (ADR-046): tümü tek yanıtta bildirilir.
    if (status?.category === 'DONE' && !input.force) {
      const open = await db.workItem.count({
        where: {
          parentId: { in: rows.filter((r) => r.status.category !== 'DONE').map((r) => r.id) },
          deletedAt: null,
          archivedAt: null,
          status: { category: { not: 'DONE' } },
        },
      });
      if (open > 0) {
        throw fail(ERROR_CODES.WORK_ITEM_OPEN_CHILDREN, HttpStatus.CONFLICT, { count: open });
      }
    }

    const now = new Date();
    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const changes: Record<string, unknown> = {};
        const data: Prisma.WorkItemUncheckedUpdateInput = {};
        if (status && status.id !== row.statusId) {
          data.statusId = status.id;
          data.completedAt = nextCompletedAt(
            row.status.category,
            status.category,
            row.completedAt,
            now,
          );
          changes.statusId = { from: row.statusId, to: status.id };
        }
        if (patch.priority && patch.priority !== row.priority) {
          data.priority = patch.priority;
          changes.priority = { from: row.priority, to: patch.priority };
        }
        if (Object.keys(data).length > 0) await tx.workItem.update({ where: { id: row.id }, data });

        const addUsers = (patch.addAssigneeIds ?? []).filter(
          (u) => !row.assignees.some((a) => a.userId === u),
        );
        const removeUsers = (patch.removeAssigneeIds ?? []).filter((u) =>
          row.assignees.some((a) => a.userId === u),
        );
        if (addUsers.length) {
          await tx.workItemAssignee.createMany({
            data: addUsers.map((userId) => ({ workItemId: row.id, workspaceId, userId })),
            skipDuplicates: true,
          });
        }
        if (removeUsers.length) {
          await tx.workItemAssignee.deleteMany({
            where: { workItemId: row.id, userId: { in: removeUsers } },
          });
        }
        if (addUsers.length || removeUsers.length) {
          changes.assignees = { added: addUsers, removed: removeUsers };
        }

        const addLabels = (patch.addLabelIds ?? []).filter(
          (l) => !row.labels.some((x) => x.labelId === l),
        );
        const removeLabels = (patch.removeLabelIds ?? []).filter((l) =>
          row.labels.some((x) => x.labelId === l),
        );
        if (addLabels.length) {
          await tx.workItemLabel.createMany({
            data: addLabels.map((labelId) => ({ workItemId: row.id, workspaceId, labelId })),
            skipDuplicates: true,
          });
        }
        if (removeLabels.length) {
          await tx.workItemLabel.deleteMany({
            where: { workItemId: row.id, labelId: { in: removeLabels } },
          });
        }
        if (addLabels.length || removeLabels.length) {
          changes.labels = { added: addLabels, removed: removeLabels };
        }

        if (Object.keys(changes).length > 0) {
          await this.activity.record(tx, {
            workspaceId,
            actorId,
            entityType: 'item',
            entityId: row.id,
            action: 'item.updated',
            changes: asJson({ ...changes, bulk: true }),
          });
        }
      }
    });
  }
}
