import { Injectable } from '@nestjs/common';
import { addDays, formatItemKey, REPORT_TIME_ZONE, type EffortSheet } from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { dateOnly } from '../work-items/item-support';

const MAX_DAYS = 62;
const TOP_ITEMS = 10;
/** Puanı iki ondalığa yuvarlar (paylaştırılan puanlar kesirli olabilir). */
const round = (n: number) => Math.round(n * 100) / 100;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Story Point tabanlı zaman çizelgesi (ADR-164): seçili sprint'te kişi başına üstlenilen, biten ve
 * kalan puan; biten puan gün gün. Alt görevi olan Task'ın puanı alt görevlerin toplamı olduğundan
 * yalnızca yaprak işler sayılır; birden çok kişiye atanan işin puanı eşit paylaştırılır.
 */
@Injectable()
export class EffortService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async sheet(spaceId: string, sprintId: string): Promise<EffortSheet> {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({
      where: { id: sprintId, spaceId, space: { deletedAt: null } },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
    });
    if (!sprint) throw notFound();

    const items = await db.workItem.findMany({
      where: {
        spaceId,
        deletedAt: null,
        archivedAt: null,
        type: { not: 'EPIC' },
        OR: [{ sprintId }, { parent: { sprintId } }],
        children: { none: { deletedAt: null } },
      },
      select: {
        keyPrefix: true,
        number: true,
        title: true,
        points: true,
        completedAt: true,
        status: { select: { category: true } },
        assignees: {
          select: { user: { select: { id: true, name: true, avatarVersion: true } } },
        },
      },
    });

    const start = dateOnly(sprint.startDate)!;
    const end = dateOnly(sprint.endDate)!;
    const days: string[] = [];
    for (let d = start; d <= end && days.length < MAX_DAYS; d = addDays(d, 1)) days.push(d);
    const dayIndex = new Map(days.map((d, i) => [d, i]));

    type Row = EffortSheet['rows'][number];
    const rows = new Map<string, Row>();
    const dayTotals = days.map(() => 0);
    let committed = 0;
    let done = 0;
    let unassigned = 0;

    for (const item of items) {
      const points = item.points ?? 0;
      const finished = item.status.category === 'DONE';
      committed += points;
      if (finished) done += points;
      const day = finished && item.completedAt ? dayFormat.format(item.completedAt) : null;
      const index = day === null ? undefined : dayIndex.get(day);
      if (finished && index !== undefined) dayTotals[index]! += points;
      if (item.assignees.length === 0) {
        unassigned += points;
        continue;
      }
      const share = points / item.assignees.length;
      for (const { user } of item.assignees) {
        const row = rows.get(user.id) ?? {
          user,
          committed: 0,
          done: 0,
          remaining: 0,
          items: 0,
          doneItems: 0,
          perDay: days.map(() => 0),
        };
        row.committed += share;
        row.items += 1;
        if (finished) {
          row.done += share;
          row.doneItems += 1;
          if (index !== undefined) row.perDay[index]! += share;
        }
        rows.set(user.id, row);
      }
    }

    return {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        status: sprint.status,
        startDate: start,
        endDate: end,
      },
      days,
      rows: [...rows.values()]
        .map((r) => ({
          ...r,
          committed: round(r.committed),
          done: round(r.done),
          remaining: round(r.committed - r.done),
          perDay: r.perDay.map(round),
        }))
        .sort((a, b) => b.committed - a.committed || a.user.name.localeCompare(b.user.name)),
      dayTotals: dayTotals.map(round),
      committed: round(committed),
      done: round(done),
      unassigned: round(unassigned),
      topItems: items
        .filter((i) => (i.points ?? 0) > 0)
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .slice(0, TOP_ITEMS)
        .map((i) => ({
          key: formatItemKey(i.keyPrefix, i.number),
          title: i.title,
          points: i.points ?? 0,
          done: i.status.category === 'DONE',
          assignees: i.assignees.map((a) => a.user.name),
        })),
    };
  }
}
