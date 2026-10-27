import { Injectable } from '@nestjs/common';
import type { AnalyticsQuery, AnalyticsSprints, AnalyticsSprintSummary } from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { countedItems } from '../sprints/sprint-support';
import { round1, spanOf } from './analytics-util';

/** En çok kaç sprint döner (en yeniler). */
const MAX_SPRINTS = 30;

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;
const avg = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((n, v) => n + v, 0) / values.length;

/**
 * Sprint derinliği (ADR-145): taahhüt ve biten puan, başlangıçtan sonraki kapsam değişimi, devir ve devralma.
 * Veri mevcut kayıtlardan gelir: `sprints` (taahhüt/biten donmuş değer) ve `sprint_item_events` (ADDED/REMOVED +
 * neden: SCOPE_CHANGE, UNFINISHED, CARRIED_OVER). Günlük burndown için mevcut `sprints/:id/burndown` kullanılır.
 */
@Injectable()
export class AnalyticsSprintService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async sprints(q: AnalyticsQuery, now = new Date()): Promise<AnalyticsSprints> {
    const w = spanOf(q, now);
    const db = this.tenant.db;
    const rows = await db.sprint.findMany({
      where: {
        status: { in: ['ACTIVE', 'COMPLETED'] },
        startDate: { lte: new Date(`${w.to}T00:00:00Z`) },
        endDate: { gte: new Date(`${w.from}T00:00:00Z`) },
        space: { deletedAt: null },
        ...(q.spaceId ? { spaceId: q.spaceId } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        committedPoints: true,
        completedPoints: true,
        space: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startDate: 'desc' },
      take: MAX_SPRINTS,
    });
    const ids = rows.map((r) => r.id);
    const items = await db.workItem.findMany({
      where: { sprintId: { in: ids }, ...countedItems },
      select: { sprintId: true, points: true, status: { select: { category: true } } },
    });
    const events = await db.sprintItemEvent.findMany({
      where: { sprintId: { in: ids } },
      select: { sprintId: true, action: true, reason: true, points: true },
    });

    const sprints: AnalyticsSprintSummary[] = rows
      .map((s) => {
        const mine = items.filter((i) => i.sprintId === s.id && i.status.category === 'DONE');
        const donePoints = mine.reduce((n, i) => n + (i.points ?? 0), 0);
        const ev = events.filter((e) => e.sprintId === s.id);
        const sum = (action: 'ADDED' | 'REMOVED', reason: string) =>
          ev
            .filter((e) => e.action === action && e.reason === reason)
            .reduce((n, e) => n + (e.points ?? 0), 0);
        const count = (action: 'ADDED' | 'REMOVED', reason: string) =>
          ev.filter((e) => e.action === action && e.reason === reason).length;
        const committed = s.committedPoints ?? 0;
        const completed = s.status === 'COMPLETED' ? (s.completedPoints ?? donePoints) : donePoints;
        const scopeAdded = sum('ADDED', 'SCOPE_CHANGE');
        const scopeRemoved = sum('REMOVED', 'SCOPE_CHANGE');
        const carryPoints = sum('REMOVED', 'UNFINISHED');
        return {
          id: s.id,
          name: s.name,
          project: s.space,
          status: s.status as 'ACTIVE' | 'COMPLETED',
          startDate: s.startDate.toISOString().slice(0, 10),
          endDate: s.endDate.toISOString().slice(0, 10),
          committed: round1(committed),
          completed: round1(completed),
          doneItems: mine.length,
          scopeAdded: round1(scopeAdded),
          scopeRemoved: round1(scopeRemoved),
          carryOverItems: count('REMOVED', 'UNFINISHED'),
          carryOverPoints: round1(carryPoints),
          carriedInItems: count('ADDED', 'CARRIED_OVER'),
          carriedInPoints: round1(sum('ADDED', 'CARRIED_OVER')),
          commitmentPct: pct(completed, committed),
          scopeChangePct: pct(scopeAdded + scopeRemoved, committed),
          carryOverPct: pct(carryPoints, completed + carryPoints),
        };
      })
      .reverse();

    const finished = sprints.filter((s) => s.status === 'COMPLETED');
    const mean = (pick: (s: AnalyticsSprintSummary) => number | null) => {
      const v = avg(finished.flatMap((s) => (pick(s) === null ? [] : [pick(s)!])));
      return v === null ? null : Math.round(v);
    };
    const velocity = avg(finished.map((s) => s.completed));
    return {
      range: { ...w },
      summary: {
        completedCount: finished.length,
        avgVelocity: velocity === null ? null : round1(velocity),
        avgCommitmentPct: mean((s) => s.commitmentPct),
        avgScopeChangePct: mean((s) => s.scopeChangePct),
        avgCarryOverPct: mean((s) => s.carryOverPct),
      },
      sprints,
    };
  }
}
