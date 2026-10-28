import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  ANALYTICS_COMPARE_MAX,
  ERROR_CODES,
  formatItemKey,
  type AnalyticsCompare,
  type AnalyticsGrain,
  type AnalyticsMetrics,
  type AnalyticsPeople,
  type AnalyticsPerson,
  type AnalyticsPoint,
  type AnalyticsProject,
  type AnalyticsQuery,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { fail } from '../work-items/item-support';
import {
  addDays,
  DAY_MS,
  dayKey,
  dayStart,
  monthStart,
  round1,
  SCAN_LIMIT,
  spanOf,
  type Span,
  weekStart,
} from './analytics-util';

type ItemType = 'TASK' | 'SUBTASK' | 'BUG';

/** Tamamlanan bir iş; `userId` null ise iş düzeyi (Proje toplamı), değilse o kişinin payı. */
interface DoneFact {
  itemId: string;
  userId: string | null;
  spaceId: string;
  sprintId: string | null;
  type: ItemType;
  day: string;
  createdDay: string;
  completedMs: number;
  createdMs: number;
  dueDay: string | null;
  points: number;
  estimate: number;
  key: string;
  title: string;
}
interface HourFact {
  userId: string;
  spaceId: string;
  sprintId: string | null;
  day: string;
  hours: number;
}
interface ReopenFact {
  /** Olay kimliği: aynı olay birden fazla kişiye yazıldığında Proje düzeyinde bir kez sayılır. */
  eventId: string;
  userId: string | null;
  spaceId: string;
  sprintId: string | null;
  day: string;
}

const EMPTY: AnalyticsMetrics = {
  done: 0,
  points: 0,
  hours: 0,
  avgDays: null,
  onTimePct: null,
  bugsFixed: 0,
  reopened: 0,
  estimateHours: 0,
};

