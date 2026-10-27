import { Injectable } from '@nestjs/common';
import {
  formatItemKey,
  type AnalyticsForecast,
  type AnalyticsRisk,
  type AnalyticsSprintState,
} from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { countedItems } from '../sprints/sprint-support';
import { addDays, DAY_MS, dayKey, diffDays, round1, SCAN_LIMIT } from './analytics-util';

/** Sprintin bu kadarı geçmeden uyarı üretilmez (erken, gürültülü). */
const MIN_ELAPSED = 0.15;
const SLOW_RATIO = 0.6;
const VERY_SLOW_RATIO = 0.3;
const LEVEL_ORDER = { high: 0, medium: 1, low: 2 } as const;

/**
 * Öngörü ve risk uyarıları (ADR-148). Hepsi mevcut hızdan basit doğrusal tahmindir; kesin söz değildir ve kişileri
 * değerlendirmez: yalnızca "önceki döneme göre değişimi" söyler. Uyarılar eşiklerle üretilir ve hesaplanabilir.
 */
@Injectable()
export class AnalyticsForecastService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async forecast(now = new Date()): Promise<AnalyticsForecast> {
    const db = this.tenant.db;
    const nowMs = now.getTime();
    const today = dayKey(now);
    const live = { deletedAt: null, space: { deletedAt: null, archivedAt: null } } as const;

