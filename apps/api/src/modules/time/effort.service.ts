import { Injectable } from '@nestjs/common';
import {
  addDays,
  formatItemKey,
  REPORT_TIME_ZONE,
  type EffortSheet,
  type MemberProfile,
} from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { dateOnly } from '../work-items/item-support';

const MAX_DAYS = 62;
const PROFILE_SPRINTS = 12;
const PROFILE_OPEN_ITEMS = 30;
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

  /**
   * Kişinin Projedeki profili (ADR-165): son sprint'lerde üstlendiği ve bitirdiği puan, sprint'in
   * atanmış puanındaki payı, açık işleri ve toplamlar. Puan kuralları `sheet` ile aynıdır.
   */
  async profile(spaceId: string, userId: string): Promise<MemberProfile> {
    const db = this.tenant.db;
    const [user, member] = await Promise.all([
      db.membership.findFirst({
        where: { userId },
        select: { user: { select: { id: true, name: true, title: true, avatarVersion: true } } },
      }),
      db.spaceMember.findFirst({
        where: { spaceId, userId },
        select: { role: { select: { key: true } } },
      }),
    ]);
    if (!user) throw notFound();

    const sprints = await db.sprint.findMany({
      where: { spaceId, status: { not: 'CANCELLED' } },
      orderBy: { startDate: 'desc' },
      take: PROFILE_SPRINTS,
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
    });
    const sprintIds = sprints.map((s) => s.id);
    const leaf = {
      spaceId,
      deletedAt: null,
      archivedAt: null,
      type: { not: 'EPIC' as const },
      children: { none: { deletedAt: null } },
    };
    const [sprintItems, mine] = await Promise.all([
      db.workItem.findMany({
        where: {
          ...leaf,
          OR: [{ sprintId: { in: sprintIds } }, { parent: { sprintId: { in: sprintIds } } }],
          assignees: { some: {} },
        },
        select: {
          points: true,
          sprintId: true,
          parent: { select: { sprintId: true } },
          status: { select: { category: true } },
          assignees: { select: { userId: true } },
        },
      }),
      db.workItem.findMany({
        where: { ...leaf, assignees: { some: { userId } } },
        orderBy: [{ backlogRank: 'asc' }, { createdAt: 'asc' }],
        select: {
          keyPrefix: true,
          number: true,
          type: true,
          title: true,
          points: true,
          bugStatus: true,
          status: { select: { name: true, color: true, category: true } },
          sprint: { select: { name: true } },
          parent: { select: { sprint: { select: { name: true } } } },
          assignees: { select: { userId: true } },
        },
      }),
    ]);

    const perSprint = new Map(
      sprintIds.map((id) => [id, { committed: 0, done: 0, items: 0, doneItems: 0, total: 0 }]),
    );
    for (const item of sprintItems) {
      const row = perSprint.get((item.sprintId ?? item.parent?.sprintId)!);
      if (!row) continue;
      const points = item.points ?? 0;
      row.total += points;
      if (!item.assignees.some((a) => a.userId === userId)) continue;
      const share = points / item.assignees.length;
      const finished = item.status.category === 'DONE';
      row.committed += share;
      row.items += 1;
      if (finished) {
        row.done += share;
        row.doneItems += 1;
      }
    }

    const share = (item: { points: number | null; assignees: unknown[] }) =>
      (item.points ?? 0) / Math.max(item.assignees.length, 1);
    const done = mine.filter((i) => i.status.category === 'DONE');
    const open = mine.filter((i) => i.status.category !== 'DONE');
    return {
      user: user.user,
      role: member?.role.key ?? null,
      totals: {
        doneItems: done.length,
        donePoints: round(done.reduce((sum, i) => sum + share(i), 0)),
        openItems: open.length,
        openPoints: round(open.reduce((sum, i) => sum + share(i), 0)),
        resolvedBugs: mine.filter((i) => i.type === 'BUG' && i.bugStatus === 'RESOLVED').length,
      },
      sprints: sprints.map((s) => {
        const row = perSprint.get(s.id)!;
        return {
          id: s.id,
          name: s.name,
          status: s.status,
          startDate: dateOnly(s.startDate)!,
          endDate: dateOnly(s.endDate)!,
          committed: round(row.committed),
          done: round(row.done),
          items: row.items,
          doneItems: row.doneItems,
          share: row.total > 0 ? round(row.committed / row.total) : 0,
        };
      }),
      openItems: open.slice(0, PROFILE_OPEN_ITEMS).map((i) => ({
        key: formatItemKey(i.keyPrefix, i.number),
        type: i.type,
        title: i.title,
        points: i.points,
        status: i.status,
        sprint: i.sprint?.name ?? i.parent?.sprint?.name ?? null,
      })),
    };
  }
}
