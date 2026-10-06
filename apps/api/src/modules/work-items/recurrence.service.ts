import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  addDays,
  daysBetween,
  formatItemKey,
  nextSchedule,
  type RecurrenceRule,
} from '@scrum/shared';
import { Prisma } from '../../generated/prisma/client';
import { AutomationEvents, type DomainEventInput } from '../../infra/events/automation-events';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { asJson, dateOnly, toDate } from './item-support';
import { ItemTreeService } from './item-tree.service';

/**
 * Tekrarlayan görevler (Faz 7.1, ADR-093): kuralı olan öğe tamamlanınca (Done kategorisi) aynı
 * List'te yeni bir örnek üretilir; kural yeni örneğe geçer, böylece her zaman tek aktif örnek vardır.
 */
@Injectable()
export class RecurrenceService implements OnModuleInit {
  private readonly logger = new Logger(RecurrenceService.name);

  constructor(
    private readonly events: AutomationEvents,
    private readonly tenant: TenantPrismaService,
    private readonly tree: ItemTreeService,
    private readonly activity: ActivityService,
  ) {}

  onModuleInit(): void {
    this.events.register(async (event) => {
      if (event.type === 'STATUS_CHANGED') await this.onStatusChanged(event);
    });
  }

  private async onStatusChanged(event: Extract<DomainEventInput, { type: 'STATUS_CHANGED' }>) {
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({
      where: { id: event.itemId, deletedAt: null, archivedAt: null },
      include: { status: { select: { category: true } } },
    });
    if (!item?.recurrence || item.status.category !== 'DONE' || !item.dueDate) return;

    const rule = item.recurrence as unknown as RecurrenceRule;
    const today = new Date().toISOString().slice(0, 10);
    const oldDue = dateOnly(item.dueDate)!;
    const next = nextSchedule(
      { startDate: dateOnly(item.startDate), dueDate: oldDue },
      rule,
      today,
    );
    const shift = daysBetween(oldDue, next.dueDate);

    const created = await this.tree.copy(item.id, { includeChildren: true });
    await db.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: created.id },
        data: {
          startDate: toDate(next.startDate),
          dueDate: toDate(next.dueDate),
          recurrence: asJson(rule),
          reporterId: item.reporterId,
        },
      });
      // Alt öğelerin tarihleri de aynı miktarda kayar.
      const children = await tx.workItem.findMany({
        where: { parentId: created.id },
        select: { id: true, startDate: true, dueDate: true },
      });
      for (const child of children) {
        await tx.workItem.update({
          where: { id: child.id },
          data: {
            startDate: toDate(child.startDate && addDays(dateOnly(child.startDate)!, shift)),
            dueDate: toDate(child.dueDate && addDays(dateOnly(child.dueDate)!, shift)),
          },
        });
      }
      await tx.workItem.update({ where: { id: item.id }, data: { recurrence: Prisma.JsonNull } });
      await this.activity.record(tx, {
        workspaceId: item.workspaceId,
        actorId: null,
        entityType: 'item',
        entityId: created.id,
        action: 'item.recurred',
        changes: asJson({ key: formatItemKey(item.keyPrefix, item.number), dueDate: next.dueDate }),
      });
    });
    this.logger.log(`Tekrarlayan görev üretildi: ${created.key}`);
  }
}