    // ---- Aktif sprintler
    const sprintRows = await db.sprint.findMany({
      where: { status: 'ACTIVE', space: { deletedAt: null, archivedAt: null } },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        space: { select: { id: true, name: true, color: true } },
      },
      orderBy: { endDate: 'asc' },
    });
    const sprintItems = await db.workItem.findMany({
      where: { sprintId: { in: sprintRows.map((s) => s.id) }, ...countedItems },
      select: { sprintId: true, points: true, status: { select: { category: true } } },
      take: SCAN_LIMIT,
    });
    const sprints = sprintRows.map((s) => {
      const start = s.startDate.toISOString().slice(0, 10);
      const end = s.endDate.toISOString().slice(0, 10);
      const items = sprintItems.filter((i) => i.sprintId === s.id);
      const total = items.reduce((n, i) => n + (i.points ?? 0), 0);
      const done = items
        .filter((i) => i.status.category === 'DONE')
        .reduce((n, i) => n + (i.points ?? 0), 0);
      const remaining = total - done;
      const totalDays = Math.max(1, diffDays(start, end) + 1);
      const elapsed = Math.max(0, diffDays(start, today));
      const rate = done / Math.max(1, elapsed);
      const daysLeft = Math.max(0, diffDays(today, end) + 1);
      const projectedDone = Math.min(total, done + rate * daysLeft);
      const elapsedFraction = Math.min(1, elapsed / totalDays);
      const doneFraction = total > 0 ? done / total : 1;
      let state: AnalyticsSprintState;
      if (remaining <= 0 || total === 0) state = 'ahead';
      else if (elapsedFraction < MIN_ELAPSED) state = 'on_track';
      else {
        const ratio = doneFraction / elapsedFraction;
        state =
          ratio >= 1.1 ? 'ahead' : ratio >= 0.9 ? 'on_track' : ratio >= 0.7 ? 'at_risk' : 'behind';
      }
      return {
        id: s.id,
        name: s.name,
        project: s.space,
        startDate: start,
        endDate: end,
        daysLeft,
        totalPoints: round1(total),
        donePoints: round1(done),
        remainingPoints: round1(remaining),
        ratePerDay: round1(rate),
        projectedDone: round1(projectedDone),
        projectedPct: total > 0 ? Math.round((projectedDone / total) * 100) : null,
        projectedFinish:
          rate > 0 && remaining > 0 ? addDays(today, Math.ceil(remaining / rate)) : null,
        state,
      };
    });

    // ---- Açık Epic'ler: kalan puan ve Projenin son 4 haftalık hızı
    const epicRows = await db.workItem.findMany({
      where: { ...live, type: 'EPIC', status: { category: { not: 'DONE' } } },
      select: {
        id: true,
        title: true,
        keyPrefix: true,
        number: true,
        space: { select: { id: true, name: true, color: true } },
      },
      take: 500,
    });
    const children = await db.workItem.findMany({
      where: {
        ...live,
        parentId: { in: epicRows.map((e) => e.id) },
        type: { in: ['TASK', 'BUG'] },
      },
      select: { parentId: true, points: true, status: { select: { category: true } } },
      take: SCAN_LIMIT,
    });
    const since28 = new Date(nowMs - 28 * DAY_MS);
    const finished = await db.workItem.findMany({
      where: {
        ...live,
        type: { in: ['TASK', 'SUBTASK', 'BUG'] },
        status: { category: 'DONE' },
        completedAt: { gte: new Date(nowMs - 56 * DAY_MS) },
      },
      select: {
        spaceId: true,
        points: true,
        completedAt: true,
        assignees: { select: { userId: true } },
      },
      take: SCAN_LIMIT,
    });
    const rateOf = (spaceId: string) =>
      finished
        .filter((f) => f.spaceId === spaceId && f.completedAt && f.completedAt >= since28)
        .reduce((n, f) => n + (f.points ?? 0), 0) / 4;
    const epics = epicRows
      .map((e) => {
        const mine = children.filter((c) => c.parentId === e.id);
        const total = mine.reduce((n, c) => n + (c.points ?? 0), 0);
        const done = mine
          .filter((c) => c.status.category === 'DONE')
          .reduce((n, c) => n + (c.points ?? 0), 0);
        const remaining = total - done;
        const rate = rateOf(e.space.id);
        const weeks = rate > 0 && remaining > 0 ? remaining / rate : null;
        return {
          id: e.id,
          key: formatItemKey(e.keyPrefix, e.number),
          title: e.title,
          project: e.space,
          totalPoints: round1(total),
          donePoints: round1(done),
          remainingPoints: round1(remaining),
          openItems: mine.filter((c) => c.status.category !== 'DONE').length,
          ratePerWeek: round1(rate),
          weeksLeft: weeks === null ? null : round1(weeks),
          projectedFinish: weeks === null ? null : addDays(today, Math.ceil(weeks * 7)),
        };
      })
      .filter((e) => e.openItems > 0)
      .sort((a, b) => b.remainingPoints - a.remainingPoints)
      .slice(0, 10);

    // ---- Risk uyarıları
    const risks: AnalyticsRisk[] = [];
    for (const s of sprints) {
      if (s.state === 'behind' || s.state === 'at_risk') {
        risks.push({
          id: `sprint:${s.id}`,
          kind: 'sprint_behind',
          level: s.state === 'behind' ? 'high' : 'medium',
          subject: `${s.name} · ${s.project.name}`,
          value: s.projectedPct ?? 0,
          previous: null,
          link: { kind: 'sprint', id: s.id },
        });
      }
    }

    const openBugs = await db.workItem.findMany({
      where: { ...live, type: 'BUG', status: { category: { not: 'DONE' } } },
      select: {
        id: true,
        title: true,
        keyPrefix: true,
        number: true,
        severity: true,
        createdAt: true,
        assignees: { select: { userId: true }, take: 1 },
      },
      take: SCAN_LIMIT,
    });
    const days = (d: Date) => Math.floor((nowMs - d.getTime()) / DAY_MS);
    type Waiting = { b: (typeof openBugs)[number]; n: number; level: 'high' | 'medium' };
    const waiting = openBugs
      .flatMap<Waiting>((b) => {
        const n = days(b.createdAt);
        if (b.severity === 'CRITICAL' && n > 7) return [{ b, n, level: 'high' }];
        if (b.severity === 'MAJOR' && n > 14) return [{ b, n, level: 'medium' }];
        return [];
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
    for (const w of waiting) {
      risks.push({
        id: `bug:${w.b.id}`,
        kind: 'critical_waiting',
        level: w.level,
        subject: w.b.title,
        value: w.n,
        previous: null,
        link: { kind: 'item', id: formatItemKey(w.b.keyPrefix, w.b.number) },
      });
    }

    const unassigned = openBugs.filter((b) => b.assignees.length === 0 && days(b.createdAt) > 3);
    if (unassigned.length > 0) {
      risks.push({
        id: 'unassigned-bugs',
        kind: 'unassigned_bugs',
        level: unassigned.length >= 5 ? 'high' : 'medium',
        subject: '',
        value: unassigned.length,
        previous: null,
        link: null,
      });
    }

    const stuck = await db.workItem.count({
      where: {
        ...live,
        type: { in: ['TASK', 'SUBTASK', 'BUG'] },
        status: { category: 'ACTIVE' },
        updatedAt: { lt: new Date(nowMs - 14 * DAY_MS) },
      },
    });
    if (stuck >= 3) {
      risks.push({
        id: 'stuck-items',
        kind: 'stuck_items',
        level: stuck >= 8 ? 'high' : 'medium',
        subject: '',
        value: stuck,
        previous: null,
        link: null,
      });
    }

    // Yavaşlama: son 14 gün ile önceki 14 gün (biten iş sayısı).
    const since14 = nowMs - 14 * DAY_MS;
    const split = <T extends { completedAt: Date | null }>(rows: T[]) => ({
      cur: rows.filter((r) => r.completedAt && r.completedAt.getTime() >= since14),
      prev: rows.filter((r) => r.completedAt && r.completedAt.getTime() < since14),
    });
    const bySpace = new Map<string, typeof finished>();
    const byUser = new Map<string, typeof finished>();
    for (const f of finished) {
      bySpace.set(f.spaceId, [...(bySpace.get(f.spaceId) ?? []), f]);
      for (const a of f.assignees) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), f]);
    }
    const slow = (cur: number, prev: number, minPrev: number): 'high' | 'medium' | null =>
      prev >= minPrev && cur <= prev * SLOW_RATIO
        ? cur <= prev * VERY_SLOW_RATIO
          ? 'high'
          : 'medium'
        : null;
    const spaceNames = await db.space.findMany({
      where: { id: { in: [...bySpace.keys()] } },
      select: { id: true, name: true },
    });
    for (const [id, rows] of bySpace) {
      const { cur, prev } = split(rows);
      const level = slow(cur.length, prev.length, 5);
      if (level)
        risks.push({
          id: `project:${id}`,
          kind: 'project_slowing',
          level,
          subject: spaceNames.find((s) => s.id === id)?.name ?? '',
          value: cur.length,
          previous: prev.length,
          link: { kind: 'project', id },
        });
    }
    const userNames = await db.user.findMany({
      where: { id: { in: [...byUser.keys()] } },
      select: { id: true, name: true },
    });
    for (const [id, rows] of byUser) {
      const { cur, prev } = split(rows);
      const level = slow(cur.length, prev.length, 3);
      if (level)
        risks.push({
          id: `person:${id}`,
          kind: 'person_slowing',
          level,
          subject: userNames.find((u) => u.id === id)?.name ?? '',
          value: cur.length,
          previous: prev.length,
          link: { kind: 'person', id },
        });
    }

    risks.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.value - a.value);
    return { generatedAt: now.toISOString(), sprints, epics, risks };
  }
}
