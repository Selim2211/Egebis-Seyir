import { Injectable } from '@nestjs/common';
import type { AnalyticsCapacity, AnalyticsCapacityQuery } from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { addDays, dayKey, round1, SCAN_LIMIT, spanOf, weekStart } from './analytics-util';

/** Isı haritasında en çok kaç gün döner. */
const HEATMAP_DAYS = 183;
/** Kalan tahmin bu kadar haftalık kapasiteyi aşarsa kişi "aşırı yüklü" sayılır. */
const OVERLOAD_WEEKS = 2;

/** Gün anahtarının haftanın günü: 0 = Pazartesi … 6 = Pazar. */
const weekday = (key: string) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/**
 * İş yükü ve kapasite (ADR-146). Kapasite ayrıca kayıtlı değildir: haftalık çalışma saati sorguyla gelir (varsayılan
 * 40) ve hafta içi günlere (Pzt–Cum) bölünür. Zaman kayıtlarında yalnızca gün vardır, saat bilgisi yoktur; bu yüzden
 * ısı haritası haftanın günü ve takvim günü bazlıdır.
 */
@Injectable()
export class AnalyticsCapacityService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async capacity(q: AnalyticsCapacityQuery, now = new Date()): Promise<AnalyticsCapacity> {
    const w = spanOf(q, now);
    const db = this.tenant.db;
    const scope = q.spaceId ? { spaceId: q.spaceId } : {};
    const perDay = q.weeklyHours / 5;

    // Aralıktaki hafta içi günler.
    const days: string[] = [];
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) days.push(d);
    const workdays = days.filter((d) => weekday(d) < 5);
    const capacityEach = round1(perDay * workdays.length);

    const members = await db.membership.findMany({ select: { userId: true } });
    const users = await db.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, name: true, avatarVersion: true },
    });

    const entries = await db.timeEntry.findMany({
      where: {
        userId: { not: null },
        day: { gte: new Date(`${w.from}T00:00:00Z`), lte: new Date(`${w.to}T00:00:00Z`) },
        workItem: { deletedAt: null, ...scope },
      },
      select: { userId: true, minutes: true, day: true },
      take: SCAN_LIMIT,
    });
    const open = await db.workItem.findMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        space: { deletedAt: null, archivedAt: null },
        type: { in: ['TASK', 'SUBTASK', 'BUG'] },
        status: { category: { not: 'DONE' } },
        assignees: { some: {} },
        ...scope,
      },
      select: {
        points: true,
        estimateHours: true,
        dueDate: true,
        assignees: { select: { userId: true } },
      },
      take: SCAN_LIMIT,
    });
    const today = dayKey(now);

    const people = users
      .map((user) => {
        const mine = entries.filter((e) => e.userId === user.id);
        const byDay = new Map<string, number>();
        for (const e of mine) {
          const k = e.day.toISOString().slice(0, 10);
          byDay.set(k, (byDay.get(k) ?? 0) + e.minutes / 60);
        }
        const hours = [...byDay.values()].reduce((n, v) => n + v, 0);
        const byWeekday = [0, 0, 0, 0, 0, 0, 0];
        for (const [k, h] of byDay) byWeekday[weekday(k)]! += h;
        const loggedWorkdays = [...byDay.keys()].filter((k) => weekday(k) < 5);

        const items = open.filter((i) => i.assignees.some((a) => a.userId === user.id));
        let points = 0;
        let remaining = 0;
        let overdue = 0;
        let unestimated = 0;
        for (const i of items) {
          const n = Math.max(i.assignees.length, 1);
          points += (i.points ?? 0) / n;
          if (i.estimateHours === null) unestimated += 1;
          else remaining += i.estimateHours / n;
          if (i.dueDate && i.dueDate.toISOString().slice(0, 10) < today) overdue += 1;
        }
        const status =
          items.length === 0
            ? ('idle' as const)
            : remaining > OVERLOAD_WEEKS * q.weeklyHours
              ? ('over' as const)
              : ('ok' as const);

        return {
          user,
          status,
          open: {
            items: items.length,
            points: round1(points),
            overdue,
            remainingHours: round1(remaining),
            unestimated,
          },
          logged: {
            hours: round1(hours),
            utilizationPct: pct(hours, capacityEach),
            loggingDays: loggedWorkdays.length,
            loggingPct: pct(loggedWorkdays.length, workdays.length),
            avgPerLoggedDay: byDay.size === 0 ? null : round1(hours / byDay.size),
          },
          byWeekday: byWeekday.map(round1),
          days: [...byDay.entries()]
            .map(([day, h]) => ({ day, hours: round1(h) }))
            .filter((d) => d.day >= addDays(w.to, -(HEATMAP_DAYS - 1)))
            .sort((a, b) => a.day.localeCompare(b.day)),
        };
      })
      .sort(
        (a, b) =>
          b.open.remainingHours - a.open.remainingHours ||
          a.user.name.localeCompare(b.user.name, 'tr'),
      );

    // Ekip: hafta başına saat ve kapasite.
    const weeks = new Map<string, number>();
    for (const d of days) weeks.set(weekStart(d), weeks.get(weekStart(d)) ?? 0);
    for (const e of entries) {
      const k = weekStart(e.day.toISOString().slice(0, 10));
      weeks.set(k, (weeks.get(k) ?? 0) + e.minutes / 60);
    }
    const weekly = [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, hours]) => ({
        weekStart: week,
        hours: round1(hours),
        // Haftanın aralığa düşen hafta içi günleri kadar kapasite.
        capacityHours: round1(
          perDay * workdays.filter((d) => weekStart(d) === week).length * users.length,
        ),
      }));

    const logged = people.reduce((n, p) => n + p.logged.hours, 0);
    const capacity = capacityEach * users.length;
    const pcts = people.flatMap((p) => (p.logged.loggingPct === null ? [] : [p.logged.loggingPct]));
    return {
      range: { ...w },
      weeklyHours: q.weeklyHours,
      workdays: workdays.length,
      team: {
        capacityHours: round1(capacity),
        loggedHours: round1(logged),
        utilizationPct: pct(logged, capacity),
        openItems: open.length,
        remainingHours: round1(people.reduce((n, p) => n + p.open.remainingHours, 0)),
        overloaded: people.filter((p) => p.status === 'over').length,
        idle: people.filter((p) => p.status === 'idle').length,
        avgLoggingPct:
          pcts.length === 0 ? null : Math.round(pcts.reduce((n, v) => n + v, 0) / pcts.length),
      },
      people,
      weekly,
    };
  }
}
