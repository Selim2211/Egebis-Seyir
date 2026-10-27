import { Injectable } from '@nestjs/common';
import {
  ANALYTICS_FLOW_AGES,
  formatItemKey,
  type AnalyticsFlow,
  type AnalyticsQuery,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import {
  addDays,
  DAY_MS,
  dayKey,
  dayStart,
  monthStart,
  percentile,
  round1,
  SCAN_LIMIT,
  spanOf,
  weekStart,
  type Span,
} from './analytics-util';

interface StatusInfo {
  name: string;
  category: string;
}
interface StatusEvent {
  at: number;
  from: string | null;
  to: string | null;
}
/** Bir işin bir durumda geçirdiği aralık (ms). */
interface Segment {
  statusId: string;
  start: number;
  end: number;
}

/** Gün sayısı olarak süre. */
const days = (ms: number) => ms / DAY_MS;

function stats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: round1(values.reduce((n, v) => n + v, 0) / values.length),
    median: round1(percentile(sorted, 0.5)!),
    p85: round1(percentile(sorted, 0.85)!),
  };
}

/**
 * Akış ve darboğaz analizi (ADR-144). Durum geçişleri `activity_events` içindeki `statusId` değişimlerinden okunur;
 * geçiş kaydı olmayan işlerde (eski/aktarılmış veri) gerçek bitirme süresi hesaplanamaz, yalnızca açılıştan bitişe
 * süre (lead) verilir. Aralığın dışında bitmiş ama aralıkta "Yapılıyor"da olan işler de WIP serisine dahil edilir.
 */
