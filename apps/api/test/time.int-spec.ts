import {
  addDays,
  localDate,
  REPORT_TIME_ZONE,
  type Created,
  type CreatedItem,
  type HierarchyResponse,
  type ItemTime,
  type MyTimer,
  type Timesheet,
} from '@scrum/shared';
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
const TODAY = localDate(new Date(), REPORT_TIME_ZONE);

describe('Zaman takibi (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const time = async (id: string, client = owner) =>
    (await client.get(api(`/items/${id}/time`)).expect(200)).body as ItemTime;
  const log = (id: string, body: Record<string, unknown>, client = owner) =>
    client.post(api(`/items/${id}/time`), body);
  const timer = async (client = owner) =>
    ((await client.get(api('/timer')).expect(200)).body as MyTimer).timer;

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

  describe('elle giriş', () => {
    it('süre kaydedilir, öğede toplanır ve silinir', async () => {
      const s = await space();
      const task = await item(s.listId, { type: 'TASK', title: 'Rapor', estimateHours: 4 });
      await log(task.id, { day: TODAY, minutes: 90, note: 'Taslak' }).expect(201);
      await log(task.id, { day: addDays(TODAY, -1), minutes: 30 }).expect(201);

      const data = await time(task.id);
      expect(data).toMatchObject({
        ownMinutes: 120,
        totalMinutes: 120,
        estimateHours: 4,
        myTimerStartedAt: null,
        canLog: true,
      });
      expect(data.entries.map((e) => [e.day, e.minutes, e.source])).toEqual([
        [TODAY, 90, 'MANUAL'],
        [addDays(TODAY, -1), 30, 'MANUAL'],
      ]);
      expect(data.entries[0]).toMatchObject({ note: 'Taslak', canDelete: true });

      await owner.delete(api(`/items/${task.id}/time/${data.entries[0]!.id}`)).expect(204);
      expect((await time(task.id)).ownMinutes).toBe(30);
    });

    it('geçersiz süre, gelecek gün ve eksik alan reddedilir', async () => {
      const s = await space();
      const task = await item(s.listId, { type: 'TASK', title: 'T' });
      await log(task.id, { day: TODAY, minutes: 0 }).expect(400);
      await log(task.id, { day: TODAY, minutes: 1441 }).expect(400);
      await log(task.id, { day: TODAY }).expect(400);
      const future = await log(task.id, { day: addDays(TODAY, 3), minutes: 30 }).expect(422);
      expect(future.body).toEqual({ code: 'TIME_RANGE_INVALID' });
    });

    it('üst öğenin toplamı alt öğeleri de içerir', async () => {
      const s = await space();
      const story = await item(s.listId, { type: 'STORY', title: 'S' });
      const task = await item(s.listId, { type: 'TASK', title: 'T', parentId: story.id });
      const sub = await item(s.listId, { type: 'SUBTASK', title: 'ST', parentId: task.id });
      await log(story.id, { day: TODAY, minutes: 10 }).expect(201);
      await log(task.id, { day: TODAY, minutes: 20 }).expect(201);
      await log(sub.id, { day: TODAY, minutes: 40 }).expect(201);

      expect(await time(story.id)).toMatchObject({ ownMinutes: 10, totalMinutes: 70 });
      expect(await time(task.id)).toMatchObject({ ownMinutes: 20, totalMinutes: 60 });
    });
  });

  describe('sayaç', () => {
    it('başlar, tek sayaç kuralı uygulanır, durunca süre yazılır', async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'TASK', title: 'A' });
      const b = await item(s.listId, { type: 'TASK', title: 'B' });

      expect(await timer()).toBeNull();
      await owner.post(api(`/items/${a.id}/timer/start`), {}).expect(204);
      expect(await timer()).toMatchObject({ itemId: a.id, itemKey: 'MOB-1', itemTitle: 'A' });
      expect((await time(a.id)).myTimerStartedAt).not.toBeNull();

      // Aynı öğede yeniden başlatmak zararsız; başka öğede başlatmak öncekini kaydeder.
      await owner.post(api(`/items/${a.id}/timer/start`), {}).expect(204);
      await owner.post(api(`/items/${b.id}/timer/start`), {}).expect(204);
      expect(await timer()).toMatchObject({ itemId: b.id });
      const first = await time(a.id);
      expect(first.entries).toHaveLength(1);
      expect(first.entries[0]).toMatchObject({ source: 'TIMER', minutes: 1, day: TODAY });

      const stopped = await owner.post(api('/timer/stop'), {}).expect(200);
      expect((stopped.body as { minutes: number }).minutes).toBeGreaterThanOrEqual(1);
      expect(await timer()).toBeNull();
      expect((await time(b.id)).entries).toHaveLength(1);
    });

    it('çalışan sayaç yokken durdurmak 409; silinen öğenin sayacı kalkar', async () => {
      const s = await space();
      const task = await item(s.listId, { type: 'TASK', title: 'T' });
      const none = await owner.post(api('/timer/stop'), {}).expect(409);
      expect(none.body).toEqual({ code: 'TIMER_NOT_RUNNING' });

      await owner.post(api(`/items/${task.id}/timer/start`), {}).expect(204);
      await owner.delete(api(`/items/${task.id}`)).expect(204);
      expect(await timer()).toBeNull();
    });
  });

  describe('zaman çizelgesi', () => {
    it('kişi × gün toplar; en çok süre harcanan öğeleri listeler', async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'TASK', title: 'A', estimateHours: 2 });
      const b = await item(s.listId, { type: 'TASK', title: 'B' });
      await log(a.id, { day: TODAY, minutes: 60 }).expect(201);
      await log(a.id, { day: addDays(TODAY, -1), minutes: 30 }).expect(201);
      await log(b.id, { day: TODAY, minutes: 15 }).expect(201);

      const from = addDays(TODAY, -2);
      const res = await owner
        .get(api(`/spaces/${s.id}/timesheet?from=${from}&to=${TODAY}`))
        .expect(200);
      const sheet = res.body as Timesheet;
      expect(sheet.days).toEqual([from, addDays(TODAY, -1), TODAY]);
      expect(sheet.rows).toHaveLength(1);
      expect(sheet.rows[0]!.user.name).toBe('Zeynep Kaya');
      expect(sheet.rows[0]!.perDay).toEqual([0, 30, 75]);
      expect(sheet.rows[0]!.total).toBe(105);
      expect(sheet.dayTotals).toEqual([0, 30, 75]);
      expect(sheet.total).toBe(105);
      expect(sheet.topItems.map((i) => [i.key, i.minutes, i.estimateHours])).toEqual([
        ['MOB-1', 90, 2],
        ['MOB-2', 15, null],
      ]);
    });

    it('varsayılan aralık içinde bulunulan haftadır; aşırı geniş aralık reddedilir', async () => {
      const s = await space();
      const res = await owner.get(api(`/spaces/${s.id}/timesheet`)).expect(200);
      const sheet = res.body as Timesheet;
      expect(sheet.days).toHaveLength(7);
      expect(sheet.days).toContain(TODAY);
      await owner.get(api(`/spaces/${s.id}/timesheet?from=2026-01-01&to=2026-12-31`)).expect(422);
      await owner.get(api(`/spaces/${s.id}/timesheet?from=2026-10-10&to=2026-10-01`)).expect(422);
    });
  });

  describe('yetki', () => {
    it('Stakeholder görür ama giremez; başkasının girişini silemez', async () => {
      const s = await space();
      const task = await item(s.listId, { type: 'TASK', title: 'T' });
      await log(task.id, { day: TODAY, minutes: 30 }).expect(201);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      const view = await time(task.id, elif);
      expect(view).toMatchObject({ canLog: false, ownMinutes: 30 });
      await log(task.id, { day: TODAY, minutes: 10 }, elif).expect(403);
      await elif.post(api(`/items/${task.id}/timer/start`), {}).expect(403);

      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await log(task.id, { day: TODAY, minutes: 10 }, elif).expect(201);
      const entries = (await time(task.id, elif)).entries;
      const others = entries.find((e) => e.user?.name === 'Zeynep Kaya')!;
      expect(others.canDelete).toBe(false);
      await elif.delete(api(`/items/${task.id}/time/${others.id}`)).expect(403);
    });

    it('özel Space’in zamanı üye olmayana görünmez; arşivli Space’e giriş yapılamaz', async () => {
      const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
      const task = await item(hidden.listId, { type: 'TASK', title: 'T' });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(api(`/items/${task.id}/time`)).expect(404);
      await elif.get(api(`/spaces/${hidden.id}/timesheet`)).expect(404);

      await owner.post(api(`/spaces/${hidden.id}/archive`), {}).expect(204);
      await log(task.id, { day: TODAY, minutes: 10 }).expect(409);
    });
  });
});
