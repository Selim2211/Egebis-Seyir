import type { AnalyticsCapacity, Created, CreatedItem, HierarchyResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };
const AYSE = { email: 'ayse@example.com', name: 'Ayşe Kara', password: 'ayse-pass' };

/** Geçen haftanın Pazartesisi ve Pazarı (UTC takvim günü; test saati sabit gün seçmesin diye bugünden türetilir). */
function lastWeek() {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow - 7),
  );
  const at = (n: number) => new Date(monday.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { from: at(0), to: at(6), at };
}

/** ADR-146: iş yükü ve kapasite — kalan tahmin, aşırı yük/boşta, doluluk, kayıt günü ve ısı haritası. */
describe('Analiz: iş yükü ve kapasite (gerçek veritabanı)', { timeout: 60_000 }, () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
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

  it('kişi başı kalan tahmin, durum, doluluk, kayıt günü ve haftanın günü dağılımı hesaplanır', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await inviteAndAccept(ctx, owner, ws, AYSE);
    const idOf = async (c: Client) =>
      ((await c.get('/api/auth/me').expect(200)).body as { user: { id: string } }).user.id;
    const ownerId = await idOf(owner);
    const elifId = await idOf(elif);

    const created = await owner
      .post(api('/spaces'), { name: 'Kapasite', key: 'KAP', color: '#7C3AED' })
      .expect(201);
    const spaceId = (created.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const item = async (body: Record<string, unknown>) =>
      (await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', ...body }).expect(201))
        .body as CreatedItem;

    // Sahip: 50 + 40 saat tahmin (2 haftalık kapasite 80'i aşar) + tahminsiz 1 iş.
    const a = await item({ title: 'A', assigneeIds: [ownerId], points: 5, estimateHours: 50 });
    await item({ title: 'B', assigneeIds: [ownerId], points: 3, estimateHours: 40 });
    await item({ title: 'E tahminsiz', assigneeIds: [ownerId] });
    // Elif: 8 saat kendi + 10 saatlik ortak işin yarısı (5) = 13 saat.
    await item({ title: 'C', assigneeIds: [elifId], estimateHours: 8 });
    await item({ title: 'D ortak', assigneeIds: [ownerId, elifId], estimateHours: 10 });

    const week = lastWeek();
    // Sahip: Pzt 8 sa, Sal 8 sa, Cmt 4 sa → 20 saat; hafta içi 2 gün kayıt.
    for (const [day, minutes] of [
      [week.at(0), 480],
      [week.at(1), 480],
      [week.at(5), 240],
    ] as const) {
      await owner.post(api(`/items/${a.id}/time`), { day, minutes }).expect(201);
    }

    const res = (
      await owner
        .get(api(`/analytics/capacity?from=${week.from}&to=${week.to}&weeklyHours=40`))
        .expect(200)
    ).body as AnalyticsCapacity;

    expect(res.workdays).toBe(5);
    expect(res.weeklyHours).toBe(40);
    // En çok kalan tahmini olan üstte: sahip (50+40+5), Elif (13), Ayşe (0).
    expect(res.people.map((p) => p.user.name)).toEqual([
      res.people[0]!.user.name,
      'Elif Demir',
      'Ayşe Kara',
    ]);
    const [me, el, ay] = res.people;
    expect(me!.user.id).toBe(ownerId);
    expect(me).toMatchObject({
      status: 'over',
      open: { items: 4, remainingHours: 95, unestimated: 1, points: 8 },
      logged: {
        hours: 20,
        utilizationPct: 50,
        loggingDays: 2,
        loggingPct: 40,
        avgPerLoggedDay: 6.7,
      },
      byWeekday: [8, 8, 0, 0, 0, 4, 0],
    });
    expect(me!.days).toEqual([
      { day: week.at(0), hours: 8 },
      { day: week.at(1), hours: 8 },
      { day: week.at(5), hours: 4 },
    ]);
    expect(el).toMatchObject({
      status: 'ok',
      open: { items: 2, remainingHours: 13, unestimated: 0 },
      logged: { hours: 0, utilizationPct: 0, loggingDays: 0, loggingPct: 0 },
    });
    expect(ay).toMatchObject({ status: 'idle', open: { items: 0, remainingHours: 0 } });

    // Ekip: 3 kişi × 40 saat = 120 saat kapasite, 20 saat kayıt.
    expect(res.team).toMatchObject({
      capacityHours: 120,
      loggedHours: 20,
      utilizationPct: 17,
      overloaded: 1,
      idle: 1,
      avgLoggingPct: 13, // (40 + 0 + 0) / 3
    });
    expect(res.weekly).toEqual([{ weekStart: week.from, hours: 20, capacityHours: 120 }]);
  });

  it('haftalık saat 1–80 arasında olmalı; yalnızca Owner/Admin görür', async () => {
    await owner.get(api('/analytics/capacity?weeklyHours=0')).expect(400);
    await owner.get(api('/analytics/capacity?weeklyHours=100')).expect(400);
    const defaulted = (await owner.get(api('/analytics/capacity')).expect(200))
      .body as AnalyticsCapacity;
    expect(defaulted.weeklyHours).toBe(40);
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/analytics/capacity')).expect(403);
  });
});