@Injectable()
export class AnalyticsFlowService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private async events(ids: string[]): Promise<Map<string, StatusEvent[]>> {
    const workspaceId = this.cls.get('workspaceId');
    const out = new Map<string, StatusEvent[]>();
    if (!workspaceId || ids.length === 0) return out;
    const rows = await this.prisma.$queryRaw<
      Array<{ itemId: string; at: Date; from: string | null; to: string | null }>
    >`
      select "entityId"::text as "itemId", "createdAt" as at,
             changes->'statusId'->>'from' as "from", changes->'statusId'->>'to' as "to"
      from activity_events
      where "workspaceId" = ${workspaceId}::uuid
        and "entityType" = 'item'
        and action = 'item.updated'
        and changes ? 'statusId'
        and "entityId" = any(${ids}::uuid[])
      order by "createdAt" asc
      limit ${SCAN_LIMIT}`;
    for (const r of rows) {
      const list = out.get(r.itemId) ?? [];
      list.push({ at: r.at.getTime(), from: r.from, to: r.to });
      out.set(r.itemId, list);
    }
    return out;
  }

  /** Durum geçişlerinden zaman çizelgesi; geçiş yoksa null (başlangıç durumu bilinmez). */
  private segments(
    createdAt: number,
    endAt: number,
    events: StatusEvent[] | undefined,
  ): Segment[] | null {
    if (!events || events.length === 0 || !events[0]!.from) return null;
    const out: Segment[] = [];
    let status = events[0]!.from;
    let start = createdAt;
    for (const e of events) {
      const at = Math.min(Math.max(e.at, start), endAt);
      out.push({ statusId: status, start, end: at });
      status = e.to ?? status;
      start = at;
    }
    out.push({ statusId: status, start, end: Math.max(endAt, start) });
    return out;
  }

  async flow(q: AnalyticsQuery, now = new Date()): Promise<AnalyticsFlow> {
    const w = spanOf(q, now);
    const nowMs = now.getTime();
    const db = this.tenant.db;
    const scope = q.spaceId ? { spaceId: q.spaceId } : {};
    const live = { deletedAt: null, space: { deletedAt: null } } as const;
    const types = { in: ['TASK', 'SUBTASK', 'BUG'] as ('TASK' | 'SUBTASK' | 'BUG')[] };

    const statusRows = await db.status.findMany({
      select: { id: true, name: true, category: true },
    });
    const statuses = new Map<string, StatusInfo>(statusRows.map((s) => [s.id, s]));

    const select = {
      id: true,
      title: true,
      keyPrefix: true,
      number: true,
      sprintId: true,
      createdAt: true,
      completedAt: true,
      status: { select: { id: true, name: true, category: true } },
      space: { select: { id: true, key: true, name: true, color: true } },
      assignees: { select: { user: { select: { name: true } } }, take: 1 },
    } as const;
    const completed = await db.workItem.findMany({
      where: {
        ...live,
        ...scope,
        type: types,
        status: { category: 'DONE' },
        completedAt: { gte: dayStart(w.prevFrom) },
      },
      select,
      take: SCAN_LIMIT,
    });
    const open = await db.workItem.findMany({
      where: { ...live, ...scope, type: types, status: { category: { not: 'DONE' } } },
      select,
      take: SCAN_LIMIT,
    });

    const history = await this.events([...completed, ...open].map((i) => i.id));

    // Tamamlananlar: bitirme süresi (ilk "Yapılıyor"a girişten bitişe) ve toplam süre.
    interface Done {
      day: string;
      sprintId: string | null;
      lead: number;
      cycle: number | null;
      hasHistory: boolean;
      segs: Segment[] | null;
    }
    const done: Done[] = completed.flatMap((i) => {
      if (!i.completedAt) return [];
      const end = i.completedAt.getTime();
      const segs = this.segments(i.createdAt.getTime(), end, history.get(i.id));
      const firstActive = segs?.find((s) => statuses.get(s.statusId)?.category === 'ACTIVE');
      return [
        {
          day: dayKey(i.completedAt),
          sprintId: i.sprintId,
          lead: days(end - i.createdAt.getTime()),
          cycle: firstActive ? days(Math.max(0, end - firstActive.start)) : null,
          hasHistory: segs !== null,
          segs,
        },
      ];
    });
    const inWindow = (d: Done, from: string, to: string) => d.day >= from && d.day <= to;
    const summary = (rows: Done[]) => ({
      done: rows.length,
      withHistory: rows.filter((r) => r.hasHistory).length,
      cycleDays: stats(rows.flatMap((r) => (r.cycle === null ? [] : [r.cycle]))),
      leadDays: stats(rows.map((r) => r.lead)),
    });
    const cur = done.filter((d) => inWindow(d, w.from, w.to));
    const prev = done.filter((d) => inWindow(d, w.prevFrom, w.prevTo));

    // Zaman noktaları (tamamlanma zamanına göre).
    const series = await this.series(w, cur);

    // Durumlarda bekleme: geçmişi kayıtlı, aralıkta biten işler; aynı ada sahip durumlar birleşir.
    const perStatus = new Map<string, { category: string; totals: number[] }>();
    for (const d of cur) {
      if (!d.segs) continue;
      const byName = new Map<string, { total: number; category: string }>();
      for (const s of d.segs) {
        const info = statuses.get(s.statusId);
        if (!info || info.category === 'DONE') continue;
        const e = byName.get(info.name) ?? { total: 0, category: info.category };
        e.total += days(s.end - s.start);
        byName.set(info.name, e);
      }
      for (const [name, v] of byName) {
        const entry = perStatus.get(name) ?? { category: v.category, totals: [] };
        entry.totals.push(v.total);
        perStatus.set(name, entry);
      }
    }
    const dwell = [...perStatus.entries()]
      .map(([status, v]) => ({
        status,
        category: v.category,
        avgDays: round1(v.totals.reduce((n, x) => n + x, 0) / v.totals.length),
        items: v.totals.length,
      }))
      .sort((a, b) => b.avgDays - a.avgDays);

    // WIP: şu an kesin; geçmiş seri yalnızca durum geçişi kayıtlı işlerden.
    const openWithSegs = open.map((i) => ({
      segs: this.segments(i.createdAt.getTime(), Number.POSITIVE_INFINITY, history.get(i.id)),
    }));
    const tracked = [...done.map((d) => d.segs), ...openWithSegs.map((o) => o.segs)].filter(
      (s): s is Segment[] => s !== null,
    );
    const step = w.from < addDays(w.to, -92) ? 7 : 1;
    const wipSeries: Array<{ day: string; count: number }> = [];
    for (let d = w.from; d <= w.to && wipSeries.length < 400; d = addDays(d, step)) {
      const t = dayStart(addDays(d, 1)).getTime() - 1;
      wipSeries.push({
        day: d,
        count: tracked.filter((segs) =>
          segs.some(
            (s) => statuses.get(s.statusId)?.category === 'ACTIVE' && s.start <= t && t < s.end,
          ),
        ).length,
      });
    }
    const current = open.filter((i) => i.status.category === 'ACTIVE');

    // Yaşlanma: "Yapılıyor"daki açık işlerin son hareketten beri geçen günü.
    const aged = current.map((i) => {
      const evs = history.get(i.id);
      const last = evs && evs.length > 0 ? evs[evs.length - 1]!.at : i.createdAt.getTime();
      return { item: i, days: Math.max(0, Math.floor((nowMs - last) / DAY_MS)) };
    });
    const bucketOf = (n: number) => (n <= 7 ? 0 : n <= 14 ? 1 : n <= 30 ? 2 : 3);
    const buckets = ANALYTICS_FLOW_AGES.map((bucket) => ({ bucket, count: 0 }));
    for (const a of aged) buckets[bucketOf(a.days)]!.count += 1;

    return {
      range: { ...w },
      totals: summary(cur),
      previous: summary(prev),
      series,
      dwell,
      wip: {
        current: current.length,
        average:
          tracked.length === 0 || wipSeries.length === 0
            ? null
            : round1(wipSeries.reduce((n, p) => n + p.count, 0) / wipSeries.length),
        series: wipSeries,
        trackedItems: tracked.length,
        totalItems: done.length + open.length,
      },
      aging: {
        buckets,
        stale: aged
          .sort((a, b) => b.days - a.days)
          .slice(0, 10)
          .map(({ item, days: n }) => ({
            id: item.id,
            key: formatItemKey(item.keyPrefix, item.number),
            title: item.title,
            space: item.space,
            status: item.status.name,
            days: n,
            assignee: item.assignees[0]?.user.name ?? null,
          })),
      },
    };
  }

  /** Hafta/ay: aralığın tamamı (boşlar sıfır). Sprint: bitirilen işlerin sprintleri. */
  private async series(
    w: Span,
    cur: Array<{ day: string; sprintId: string | null; lead: number; cycle: number | null }>,
  ): Promise<AnalyticsFlow['series']> {
    let buckets: Array<{ key: string; label: string; from: string | null }> = [];
    if (w.grain === 'sprint') {
      const ids = [...new Set(cur.map((d) => d.sprintId))];
      const real = ids.filter((id): id is string => id !== null);
      const sprints = await this.tenant.db.sprint.findMany({
        where: { id: { in: real } },
        select: { id: true, name: true, startDate: true },
        orderBy: { startDate: 'asc' },
      });
      buckets = [
        ...sprints.map((s) => ({
          key: s.id,
          label: s.name,
          from: s.startDate.toISOString().slice(0, 10),
        })),
        ...(ids.includes(null) ? [{ key: 'none', label: '—', from: null }] : []),
      ];
    } else {
      let cursor = w.grain === 'week' ? weekStart(w.from) : monthStart(w.from);
      while (cursor <= w.to && buckets.length < 400) {
        buckets.push({ key: cursor, label: cursor, from: cursor });
        if (w.grain === 'week') cursor = addDays(cursor, 7);
        else {
          const d = new Date(`${cursor}T12:00:00Z`);
          d.setUTCMonth(d.getUTCMonth() + 1);
          cursor = `${d.toISOString().slice(0, 7)}-01`;
        }
      }
    }
    const keyOf = (d: { day: string; sprintId: string | null }) =>
      w.grain === 'week'
        ? weekStart(d.day)
        : w.grain === 'month'
          ? monthStart(d.day)
          : (d.sprintId ?? 'none');
    return buckets.map((b) => {
      const rows = cur.filter((d) => keyOf(d) === b.key);
      const cycles = rows.flatMap((r) => (r.cycle === null ? [] : [r.cycle]));
      return {
        ...b,
        done: rows.length,
        cycleDays:
          cycles.length === 0 ? null : round1(cycles.reduce((n, v) => n + v, 0) / cycles.length),
        leadDays:
          rows.length === 0 ? null : round1(rows.reduce((n, r) => n + r.lead, 0) / rows.length),
      };
    });
  }
}