/**
 * Kişi ve Proje analizi (ADR-143). Seçilen aralık ile hemen öncesindeki eşit uzunlukta dönem tek seferde okunur,
 * ölçütler bellekte toplanır (okunan satır aralıkla sınırlı). Birden fazla kişiye atanan işte kişi başına 1 iş
 * sayılır ve puan/tahmin kişiler arasında bölünür; Proje toplamında iş bir kez sayılır.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  // ---------- Aralık ----------

  private window(q: AnalyticsQuery, now = new Date()): Span {
    return spanOf(q, now);
  }

  private isAdmin(): boolean {
    const tier = this.cls.get('workspaceRole');
    return tier === 'OWNER' || tier === 'ADMIN';
  }

  // ---------- Veri okuma ----------

  /** Tamamlanan işler (önceki dönem dahil), iş düzeyinde. */
  private async loadItems(w: Span, spaceId?: string, userIds?: string[]) {
    return this.tenant.db.workItem.findMany({
      where: {
        type: { in: ['TASK', 'SUBTASK', 'BUG'] },
        deletedAt: null,
        space: { deletedAt: null },
        status: { category: 'DONE' },
        completedAt: { gte: dayStart(w.prevFrom), lt: dayStart(addDays(w.to, 1)) },
        ...(spaceId ? { spaceId } : {}),
        ...(userIds ? { assignees: { some: { userId: { in: userIds } } } } : {}),
      },
      select: {
        id: true,
        type: true,
        title: true,
        keyPrefix: true,
        number: true,
        spaceId: true,
        sprintId: true,
        points: true,
        estimateHours: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        assignees: { select: { userId: true } },
      },
      take: SCAN_LIMIT,
    });
  }

  private async loadHours(w: Span, spaceId?: string, userIds?: string[]): Promise<HourFact[]> {
    const rows = await this.tenant.db.timeEntry.findMany({
      where: {
        userId: userIds ? { in: userIds } : { not: null },
        day: { gte: new Date(`${w.prevFrom}T00:00:00Z`), lte: new Date(`${w.to}T00:00:00Z`) },
        workItem: { deletedAt: null, ...(spaceId ? { spaceId } : {}) },
      },
      select: {
        userId: true,
        minutes: true,
        day: true,
        workItem: { select: { spaceId: true, sprintId: true } },
      },
      take: SCAN_LIMIT,
    });
    return rows.flatMap((r) =>
      r.userId
        ? [
            {
              userId: r.userId,
              spaceId: r.workItem.spaceId,
              sprintId: r.workItem.sprintId,
              day: r.day.toISOString().slice(0, 10),
              hours: r.minutes / 60,
            },
          ]
        : [],
    );
  }

  /** Tamamlandıktan sonra yeniden açılan işler: `completedAt` dolu → boş değişimi olan etkinlikler. */
  private async loadReopens(w: Span): Promise<ReopenFact[]> {
    const workspaceId = this.cls.get('workspaceId');
    if (!workspaceId) return [];
    const rows = await this.prisma.$queryRaw<Array<{ itemId: string; createdAt: Date }>>`
      select "entityId"::text as "itemId", "createdAt"
      from activity_events
      where "workspaceId" = ${workspaceId}::uuid
        and "entityType" = 'item'
        and action = 'item.updated'
        and "createdAt" >= ${dayStart(w.prevFrom)}
        and "createdAt" < ${dayStart(addDays(w.to, 1))}
        and changes ? 'completedAt'
        and changes->'completedAt'->>'from' is not null
        and changes->'completedAt'->>'to' is null
      limit ${SCAN_LIMIT}`;
    const ids = [...new Set(rows.map((r) => r.itemId))];
    if (ids.length === 0) return [];
    const visible = await this.tenant.db.workItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        spaceId: true,
        sprintId: true,
        assignees: { select: { userId: true } },
      },
    });
    const byId = new Map(visible.map((v) => [v.id, v]));
    return rows.flatMap<ReopenFact>((r) => {
      const it = byId.get(r.itemId);
      if (!it) return [];
      const base = {
        eventId: `${r.itemId}|${r.createdAt.toISOString()}`,
        spaceId: it.spaceId,
        sprintId: it.sprintId,
        day: dayKey(r.createdAt),
      };
      return it.assignees.length === 0
        ? [{ ...base, userId: null }]
        : it.assignees.map((a) => ({ ...base, userId: a.userId }));
    });
  }

  /** Okunan işlerden olgular üretir. `perPerson`: kişi başına pay; değilse iş düzeyi (userId null). */
  private doneFacts(
    items: Awaited<ReturnType<AnalyticsService['loadItems']>>,
    perPerson: boolean,
    userIds?: string[],
  ): DoneFact[] {
    return items.flatMap<DoneFact>((i) => {
      if (!i.completedAt) return [];
      const base = {
        itemId: i.id,
        spaceId: i.spaceId,
        sprintId: i.sprintId,
        type: i.type as ItemType,
        day: dayKey(i.completedAt),
        createdDay: dayKey(i.createdAt),
        completedMs: i.completedAt.getTime(),
        createdMs: i.createdAt.getTime(),
        dueDay: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : null,
        key: formatItemKey(i.keyPrefix, i.number),
        title: i.title,
      };
      if (!perPerson)
        return [{ ...base, userId: null, points: i.points ?? 0, estimate: i.estimateHours ?? 0 }];
      const people = i.assignees.map((a) => a.userId);
      const n = Math.max(people.length, 1);
      return people
        .filter((u) => !userIds || userIds.includes(u))
        .map((userId) => ({
          ...base,
          userId,
          points: (i.points ?? 0) / n,
          estimate: (i.estimateHours ?? 0) / n,
        }));
    });
  }

  // ---------- Toplama ----------

  private metrics(done: DoneFact[], hours: HourFact[], reopens: ReopenFact[]): AnalyticsMetrics {
    if (done.length === 0 && hours.length === 0 && reopens.length === 0) return { ...EMPTY };
    const dated = done.filter((d) => d.dueDay);
    const onTime = dated.filter((d) => d.day <= d.dueDay!).length;
    return {
      done: done.length,
      points: round1(done.reduce((n, d) => n + d.points, 0)),
      hours: round1(hours.reduce((n, h) => n + h.hours, 0)),
      avgDays:
        done.length === 0
          ? null
          : round1(
              done.reduce((n, d) => n + (d.completedMs - d.createdMs) / DAY_MS, 0) / done.length,
            ),
      onTimePct: dated.length === 0 ? null : Math.round((onTime / dated.length) * 100),
      bugsFixed: done.filter((d) => d.type === 'BUG').length,
      reopened: reopens.length,
      estimateHours: round1(done.reduce((n, d) => n + d.estimate, 0)),
    };
  }

  private inRange = (day: string, from: string, to: string) => day >= from && day <= to;

  /** Cari ve önceki dönemin toplamı. */
  private totals(
    w: Span,
    done: DoneFact[],
    hours: HourFact[],
    reopens: ReopenFact[],
  ): { totals: AnalyticsMetrics; previous: AnalyticsMetrics } {
    const cut = <T extends { day: string }>(rows: T[], from: string, to: string) =>
      rows.filter((r) => this.inRange(r.day, from, to));
    return {
      totals: this.metrics(
        cut(done, w.from, w.to),
        cut(hours, w.from, w.to),
        cut(reopens, w.from, w.to),
      ),
      previous: this.metrics(
        cut(done, w.prevFrom, w.prevTo),
        cut(hours, w.prevFrom, w.prevTo),
        cut(reopens, w.prevFrom, w.prevTo),
      ),
    };
  }

  private bucketKey(grain: AnalyticsGrain, day: string, sprintId: string | null): string {
    if (grain === 'week') return weekStart(day);
    if (grain === 'month') return monthStart(day);
    return sprintId ?? 'none';
  }

  /** Zaman noktaları: hafta/ay aralığın tamamını kapsar (boşlar sıfır), sprint olgulardan çıkar. */
  private async bucketList(
    w: Span,
    facts: Array<{ day: string; sprintId: string | null }>,
  ): Promise<Array<{ key: string; label: string; from: string | null }>> {
    if (w.grain === 'sprint') {
      const ids = [
        ...new Set(facts.filter((f) => this.inRange(f.day, w.from, w.to)).map((f) => f.sprintId)),
      ];
      const real = ids.filter((id): id is string => id !== null);
      const sprints = await this.tenant.db.sprint.findMany({
        where: { id: { in: real } },
        select: { id: true, name: true, startDate: true },
        orderBy: { startDate: 'asc' },
      });
      return [
        ...sprints.map((s) => ({
          key: s.id,
          label: s.name,
          from: s.startDate.toISOString().slice(0, 10),
        })),
        ...(ids.includes(null) ? [{ key: 'none', label: '—', from: null }] : []),
      ];
    }
    const out: Array<{ key: string; label: string; from: string | null }> = [];
    let cursor = w.grain === 'week' ? weekStart(w.from) : monthStart(w.from);
    while (cursor <= w.to && out.length < 400) {
      out.push({ key: cursor, label: cursor, from: cursor });
      cursor =
        w.grain === 'week'
          ? addDays(cursor, 7)
          : `${new Date(new Date(`${cursor}T12:00:00Z`).setUTCMonth(new Date(`${cursor}T12:00:00Z`).getUTCMonth() + 1)).toISOString().slice(0, 7)}-01`;
    }
    return out;
  }

  private async series(
    w: Span,
    done: DoneFact[],
    hours: HourFact[],
    reopens: ReopenFact[],
  ): Promise<AnalyticsPoint[]> {
    const cur = <T extends { day: string }>(rows: T[]) =>
      rows.filter((r) => this.inRange(r.day, w.from, w.to));
    const d = cur(done);
    const h = cur(hours);
    const r = cur(reopens);
    const buckets = await this.bucketList(w, [...d, ...h, ...r]);
    // Olgular bir kez gruplanır (nokta × olgu taraması yerine): uzun aralıkta yüzlerce nokta olabilir.
    const group = <T extends { day: string; sprintId: string | null }>(rows: T[]) => {
      const out = new Map<string, T[]>();
      for (const row of rows) {
        const k = this.bucketKey(w.grain, row.day, row.sprintId);
        const list = out.get(k);
        if (list) list.push(row);
        else out.set(k, [row]);
      }
      return out;
    };
    const gd = group(d);
    const gh = group(h);
    const gr = group(r);
    return buckets.map((b) => ({
      ...this.metrics(gd.get(b.key) ?? [], gh.get(b.key) ?? [], gr.get(b.key) ?? []),
      key: b.key,
      label: b.label,
      from: b.from,
    }));
  }

  private rangeOut(w: Span) {
    return { from: w.from, to: w.to, prevFrom: w.prevFrom, prevTo: w.prevTo, grain: w.grain };
  }

  private async users(ids: string[]) {
    const rows = await this.tenant.db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, avatarVersion: true },
    });
    return new Map(rows.map((u) => [u.id, u]));
  }

  private async spaces(ids: string[]) {
    const rows = await this.tenant.db.space.findMany({
      where: { id: { in: ids } },
      select: { id: true, key: true, name: true, color: true },
    });
    return new Map(rows.map((s) => [s.id, s]));
  }

  private async load(w: Span, spaceId?: string, userIds?: string[]) {
    const items = await this.loadItems(w, spaceId, userIds);
    const hours = await this.loadHours(w, spaceId, userIds);
    let reopens = await this.loadReopens(w);
    if (spaceId) reopens = reopens.filter((r) => r.spaceId === spaceId);
    if (userIds) reopens = reopens.filter((r) => r.userId && userIds.includes(r.userId));
    return { items, hours, reopens };
  }

  // ---------- Uç noktalar ----------

  /** Tüm üyeler: ölçütler ve önceki dönem (Owner/Admin). */
  async people(q: AnalyticsQuery): Promise<AnalyticsPeople> {
    const w = this.window(q);
    const { items, hours, reopens } = await this.load(w, q.spaceId);
    const done = this.doneFacts(items, true);
    const members = await this.tenant.db.membership.findMany({ select: { userId: true } });
    const ids = [...new Set([...members.map((m) => m.userId)])];
    const users = await this.users(ids);
    // Kişi başına olgular tek geçişte gruplanır (kişi × olgu taraması yerine).
    const byUser = <T extends { userId: string | null }>(rows: T[]) => {
      const out = new Map<string, T[]>();
      for (const row of rows) {
        if (!row.userId) continue;
        const list = out.get(row.userId);
        if (list) list.push(row);
        else out.set(row.userId, [row]);
      }
      return out;
    };
    const doneBy = byUser(done);
    const hoursBy = byUser(hours);
    const reopensBy = byUser(reopens);
    const people = ids.flatMap((id) => {
      const u = users.get(id);
      if (!u) return [];
      return [
        {
          user: u,
          ...this.totals(w, doneBy.get(id) ?? [], hoursBy.get(id) ?? [], reopensBy.get(id) ?? []),
        },
      ];
    });
    people.sort((a, b) => b.totals.points - a.totals.points || b.totals.done - a.totals.done);
    return { range: this.rangeOut(w), people };
  }

  /** Bir kişinin ayrıntılı analizi. Owner/Admin herkesi, üye yalnızca kendini görür. */
  async person(userId: string, q: AnalyticsQuery): Promise<AnalyticsPerson> {
    if (!this.isAdmin() && this.cls.get('userId') !== userId) throw new ForbiddenException();
    const w = this.window(q);
    const { items, hours, reopens } = await this.load(w, q.spaceId, [userId]);
    const done = this.doneFacts(items, true, [userId]);
    const user = (await this.users([userId])).get(userId);
    if (!user) throw fail(ERROR_CODES.NOT_FOUND);

    const cur = done.filter((f) => this.inRange(f.day, w.from, w.to));
    const spaceMap = await this.spaces([
      ...new Set([...cur.map((f) => f.spaceId), ...hours.map((h) => h.spaceId)]),
    ]);
    const spaceIds = [...spaceMap.keys()];
    const byProject = spaceIds
      .map((id) => ({
        space: spaceMap.get(id)!,
        ...this.metrics(
          cur.filter((f) => f.spaceId === id),
          hours.filter((f) => f.spaceId === id && this.inRange(f.day, w.from, w.to)),
          reopens.filter((f) => f.spaceId === id && this.inRange(f.day, w.from, w.to)),
        ),
      }))
      .sort((a, b) => b.points - a.points || b.done - a.done);

    const sprintIds = [...new Set(cur.map((f) => f.sprintId).filter((s): s is string => !!s))];
    const sprints = await this.tenant.db.sprint.findMany({
      where: { id: { in: sprintIds } },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        space: { select: { name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    const sprintRow = (sprintId: string | null) => {
      const facts = cur.filter((f) => f.sprintId === sprintId);
      const sp = sprints.find((s) => s.id === sprintId);
      return {
        sprint: sp
          ? {
              id: sp.id,
              name: sp.name,
              project: sp.space.name,
              startDate: sp.startDate.toISOString().slice(0, 10),
              endDate: sp.endDate.toISOString().slice(0, 10),
            }
          : null,
        ...this.metrics(
          facts,
          hours.filter((h) => h.sprintId === sprintId && this.inRange(h.day, w.from, w.to)),
          reopens.filter((r) => r.sprintId === sprintId && this.inRange(r.day, w.from, w.to)),
        ),
        items: facts.map((f) => ({
          id: f.itemId,
          key: f.key,
          title: f.title,
          type: f.type,
          points: round1(f.points),
          completedAt: f.day,
        })),
      };
    };
    const bySprint = [
      ...sprints.map((s) => sprintRow(s.id)),
      ...(cur.some((f) => !f.sprintId) ? [sprintRow(null)] : []),
    ];

    return {
      range: this.rangeOut(w),
      user,
      ...this.totals(w, done, hours, reopens),
      series: await this.series(w, done, hours, reopens),
      byProject,
      bySprint,
    };
  }

  /** Bir Projenin analizi (Owner/Admin). */
  async project(spaceId: string, q: AnalyticsQuery): Promise<AnalyticsProject> {
    const w = this.window(q);
    const space = (await this.spaces([spaceId])).get(spaceId);
    if (!space) throw fail(ERROR_CODES.NOT_FOUND);
    const { items, hours, reopens } = await this.load(w, spaceId);
    const itemDone = this.doneFacts(items, false);
    const personDone = this.doneFacts(items, true);
    // Proje düzeyinde bir yeniden açma olayı kaç kişiye atanmış olursa olsun bir kez sayılır.
    const projectReopens = [...new Map(reopens.map((r) => [r.eventId, r])).values()];

    const cur = itemDone.filter((f) => this.inRange(f.day, w.from, w.to));
    const bugs = await this.tenant.db.workItem.findMany({
      where: {
        type: 'BUG',
        spaceId,
        deletedAt: null,
        createdAt: { gte: dayStart(w.from), lt: dayStart(addDays(w.to, 1)) },
      },
      select: { createdAt: true, sprintId: true },
      take: SCAN_LIMIT,
    });
    const baseSeries = await this.series(w, itemDone, hours, projectReopens);
    const series = baseSeries.map((p) => ({
      ...p,
      bugsOpened: bugs.filter(
        (b) => this.bucketKey(w.grain, dayKey(b.createdAt), b.sprintId) === p.key,
      ).length,
    }));

    const personIds = [...new Set(personDone.map((f) => f.userId!))];
    const hourIds = hours.map((h) => h.userId);
    const users = await this.users([...new Set([...personIds, ...hourIds])]);
    const byPerson = [...users.values()]
      .map((u) => ({
        user: u,
        ...this.metrics(
          personDone.filter((f) => f.userId === u.id && this.inRange(f.day, w.from, w.to)),
          hours.filter((h) => h.userId === u.id && this.inRange(h.day, w.from, w.to)),
          reopens.filter((r) => r.userId === u.id && this.inRange(r.day, w.from, w.to)),
        ),
      }))
      .filter((p) => p.done > 0 || p.hours > 0)
      .sort((a, b) => b.points - a.points || b.done - a.done);

    const sprints = await this.tenant.db.sprint.findMany({
      where: { spaceId, status: 'COMPLETED' },
      select: {
        id: true,
        name: true,
        completedAt: true,
        completedPoints: true,
        committedPoints: true,
      },
      orderBy: { completedAt: 'desc' },
      take: 6,
    });

    return {
      range: this.rangeOut(w),
      space,
      ...this.totals(w, itemDone, hours, projectReopens),
      series,
      byPerson,
      velocity: sprints
        .map((s) => ({
          id: s.id,
          name: s.name,
          committed: s.committedPoints ?? 0,
          completed: s.completedPoints ?? 0,
          completedAt: dayKey(s.completedAt ?? new Date()),
        }))
        .reverse(),
      byType: {
        task: cur.filter((f) => f.type === 'TASK').length,
        subtask: cur.filter((f) => f.type === 'SUBTASK').length,
        bug: cur.filter((f) => f.type === 'BUG').length,
      },
    };
  }

  /** 2–5 kişiyi aynı ölçütlerle yan yana getirir (Owner/Admin). */
  async compare(q: AnalyticsQuery): Promise<AnalyticsCompare> {
    const ids = [...new Set((q.userIds ?? '').split(',').filter(Boolean))];
    if (
      ids.length < 1 ||
      ids.length > ANALYTICS_COMPARE_MAX ||
      ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))
    )
      throw new BadRequestException(`1–${ANALYTICS_COMPARE_MAX} kişi seçilmeli`);
    const w = this.window(q);
    const { items, hours, reopens } = await this.load(w, q.spaceId, ids);
    const done = this.doneFacts(items, true, ids);
    const users = await this.users(ids);

    const everything = [...done, ...hours, ...reopens].filter((f) =>
      this.inRange(f.day, w.from, w.to),
    );
    const buckets = await this.bucketList(w, everything);
    const out: AnalyticsCompare['users'] = [];
    for (const id of ids) {
      const user = users.get(id);
      if (!user) continue;
      const d = done.filter((f) => f.userId === id);
      const h = hours.filter((f) => f.userId === id);
      const r = reopens.filter((f) => f.userId === id);
      const own = await this.series(w, d, h, r);
      // Ortak X ekseni: kişinin olmadığı noktalar sıfır.
      const points = buckets.map(
        (b) =>
          own.find((p) => p.key === b.key) ?? {
            ...EMPTY,
            key: b.key,
            label: b.label,
            from: b.from,
          },
      );
      out.push({ user, totals: this.totals(w, d, h, r).totals, series: points });
    }
    return {
      range: this.rangeOut(w),
      users: out,
      buckets: buckets.map((b) => ({ key: b.key, label: b.label })),
    };
  }
}
