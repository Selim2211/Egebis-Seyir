import type {
  AnalyticsFlow,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };
const DAY = 86_400_000;
const istanbul = (ms: number) =>
  new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

/** ADR-144: akış analizi — bitirme süresi, durumlarda bekleme, WIP ve yaşlanma (durum geçişi olaylarından). */
describe('Analiz: akış ve darboğaz (gerçek veritabanı)', { timeout: 60_000 }, () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let spaceId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });

  const flow = async (query = '') =>
    (await owner.get(api(`/analytics/flow${query}`)).expect(200)).body as AnalyticsFlow;

  it('geçiş geçmişinden bitirme süresi, durumlarda bekleme, WIP ve yaşlanma hesaplanır', async () => {
    const created = await owner
      .post(api('/spaces'), { name: 'Akış', key: 'FLW', color: '#7C3AED' })
      .expect(201);
    spaceId = (created.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const byCat = (c: string) => detail.statuses.find((s) => s.category === c)!;
    const todo = byCat('NOT_STARTED');
    const active = byCat('ACTIVE');
    const done = byCat('DONE');
    const item = async (title: string) =>
      (await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title }).expect(201))
        .body as CreatedItem;

    const prisma = ctx.app.get(PrismaService);
    const base = Date.now();
    const at = (daysAgo: number) => new Date(base - daysAgo * DAY);
    const event = (itemId: string, daysAgo: number, from: string, to: string) =>
      prisma.activityEvent.create({
        data: {
          workspaceId: ws,
          entityType: 'item',
          entityId: itemId,
          action: 'item.updated',
          changes: { statusId: { from, to } },
          createdAt: at(daysAgo),
        },
      });

    // A: 10 gün önce açıldı, 8 gün önce "Yapılıyor"a girdi, 2 gün önce bitti → bitirme 6 gün, toplam 8 gün.
    const a = await item('A geçmişli');
    await prisma.workItem.update({
      where: { id: a.id },
      data: { createdAt: at(10), completedAt: at(2), statusId: done.id },
    });
    await event(a.id, 8, todo.id, active.id);
    await event(a.id, 2, active.id, done.id);
    // B: geçmişi yok; 6 gün önce açıldı, 1 gün önce bitti → yalnızca toplam süre 5 gün.
    const b = await item('B geçmişsiz');
    await prisma.workItem.update({
      where: { id: b.id },
      data: { createdAt: at(6), completedAt: at(1), statusId: done.id },
    });
    // C: açık, 20 gündür "Yapılıyor"da hareketsiz.
    const c = await item('C takılı');
    await prisma.workItem.update({
      where: { id: c.id },
      data: { createdAt: at(30), statusId: active.id },
    });
    await event(c.id, 20, todo.id, active.id);
    // D: açık, henüz başlanmamış.
    await item('D bekleyen');

    const res = await flow();
    expect(res.totals).toMatchObject({ done: 2, withHistory: 1 });
    expect(res.totals.cycleDays).toMatchObject({ avg: 6, median: 6, p85: 6 });
    expect(res.totals.leadDays).toMatchObject({ avg: 6.5, p85: 8 });
    expect(res.previous.done).toBe(0);

    // Bekleme: A için "Yapılıyor" 6 gün, "Yapılacak" 2 gün; en uzun üstte.
    expect(res.dwell.map((d) => [d.status, d.avgDays, d.items])).toEqual([
      [active.name, 6, 1],
      [todo.name, 2, 1],
    ]);

    // WIP: şu an C (kesin). 5 gün önceki gün A ve C birlikte "Yapılıyor"daydı, bugün yalnızca C.
    expect(res.wip.current).toBe(1);
    expect(res.wip.trackedItems).toBe(2);
    expect(res.wip.totalItems).toBe(4);
    const wipOn = (daysAgo: number) =>
      res.wip.series.find((p) => p.day === istanbul(base - daysAgo * DAY))?.count;
    expect(wipOn(5)).toBe(2);
    expect(wipOn(0)).toBe(1);
    expect(wipOn(25)).toBe(0);

    // Yaşlanma: yalnızca "Yapılıyor"daki açık işler sayılır (D değil).
    expect(res.aging.buckets).toEqual([
      { bucket: 'D7', count: 0 },
      { bucket: 'D14', count: 0 },
      { bucket: 'D30', count: 1 },
      { bucket: 'D30P', count: 0 },
    ]);
    expect(res.aging.stale).toHaveLength(1);
    expect(res.aging.stale[0]).toMatchObject({ title: 'C takılı', days: 20, status: active.name });
    expect(res.aging.stale[0]!.key).toMatch(/^FLW-\d+$/);

    // Nokta serisi toplamı kutucukla tutar; Proje süzgeci aynı sonucu verir.
    expect(res.series.reduce((n, p) => n + p.done, 0)).toBe(2);
    const scoped = await flow(`?spaceId=${spaceId}`);
    expect(scoped.totals.done).toBe(2);
    const sprintGrain = await flow('?grain=sprint');
    expect(sprintGrain.series.reduce((n, p) => n + p.done, 0)).toBe(2);
  });

  it('yalnızca Owner/Admin görür; geçersiz tarih aralığı reddedilir', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/analytics/flow')).expect(403);
    await owner.get(api('/analytics/flow?from=2026-10-10&to=2026-10-01')).expect(400);
  });
});
