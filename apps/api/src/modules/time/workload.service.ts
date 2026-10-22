import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  addDays,
  ERROR_CODES,
  SPACE_PERMISSIONS as S,
  buildWorkload,
  localDate,
  REPORT_TIME_ZONE,
  weekdayIndex,
  type Workload,
} from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { notFound } from '../spaces/space-errors';
import { dateOnly, toDate } from '../work-items/item-support';

/** Kişi bazlı iş yükü (Faz 4.4, ADR-076): açık işler, puan, kalan süre, geciken ve yaklaşan. */
@Injectable()
export class WorkloadService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly access: SpaceAccessService,
  ) {}

  async workload(spaceId: string, sprintId?: string): Promise<Workload> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();

    const sprint = sprintId
      ? await db.sprint.findFirst({
          where: { id: sprintId, spaceId },
          select: { id: true, name: true },
        })
      : null;
    if (sprintId && !sprint) throw notFound();
    return this.compute([spaceId], sprint);
  }

  /**
   * Workspace genelinde iş yükü (Faz 15, ADR-132): Proje verilmezse kullanıcının raporlarını görebildiği
   * tüm Proje'ler toplanır; Proje verilirse o Proje (ve isteğe bağlı sprint'i).
   */
  async forWorkspace(spaceId?: string, sprintId?: string): Promise<Workload> {
    const permissions = await this.access.permissionMap({ deletedAt: null });
    if (spaceId) {
      const perms = permissions.get(spaceId);
      if (!perms) throw notFound();
      if (!perms.includes(S.REPORT_VIEW)) {
        throw new ForbiddenException({ code: ERROR_CODES.FORBIDDEN });
      }
      return this.workload(spaceId, sprintId);
    }
    const spaceIds = [...permissions]
      .filter(([, p]) => p.includes(S.REPORT_VIEW))
      .map(([id]) => id);
    return this.compute(spaceIds, null);
  }

  private async compute(
    spaceIds: string[],
    sprint: { id: string; name: string } | null,
  ): Promise<Workload> {
    const db = this.tenant.db;
    const inSpaces = { in: spaceIds };

    const items = await db.workItem.findMany({
      where: {
        spaceId: inSpaces,
        space: { deletedAt: null },
        deletedAt: null,
        archivedAt: null,
        type: { not: 'EPIC' },
        status: { category: { not: 'DONE' } },
        ...(sprint && { sprintId: sprint.id }),
      },
      select: {
        id: true,
        points: true,
        estimateHours: true,
        dueDate: true,
        assignees: { select: { userId: true } },
      },
    });

    const itemIds = items.map((i) => i.id);
    const today = localDate(new Date(), REPORT_TIME_ZONE);
    const weekFrom = addDays(today, -weekdayIndex(today));
    const [entries, users] = await Promise.all([
      db.timeEntry.findMany({
        where: { workItemId: { in: itemIds } },
        select: { workItemId: true, minutes: true },
      }),
      db.user.findMany({
        where: { assignedItems: { some: { workItem: { spaceId: inSpaces } } } },
        select: { id: true, name: true },
      }),
    ]);
    const logged = new Map<string, number>();
    for (const e of entries) logged.set(e.workItemId, (logged.get(e.workItemId) ?? 0) + e.minutes);

    const thisWeek = await db.timeEntry.groupBy({
      by: ['userId'],
      where: {
        workItem: { spaceId: inSpaces },
        userId: { not: null },
        day: { gte: toDate(weekFrom)!, lte: toDate(addDays(weekFrom, 6))! },
      },
      _sum: { minutes: true },
    });
    const weekMinutes = new Map(thisWeek.map((w) => [w.userId, w._sum.minutes ?? 0]));
    const names = new Map(users.map((u) => [u.id, u.name]));

    const rows = buildWorkload(
      items.map((i) => ({
        id: i.id,
        points: i.points,
        estimateHours: i.estimateHours,
        dueDate: dateOnly(i.dueDate),
        assigneeIds: i.assignees.map((a) => a.userId),
      })),
      logged,
      today,
    );

    return {
      sprint,
      rows: rows.map((r) => ({
        user: r.userId ? { id: r.userId, name: names.get(r.userId) ?? '—' } : null,
        itemCount: r.itemCount,
        points: r.points,
        remainingMinutes: r.remainingMinutes,
        overdue: r.overdue,
        dueSoon: r.dueSoon,
        loggedThisWeekMinutes: r.userId ? (weekMinutes.get(r.userId) ?? 0) : 0,
      })),
    };
  }
}
