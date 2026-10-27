import { Injectable } from '@nestjs/common';
import {
  ANALYTICS_ROUTE_METHODS,
  BUG_SEVERITIES,
  formatItemKey,
  type AnalyticsQuality,
  type AnalyticsQuery,
  type AnalyticsRouteMethod,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import {
  calendarBuckets,
  DAY_MS,
  dayKey,
  dayStart,
  addDays,
  percentile,
  round1,
  SCAN_LIMIT,
  spanOf,
} from './analytics-util';

const avg = (values: number[]): number | null =>
  values.length === 0 ? null : round1(values.reduce((n, v) => n + v, 0) / values.length);
const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/** Atama gerekçesinden yöntem: `routeReason` öneki (ADR-140, ADR-141). */
function methodOf(reason: string | null): AnalyticsRouteMethod {
  const r = reason ?? '';
  if (r.startsWith('Kural:')) return 'rule';
  if (r.startsWith('Firma varsayılanı')) return 'company';
  if (r.startsWith('YZ:')) return 'ai';
  return 'unrouted';
}

/**
 * Kalite ve destek analizi (ADR-147): Bug açılış/çözüm eğrisi, önem derecesine göre çözüm süresi, proje ve firma
 * kırılımı, e-posta ilk yanıtı ve atama yönteminin doğruluğu (sonradan başka projeye taşınma oranı).
 */
@Injectable()
export class AnalyticsQualityService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Projeler arası taşıma olayları (`item.moved` + `spaceId` değişimi): iş → olay zamanları. */
  private async moves(ids: string[]): Promise<Map<string, number[]>> {
    const workspaceId = this.cls.get('workspaceId');
    const out = new Map<string, number[]>();
    if (!workspaceId || ids.length === 0) return out;
    const rows = await this.prisma.$queryRaw<Array<{ itemId: string; at: Date }>>`
      select "entityId"::text as "itemId", "createdAt" as at
      from activity_events
      where "workspaceId" = ${workspaceId}::uuid
        and "entityType" = 'item'
        and action = 'item.moved'
        and changes ? 'spaceId'
        and "entityId" = any(${ids}::uuid[])
      limit ${SCAN_LIMIT}`;
    for (const r of rows) out.set(r.itemId, [...(out.get(r.itemId) ?? []), r.at.getTime()]);
    return out;
  }

  async quality(q: AnalyticsQuery, now = new Date()): Promise<AnalyticsQuality> {
    const w = spanOf(q, now);
    const nowMs = now.getTime();
    const db = this.tenant.db;
    const scope = q.spaceId ? { spaceId: q.spaceId } : {};
    const live = { deletedAt: null, space: { deletedAt: null } } as const;
    const since = dayStart(w.prevFrom);

    const select = {
      id: true,
      title: true,
      keyPrefix: true,
      number: true,
      spaceId: true,
      severity: true,
      createdAt: true,
      completedAt: true,
      status: { select: { category: true } },
      space: { select: { id: true, key: true, name: true, color: true } },
      assignees: { select: { user: { select: { name: true } } }, take: 1 },
      inboundEmails: {
        where: { kind: 'NEW' as const },
        take: 1,
        select: {
          routeReason: true,
          receivedAt: true,
          rootCompany: { select: { id: true, name: true } },
        },
      },
    } as const;
    const recent = await db.workItem.findMany({
      where: {
        ...live,
        ...scope,
        type: 'BUG',
        OR: [{ createdAt: { gte: since } }, { completedAt: { gte: since } }],
      },
      select,
      take: SCAN_LIMIT,
    });
    const open = await db.workItem.findMany({
      where: { ...live, ...scope, type: 'BUG', status: { category: { not: 'DONE' } } },
      select,
      take: SCAN_LIMIT,
    });
    const created = await db.workItem.findMany({
      where: {
        ...live,
        ...scope,
        type: { in: ['TASK', 'SUBTASK', 'BUG'] },
        createdAt: { gte: dayStart(w.from), lt: dayStart(addDays(w.to, 1)) },
      },
      select: { spaceId: true, type: true },
      take: SCAN_LIMIT,
    });

    type Bug = (typeof recent)[number];
    const resolvedDay = (b: Bug) =>
      b.completedAt && b.status.category === 'DONE' ? dayKey(b.completedAt) : null;
    const resolveDays = (b: Bug) => (b.completedAt!.getTime() - b.createdAt.getTime()) / DAY_MS;
    const inRange = (day: string | null, from: string, to: string) =>
      day !== null && day >= from && day <= to;
    const openedIn = (from: string, to: string) =>
      recent.filter((b) => inRange(dayKey(b.createdAt), from, to));
    const resolvedIn = (from: string, to: string) =>
      recent.filter((b) => inRange(resolvedDay(b), from, to));

    const summary = (from: string, to: string) => {
      const res = resolvedIn(from, to);
      return {
        opened: openedIn(from, to).length,
        resolved: res.length,
        avgResolveDays: avg(res.map(resolveDays)),
      };
    };
    const curResolved = resolvedIn(w.from, w.to);
    const curOpened = openedIn(w.from, w.to);
    const sortedResolve = curResolved.map(resolveDays).sort((a, b) => a - b);
    const median = percentile(sortedResolve, 0.5);

    // Zaman serisi.
    const series = calendarBuckets(w).map((b) => {
      const o = curOpened.filter((x) => b.keyOf(dayKey(x.createdAt)) === b.key);
      const r = curResolved.filter((x) => b.keyOf(resolvedDay(x)!) === b.key);
      return {
        key: b.key,
        label: b.label,
        from: b.from,
        opened: o.length,
        resolved: r.length,
        avgResolveDays: avg(r.map(resolveDays)),
      };
    });

    // Önem derecesine göre.
    const bySeverity = BUG_SEVERITIES.map((severity) => {
      const r = curResolved.filter((b) => b.severity === severity);
      const op = open.filter((b) => b.severity === severity);
      const oldest = op.length === 0 ? null : Math.min(...op.map((b) => b.createdAt.getTime()));
      return {
        severity,
        opened: curOpened.filter((b) => b.severity === severity).length,
        resolved: r.length,
        avgResolveDays: avg(r.map(resolveDays)),
        openNow: op.length,
        oldestOpenDays: oldest === null ? null : Math.floor((nowMs - oldest) / DAY_MS),
      };
    });

    // Proje kırılımı.
    const spaceIds = [...new Set([...curOpened, ...curResolved, ...open].map((b) => b.spaceId))];
    const byProject = spaceIds
      .map((id) => {
        const space = [...recent, ...open].find((b) => b.spaceId === id)!.space;
        const r = curResolved.filter((b) => b.spaceId === id);
        const all = created.filter((c) => c.spaceId === id);
        return {
          space,
          opened: curOpened.filter((b) => b.spaceId === id).length,
          resolved: r.length,
          openNow: open.filter((b) => b.spaceId === id).length,
          avgResolveDays: avg(r.map(resolveDays)),
          bugSharePct: pct(all.filter((c) => c.type === 'BUG').length, all.length),
        };
      })
      .sort((a, b) => b.openNow - a.openNow || b.opened - a.opened);

    // E-posta Bug'ları: firma, ilk yanıt ve atama doğruluğu.
    const emailBugs = curOpened.filter((b) => b.inboundEmails.length > 0);
    const emailIds = emailBugs.map((b) => b.id);
    const outbound = emailIds.length
      ? await db.inboundEmail.findMany({
          where: { kind: 'OUTBOUND', workItemId: { in: emailIds } },
          select: { workItemId: true, receivedAt: true },
        })
      : [];
    const moves = await this.moves(emailIds);

    const companies = new Map<string, { name: string; bugs: Bug[] }>();
    for (const b of emailBugs) {
      const c = b.inboundEmails[0]!.rootCompany;
      if (!c) continue;
      const e = companies.get(c.id) ?? { name: c.name, bugs: [] };
      e.bugs.push(b);
      companies.set(c.id, e);
    }
    const byCompany = [...companies.entries()]
      .map(([id, c]) => {
        const resolved = c.bugs.filter((b) => b.completedAt && b.status.category === 'DONE');
        const firstReplies = c.bugs.flatMap((b) => {
          const mailAt = b.inboundEmails[0]!.receivedAt.getTime();
          const replies = outbound
            .filter((o) => o.workItemId === b.id && o.receivedAt.getTime() >= mailAt)
            .map((o) => o.receivedAt.getTime());
          return replies.length === 0 ? [] : [(Math.min(...replies) - mailAt) / 3_600_000];
        });
        return {
          id,
          name: c.name,
          bugs: c.bugs.length,
          resolved: resolved.length,
          openNow: c.bugs.length - resolved.length,
          avgResolveDays: avg(resolved.map(resolveDays)),
          avgFirstResponseHours: avg(firstReplies),
        };
      })
      .sort((a, b) => b.bugs - a.bugs || a.name.localeCompare(b.name, 'tr'))
      .slice(0, 8);

    const routing = ANALYTICS_ROUTE_METHODS.map((method) => {
      const mine = emailBugs.filter((b) => methodOf(b.inboundEmails[0]!.routeReason) === method);
      const moved = mine.filter((b) => {
        const mailAt = b.inboundEmails[0]!.receivedAt.getTime();
        return (moves.get(b.id) ?? []).some((t) => t >= mailAt);
      }).length;
      return { method, bugs: mine.length, moved, movedPct: pct(moved, mine.length) };
    });

    const critical = open
      .filter((b) => b.severity === 'CRITICAL' || b.severity === 'MAJOR')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, 10)
      .map((b) => ({
        id: b.id,
        key: formatItemKey(b.keyPrefix, b.number),
        title: b.title,
        severity: b.severity as 'CRITICAL' | 'MAJOR',
        space: b.space,
        days: Math.floor((nowMs - b.createdAt.getTime()) / DAY_MS),
        assignee: b.assignees[0]?.user.name ?? null,
      }));

    return {
      range: { ...w },
      totals: {
        ...summary(w.from, w.to),
        openNow: open.length,
        medianResolveDays: median === null ? null : round1(median),
        bugSharePct: pct(created.filter((c) => c.type === 'BUG').length, created.length),
      },
      previous: summary(w.prevFrom, w.prevTo),
      series,
      bySeverity,
      byProject,
      byCompany,
      routing,
      critical,
    };
  }
}
