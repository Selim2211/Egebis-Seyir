import { Injectable } from '@nestjs/common';
import {
  BUG_SEVERITIES,
  type AdminOverview,
  type AdminProject,
  type BugSeverity,
} from '@scrum/shared';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';

const DAY_MS = 86_400_000;
const DAYS = 14;
const TZ = 'Europe/Istanbul';
/** Tek sorguda okunacak en çok Bug/iş sayısı (çok büyük çalışma alanında bellek sınırı). */
const SCAN_LIMIT = 50_000;

/** Europe/Istanbul takvim günü, YYYY-MM-DD. */
const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });

/** Bugün dahil son n günün anahtarları (eskiden yeniye). */
function lastDays(n: number, now: Date): string[] {
  return Array.from({ length: n }, (_, i) =>
    dayKey(new Date(now.getTime() - (n - 1 - i) * DAY_MS)),
  );
}

/**
 * Yönetici paneli verisi (ADR-139): Bug akışı, Projelerin sprint ilerlemesi, geciken işler ve ekip yükü.
 * Tek istekte hesaplanır; çalışma alanı küçük/orta ölçekli varsayılır (okunan satır sayısı sınırlı).
 */
@Injectable()
export class AdminOverviewService {
  constructor(private readonly tenant: TenantPrismaService) {}

