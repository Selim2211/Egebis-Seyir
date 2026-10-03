import { Injectable } from '@nestjs/common';
import {
  addDays,
  countByWeek,
  cumulativeFlow,
  cycleStats,
  ERROR_CODES,
  FLOW_DEFAULT_DAYS,
  FLOW_MAX_DAYS,
  FLOW_MIN_DAYS,
  localDate,
  REPORT_TIME_ZONE,
  type Flow,
  type FlowItem,
  type StatusCategory,
} from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { fail } from '../work-items/item-support';

interface StatusChange {
  statusId?: { from?: string | null; to?: string | null };
}

/** Akış raporları: CFD, throughput, lead/cycle time, bug trendi (Faz 4.6, ADR-078). */
@Injectable()
export class FlowService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async flow(spaceId: string, days = FLOW_DEFAULT_DAYS): Promise<Flow> {
    if (days < FLOW_MIN_DAYS || days > FLOW_MAX_DAYS) throw fail(ERROR_CODES.TIME_RANGE_INVALID);
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();

    const to = localDate(new Date(), REPORT_TIME_ZONE);
    const from = addDays(to, -(days - 1));
    const day = (date: Date) => localDate(date, REPORT_TIME_ZONE);

    const [statuses, items] = await Promise.all([
      db.status.findMany({ where: { spaceId }, select: { id: true, category: true } }),
      db.workItem.findMany({
        where: { spaceId, deletedAt: null, type: { not: 'EPIC' } },
        select: {
          id: true,
          type: true,
          createdAt: true,
          completedAt: true,
          status: { select: { category: true } },
        },
      }),
    ]);
    const category = new Map<string, StatusCategory>(statuses.map((s) => [s.id, s.category]));

    const events = await db.activityEvent.findMany({
      where: {
        entityType: 'item',
        action: 'item.updated',
        entityId: { in: items.map((i) => i.id) },
      },
      select: { entityId: true, createdAt: true, changes: true },
      orderBy: { createdAt: 'asc' },
    });
    const byItem = new Map<
      string,
      Array<{ day: string; from: StatusCategory | null; to: StatusCategory }>
    >();
    for (const event of events) {
      const change = (event.changes as StatusChange | null)?.statusId;
      const toCategory = change?.to ? category.get(change.to) : undefined;
      if (!toCategory) continue;
      const fromCategory = change?.from ? (category.get(change.from) ?? null) : null;
      byItem.set(event.entityId, [
        ...(byItem.get(event.entityId) ?? []),
        { day: day(event.createdAt), from: fromCategory, to: toCategory },
      ]);
    }

    const flowItems: FlowItem[] = items.map((item) => {
      const changes = byItem.get(item.id) ?? [];
      const current = item.status.category;
      return {
        id: item.id,
        type: item.type,
        createdDay: day(item.createdAt),
        completedDay: current === 'DONE' && item.completedAt ? day(item.completedAt) : null,
        initialCategory: changes[0]?.from ?? current,
        transitions: changes.map((c) => ({ day: c.day, category: c.to })),
      };
    });

    const bugs = flowItems.filter((i) => i.type === 'BUG');
    return {
      from,
      to,
      cfd: cumulativeFlow(flowItems, from, to),
      throughput: countByWeek(
        flowItems.map((i) => i.completedDay),
        from,
        to,
      ),
      bugs: {
        opened: countByWeek(
          bugs.map((b) => b.createdDay),
          from,
          to,
        ),
        closed: countByWeek(
          bugs.map((b) => b.completedDay),
          from,
          to,
        ),
      },
      cycle: cycleStats(flowItems, from, to),
    };
  }
}
