import { Injectable } from '@nestjs/common';
import {
  addDays,
  buildTimesheet,
  ERROR_CODES,
  formatItemKey,
  localDate,
  MAX_TIMESHEET_DAYS,
  REPORT_TIME_ZONE,
  SPACE_PERMISSIONS as S,
  timerMinutes,
  weekdayIndex,
  type ItemTime,
  type LogTimeRequest,
  type MyTimer,
  type Timesheet,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { archivedParent, forbidden, notFound } from '../spaces/space-errors';
import { dateOnly, fail, toDate, type TenantTx } from '../work-items/item-support';

const MAX_SUBTREE_DEPTH = 5;
const TOP_ITEMS = 10;

const today = () => localDate(new Date(), REPORT_TIME_ZONE);

/** Zaman takibi: sayaç, elle giriş, öğe toplamı ve zaman çizelgesi (Faz 4.3, ADR-075). */
@Injectable()
export class TimeService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  /** Silinmemiş öğe; yazmada arşivli Space reddedilir. */
  private async liveItem(itemId: string, write: boolean) {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, space: { deletedAt: null } },
      select: {
        id: true,
        keyPrefix: true,
        number: true,
        title: true,
        estimateHours: true,
        archivedAt: true,
        space: { select: { archivedAt: true } },
      },
    });
    if (!item) throw notFound();
    if (write && (item.archivedAt || item.space.archivedAt)) throw archivedParent();
    return { ...item, key: formatItemKey(item.keyPrefix, item.number) };
  }

  /** Öğe ve tüm alt öğelerinin kimlikleri. */
  private async subtreeIds(itemId: string): Promise<string[]> {
    const ids = [itemId];
    let frontier = [itemId];
    for (let depth = 0; depth < MAX_SUBTREE_DEPTH && frontier.length > 0; depth += 1) {
      const children = await this.tenant.db.workItem.findMany({
        where: { parentId: { in: frontier }, deletedAt: null },
        select: { id: true },
      });
      frontier = children.map((c) => c.id);
      ids.push(...frontier);
    }
    return ids;
  }

  // ---------- Öğe zamanı ----------

  async itemTime(itemId: string): Promise<ItemTime> {
    const { actorId } = this.ctx;
    const item = await this.liveItem(itemId, false);
    const db = this.tenant.db;
    const [entries, ids, timer] = await Promise.all([
      db.timeEntry.findMany({
        where: { workItemId: itemId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ day: 'desc' }, { createdAt: 'desc' }],
      }),
      this.subtreeIds(itemId),
      db.activeTimer.findUnique({ where: { userId: actorId } }),
    ]);
    const total = await db.timeEntry.aggregate({
      where: { workItemId: { in: ids } },
      _sum: { minutes: true },
    });
    const moderator = this.can(S.SPACE_SETTINGS);
    return {
      entries: entries.map((e) => ({
        id: e.id,
        user: e.user,
        day: dateOnly(e.day)!,
        minutes: e.minutes,
        note: e.note,
        source: e.source,
        canDelete: e.userId === actorId || moderator,
      })),
      ownMinutes: entries.reduce((sum, e) => sum + e.minutes, 0),
      totalMinutes: total._sum.minutes ?? 0,
      estimateHours: item.estimateHours,
      myTimerStartedAt: timer?.workItemId === itemId ? timer.startedAt.toISOString() : null,
      canLog: this.can(S.WORK_ITEM_WRITE),
    };
  }

  async log(itemId: string, input: LogTimeRequest): Promise<{ id: string }> {
    const { workspaceId, actorId } = this.ctx;
    await this.liveItem(itemId, true);
    if (input.day > today()) throw fail(ERROR_CODES.TIME_RANGE_INVALID);
    const entry = await this.tenant.db.timeEntry.create({
      data: {
        workspaceId,
        workItemId: itemId,
        userId: actorId,
        day: toDate(input.day)!,
        minutes: input.minutes,
        note: input.note || null,
        source: 'MANUAL',
      },
    });
    return { id: entry.id };
  }

  async remove(itemId: string, entryId: string): Promise<void> {
    const { actorId } = this.ctx;
    await this.liveItem(itemId, true);
    const entry = await this.tenant.db.timeEntry.findFirst({
      where: { id: entryId, workItemId: itemId },
    });
    if (!entry) throw notFound();
    if (entry.userId !== actorId && !this.can(S.SPACE_SETTINGS)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    await this.tenant.db.timeEntry.delete({ where: { id: entryId } });
  }

  // ---------- Sayaç ----------

  async myTimer(): Promise<MyTimer> {
    const timer = await this.tenant.db.activeTimer.findUnique({
      where: { userId: this.ctx.actorId },
      include: {
        workItem: { select: { keyPrefix: true, number: true, title: true, deletedAt: true } },
      },
    });
    if (!timer || timer.workItem.deletedAt) return { timer: null };
    return {
      timer: {
        itemId: timer.workItemId,
        itemKey: formatItemKey(timer.workItem.keyPrefix, timer.workItem.number),
        itemTitle: timer.workItem.title,
        startedAt: timer.startedAt.toISOString(),
      },
    };
  }

  /** Sayacı bu öğede başlatır; başka öğede çalışan sayaç önce kaydedilip durdurulur. */
  async start(itemId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.liveItem(itemId, true);
    await this.tenant.db.$transaction(async (tx) => {
      const running = await tx.activeTimer.findUnique({ where: { userId: actorId } });
      if (running?.workItemId === itemId) return;
      if (running) await this.finish(tx, running);
      await tx.activeTimer.create({ data: { userId: actorId, workspaceId, workItemId: itemId } });
    });
  }

  /** Çalışan sayacı durdurur ve süreyi kaydeder. */
  async stop(): Promise<{ minutes: number }> {
    const timer = await this.tenant.db.activeTimer.findUnique({
      where: { userId: this.ctx.actorId },
    });
    if (!timer) throw fail(ERROR_CODES.TIMER_NOT_RUNNING, 409);
    return this.tenant.db.$transaction((tx) => this.finish(tx, timer));
  }

  private async finish(
    tx: TenantTx,
    timer: { userId: string; workspaceId: string; workItemId: string; startedAt: Date },
  ): Promise<{ minutes: number }> {
    const minutes = timerMinutes(timer.startedAt, new Date());
    await tx.timeEntry.create({
      data: {
        workspaceId: timer.workspaceId,
        workItemId: timer.workItemId,
        userId: timer.userId,
        day: toDate(localDate(timer.startedAt, REPORT_TIME_ZONE))!,
        minutes,
        source: 'TIMER',
      },
    });
    await tx.activeTimer.delete({ where: { userId: timer.userId } });
    return { minutes };
  }

  // ---------- Zaman çizelgesi ----------

  /** Space'te kişi × gün süre çizelgesi; varsayılan aralık içinde bulunulan hafta (Pazartesi–Pazar). */
  async timesheet(spaceId: string, from?: string, to?: string): Promise<Timesheet> {
    const db = this.tenant.db;
    const space = await db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();

    const now = today();
    const start = from ?? addDays(now, -weekdayIndex(now));
    const end = to ?? addDays(start, 6);
    const span = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
    if (span < 1 || span > MAX_TIMESHEET_DAYS) throw fail(ERROR_CODES.TIME_RANGE_INVALID);

    const entries = await db.timeEntry.findMany({
      where: {
        workItem: { spaceId, deletedAt: null },
        day: { gte: toDate(start)!, lte: toDate(end)! },
        userId: { not: null },
      },
      include: {
        user: { select: { id: true, name: true } },
        workItem: {
          select: { keyPrefix: true, number: true, title: true, estimateHours: true, id: true },
        },
      },
    });
    const sheet = buildTimesheet(
      entries.map((e) => ({ userId: e.userId!, day: dateOnly(e.day)!, minutes: e.minutes })),
      start,
      end,
    );
    const users = new Map(entries.map((e) => [e.userId!, e.user!]));

    const perItem = new Map<
      string,
      { key: string; title: string; minutes: number; estimateHours: number | null }
    >();
    for (const e of entries) {
      const row = perItem.get(e.workItem.id) ?? {
        key: formatItemKey(e.workItem.keyPrefix, e.workItem.number),
        title: e.workItem.title,
        minutes: 0,
        estimateHours: e.workItem.estimateHours,
      };
      row.minutes += e.minutes;
      perItem.set(e.workItem.id, row);
    }

    return {
      from: start,
      to: end,
      days: sheet.days,
      rows: sheet.rows.map((r) => ({
        user: users.get(r.userId)!,
        perDay: r.perDay,
        total: r.total,
      })),
      dayTotals: sheet.dayTotals,
      total: sheet.total,
      topItems: [...perItem.values()].sort((a, b) => b.minutes - a.minutes).slice(0, TOP_ITEMS),
    };
  }
}