  async overview(now = new Date()): Promise<AdminOverview> {
    const db = this.tenant.db;
    const days = lastDays(DAYS, now);
    const today = days[days.length - 1]!;
    const weekStart = days[days.length - 7]!;
    const since = new Date(now.getTime() - (DAYS + 1) * DAY_MS);
    const live = { deletedAt: null, archivedAt: null } as const;

    const spaces = await db.space.findMany({
      where: { deletedAt: null, archivedAt: null },
      select: { id: true, key: true, name: true, color: true, ticketInbox: true, rank: true },
      orderBy: { rank: 'asc' },
    });

    // Tüm Task/Bug'lar (sprint'e girebilen üst düzey işler): açık/tamamlanan, geciken, atananlar.
    const items = await db.workItem.findMany({
      where: {
        ...live,
        type: { in: ['TASK', 'BUG'] },
        space: { deletedAt: null, archivedAt: null },
      },
      select: {
        id: true,
        type: true,
        spaceId: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        severity: true,
        status: { select: { category: true } },
        assignees: { select: { userId: true } },
        inboundEmails: { where: { kind: 'NEW' }, take: 1, select: { id: true } },
      },
      take: SCAN_LIMIT,
    });

    const todayDate = new Date(`${today}T00:00:00Z`).getTime();
    const isDone = (i: (typeof items)[number]) => i.status.category === 'DONE';
    const overdue = (i: (typeof items)[number]) =>
      !isDone(i) && i.dueDate !== null && i.dueDate.getTime() < todayDate;

    // ---- Bug'lar
    const bugs = items.filter((i) => i.type === 'BUG');
    const openBugs = bugs.filter((b) => !isDone(b));
    const resolved = bugs.filter(isDone);
    const inbox = spaces.find((s) => s.ticketInbox);
    const openedOn = new Map<string, number>();
    const resolvedOn = new Map<string, number>();
    for (const b of bugs) {
      const o = dayKey(b.createdAt);
      openedOn.set(o, (openedOn.get(o) ?? 0) + 1);
      if (b.completedAt && isDone(b)) {
        const r = dayKey(b.completedAt);
        resolvedOn.set(r, (resolvedOn.get(r) ?? 0) + 1);
      }
    }
    const sumFrom = (m: Map<string, number>, from: string) =>
      days.filter((d) => d >= from).reduce((n, d) => n + (m.get(d) ?? 0), 0);
    const recentlyResolved = resolved.filter(
      (b) => b.completedAt && b.completedAt.getTime() >= now.getTime() - 30 * DAY_MS,
    );
    const avgHours =
      recentlyResolved.length > 0
        ? recentlyResolved.reduce(
            (sum, b) => sum + (b.completedAt!.getTime() - b.createdAt.getTime()) / 3_600_000,
            0,
          ) / recentlyResolved.length
        : null;
    const bySeverity = new Map<BugSeverity, number>();
    for (const b of openBugs) {
      if (b.severity) bySeverity.set(b.severity, (bySeverity.get(b.severity) ?? 0) + 1);
    }
    const emailBugs = bugs.filter((b) => b.inboundEmails.length > 0).length;

    // ---- E-posta çağrıları
    const mails = await db.inboundEmail.findMany({
      where: { receivedAt: { gte: since } },
      select: { kind: true, receivedAt: true },
      take: SCAN_LIMIT,
    });
    const mailsOn = (kind: 'NEW' | 'REPLY', from: string) =>
      mails.filter((m) => m.kind === kind && dayKey(m.receivedAt) >= from).length;

    // ---- Projeler ve aktif sprint ilerlemesi
    const sprints = await db.sprint.findMany({
      where: { status: 'ACTIVE', spaceId: { in: spaces.map((s) => s.id) } },
      select: { id: true, name: true, spaceId: true, startDate: true, endDate: true },
      orderBy: { startDate: 'desc' },
    });
    const sprintItems = await db.workItem.findMany({
      where: { ...live, sprintId: { in: sprints.map((s) => s.id) } },
      select: { sprintId: true, points: true, status: { select: { category: true } } },
      take: SCAN_LIMIT,
    });
    const progress = new Map<
      string,
      { done: number; total: number; donePts: number; totalPts: number }
    >();
    for (const it of sprintItems) {
      const p = progress.get(it.sprintId!) ?? { done: 0, total: 0, donePts: 0, totalPts: 0 };
      p.total += 1;
      p.totalPts += it.points ?? 0;
      if (it.status.category === 'DONE') {
        p.done += 1;
        p.donePts += it.points ?? 0;
      }
      progress.set(it.sprintId!, p);
    }
    const projects: AdminProject[] = spaces.map((space) => {
      const mine = items.filter((i) => i.spaceId === space.id);
      const sprint = sprints.find((s) => s.spaceId === space.id);
      const p = sprint ? progress.get(sprint.id) : undefined;
      const start = sprint ? sprint.startDate.getTime() : 0;
      const end = sprint ? sprint.endDate.getTime() : 0;
      return {
        id: space.id,
        key: space.key,
        name: space.name,
        color: space.color,
        inbox: space.ticketInbox,
        openItems: mine.filter((i) => !isDone(i)).length,
        doneItems: mine.filter(isDone).length,
        overdueItems: mine.filter(overdue).length,
        openBugs: mine.filter((i) => i.type === 'BUG' && !isDone(i)).length,
        sprint: sprint
          ? {
              id: sprint.id,
              name: sprint.name,
              startDate: dayKey(sprint.startDate),
              endDate: dayKey(sprint.endDate),
              doneItems: p?.done ?? 0,
              totalItems: p?.total ?? 0,
              donePoints: p?.donePts ?? 0,
              totalPoints: p?.totalPts ?? 0,
              daysLeft: Math.max(0, Math.round((end - todayDate) / DAY_MS) + 1),
              elapsedPercent: Math.min(
                100,
                Math.max(
                  0,
                  Math.round(((todayDate - start) / Math.max(end - start + DAY_MS, 1)) * 100),
                ),
              ),
            }
          : null,
      };
    });

    // ---- Tamamlanan iş akışı
    const doneOn = new Map<string, number>();
    for (const i of items) {
      if (isDone(i) && i.completedAt) {
        const d = dayKey(i.completedAt);
        doneOn.set(d, (doneOn.get(d) ?? 0) + 1);
      }
    }

    // ---- Ekip yükü: açık işleri en çok olan kişiler
    const load = new Map<string, { open: number; overdue: number }>();
    for (const i of items) {
      if (isDone(i)) continue;
      for (const a of i.assignees) {
        const l = load.get(a.userId) ?? { open: 0, overdue: 0 };
        l.open += 1;
        if (overdue(i)) l.overdue += 1;
        load.set(a.userId, l);
      }
    }
    const topIds = [...load.entries()].sort((a, b) => b[1].open - a[1].open).slice(0, 8);
    const people = await db.user.findMany({
      where: { id: { in: topIds.map(([id]) => id) } },
      select: { id: true, name: true, avatarVersion: true },
    });
    const members = await db.membership.count();

    const openItems = items.filter((i) => !isDone(i)).length;
    return {
      generatedAt: now.toISOString(),
      totals: {
        projects: spaces.filter((s) => !s.ticketInbox).length,
        members,
        openItems,
        overdueItems: items.filter(overdue).length,
        completedThisWeek: days
          .filter((d) => d >= weekStart)
          .reduce((n, d) => n + (doneOn.get(d) ?? 0), 0),
      },
      bugs: {
        total: bugs.length,
        open: openBugs.length,
        resolved: resolved.length,
        openUnassigned: openBugs.filter((b) => b.assignees.length === 0).length,
        newToday: openedOn.get(today) ?? 0,
        newThisWeek: sumFrom(openedOn, weekStart),
        resolvedToday: resolvedOn.get(today) ?? 0,
        resolvedThisWeek: sumFrom(resolvedOn, weekStart),
        resolutionRate: bugs.length === 0 ? 0 : Math.round((resolved.length / bugs.length) * 100),
        avgResolutionHours: avgHours === null ? null : Math.round(avgHours * 10) / 10,
        inboxPending: inbox ? openBugs.filter((b) => b.spaceId === inbox.id).length : 0,
        openBySeverity: BUG_SEVERITIES.map((severity) => ({
          severity,
          count: bySeverity.get(severity) ?? 0,
        })),
        bySource: { email: emailBugs, manual: bugs.length - emailBugs },
        daily: days.map((date) => ({
          date,
          opened: openedOn.get(date) ?? 0,
          resolved: resolvedOn.get(date) ?? 0,
        })),
      },
      tickets: {
        emailsToday: mailsOn('NEW', today),
        emailsThisWeek: mailsOn('NEW', weekStart),
        repliesThisWeek: mailsOn('REPLY', weekStart),
      },
      projects,
      throughput: days.map((date) => ({ date, completed: doneOn.get(date) ?? 0 })),
      workload: topIds.flatMap(([userId, l]) => {
        const person = people.find((p) => p.id === userId);
        return person
          ? [{ userId, name: person.name, avatarVersion: person.avatarVersion, ...l }]
          : [];
      }),
    };
  }
}
