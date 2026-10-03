import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  averageVelocity,
  buildBurndown,
  buildVelocity,
  localDate,
  REPORT_TIME_ZONE,
  sprintTotals,
  VELOCITY_CHART_SPRINTS,
  type SprintBurndown,
  type VelocityResponse,
} from '@scrum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { notFound } from '../spaces/space-errors';
import { dateOnly } from '../work-items/item-support';
import { countedItems, loadScrumSpace } from './sprint-support';

export const SNAPSHOT_JOB = 'sprint.snapshot';

const toDay = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** Sprint raporları: günlük görüntü, Burndown ve Velocity (Faz 2.6, ADR-067). */
@Injectable()
export class SprintReportsService implements OnModuleInit {
  private readonly logger = new Logger(SprintReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Her gün 23:55 (İstanbul): aktif sprint'lerin o günkü görüntüsü.
    await this.queue.schedule(SNAPSHOT_JOB, '55 23 * * *', () =>
      this.captureActive().then(() => {}),
    );
  }

  /** Tüm çalışma alanlarındaki aktif sprint'lerin bugünkü görüntüsünü yazar. */
  async captureActive(now = new Date()): Promise<number> {
    const active = await this.prisma.sprint.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, workspaceId: true },
    });
    let written = 0;
    for (const sprint of active) {
      if (await this.capture(sprint, now)) written += 1;
    }
    return written;
  }

  /**
   * Sprint'in o günkü görüntüsünü yazar (gün başına tek satır). Hata sprint işlemini bozmaz:
   * loglanır, gece işi bir sonraki turda yeniden dener.
   */
  async capture(sprint: { id: string; workspaceId: string }, now = new Date()): Promise<boolean> {
    try {
      const totals = await this.liveTotals(sprint.id);
      const data = {
        totalPoints: totals.points,
        donePoints: totals.donePoints,
        remainingPoints: totals.points - totals.donePoints,
        totalItems: totals.itemCount,
        doneItems: totals.doneItemCount,
      };
      const date = toDay(localDate(now, REPORT_TIME_ZONE));
      await this.prisma.sprintSnapshot.upsert({
        where: { sprintId_date: { sprintId: sprint.id, date } },
        create: { workspaceId: sprint.workspaceId, sprintId: sprint.id, date, ...data },
        update: data,
      });
      return true;
    } catch (error) {
      this.logger.error(`Sprint görüntüsü yazılamadı (${sprint.id})`, error as Error);
      return false;
    }
  }

  /** Sprint'in şu anki öğe toplamları (silinmiş/arşivli hariç). */
  async liveTotals(sprintId: string) {
    const items = await this.prisma.workItem.findMany({
      where: { sprintId, ...countedItems },
      select: { type: true, points: true, status: { select: { category: true } } },
    });
    return sprintTotals(
      items.map((i) => ({ type: i.type, points: i.points, category: i.status.category })),
    );
  }

  /** Sprint Burndown: kalan puan, ideal çizgi ve scope change (brief §5.11). */
  async burndown(sprintId: string): Promise<SprintBurndown> {
    const db = this.tenant.db;
    const sprint = await db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    await loadScrumSpace(db, sprint.spaceId, false);

    const header = {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      startDate: dateOnly(sprint.startDate)!,
      endDate: dateOnly(sprint.endDate)!,
    };
    if (sprint.status === 'PLANNED') {
      return { sprint: header, baseline: 0, currentRemaining: null, points: [] };
    }

    const [stored, events] = await Promise.all([
      db.sprintSnapshot.findMany({ where: { sprintId }, orderBy: { date: 'asc' } }),
      db.sprintItemEvent.findMany({
        where: { sprintId, reason: 'SCOPE_CHANGE' },
        select: { action: true, points: true, createdAt: true },
      }),
    ]);
    const snapshots = stored.map((s) => ({
      date: dateOnly(s.date)!,
      remainingPoints: s.remainingPoints,
      totalPoints: s.totalPoints,
    }));

    const today = localDate(new Date(), REPORT_TIME_ZONE);
    const endedAt = sprint.completedAt ?? sprint.cancelledAt;
    const lastDay = endedAt ? localDate(endedAt, REPORT_TIME_ZONE) : today;

    // Aktif sprint'te bugünün noktası gece işini beklemeden canlı hesaplanır.
    let currentRemaining: number | null = null;
    if (sprint.status === 'ACTIVE') {
      const totals = await this.liveTotals(sprintId);
      currentRemaining = totals.points - totals.donePoints;
      const live = { date: today, remainingPoints: currentRemaining, totalPoints: totals.points };
      const index = snapshots.findIndex((s) => s.date === today);
      if (index >= 0) snapshots[index] = live;
      else snapshots.push(live);
    }

    const baseline = sprint.committedPoints ?? stored[0]?.totalPoints ?? 0;
    const { points } = buildBurndown({
      baseline,
      startDate: header.startDate,
      endDate: header.endDate,
      lastDay,
      snapshots,
      scopeChanges: events.map((e) => ({
        date: localDate(e.createdAt, REPORT_TIME_ZONE),
        delta: (e.action === 'ADDED' ? 1 : -1) * (e.points ?? 0),
      })),
    });
    return { sprint: header, baseline, currentRemaining, points };
  }

  /** Velocity: tamamlanan sprint'ler için taahhüt ve donmuş tamamlanan puan (brief §6.1.7). */
  async velocity(spaceId: string): Promise<VelocityResponse> {
    const db = this.tenant.db;
    await loadScrumSpace(db, spaceId, false);
    const completed = await db.sprint.findMany({
      where: { spaceId, status: 'COMPLETED', completedPoints: { not: null } },
      select: {
        id: true,
        name: true,
        endDate: true,
        completedPoints: true,
        committedPoints: true,
        status: true,
      },
      orderBy: { endDate: 'desc' },
      take: VELOCITY_CHART_SPRINTS,
    });
    const rows = completed.map((s) => ({
      id: s.id,
      name: s.name,
      endDate: dateOnly(s.endDate)!,
      completedPoints: s.completedPoints,
      committedPoints: s.committedPoints,
    }));
    const sprints = buildVelocity(rows, VELOCITY_CHART_SPRINTS).map((s) => ({
      ...s,
      completedPoints: s.completedPoints ?? 0,
    }));
    return {
      sprints,
      average: averageVelocity(
        completed.map((s) => ({
          status: s.status,
          endDate: dateOnly(s.endDate)!,
          completedPoints: s.completedPoints,
        })),
      ),
    };
  }
}
