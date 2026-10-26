import type {
  AnalyticsCompare,
  AnalyticsPeople,
  AnalyticsPerson,
  AnalyticsProject,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
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

/** ADR-143: kişi ve Proje analizi — ölçütler, çoklu atamada pay bölüşümü, erişim ve karşılaştırma. */
describe('Analiz modülü (gerçek veritabanı)', { timeout: 60_000 }, () => {
  let ctx: TestContext;
  let owner: Client;
  let elif: Client;
  let ws: string;
  let ownerId: string;
  let elifId: string;
  let spaceId: string;
  let sprintId: string;
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
    elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    ownerId = ((await owner.get('/api/auth/me').expect(200)).body as { user: { id: string } }).user
      .id;
    elifId = ((await elif.get('/api/auth/me').expect(200)).body as { user: { id: string } }).user
      .id;

    const created = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    spaceId = (created.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const done = detail.statuses.find((s) => s.category === 'DONE')!.id;
    const todo = detail.statuses.find((s) => s.category !== 'DONE')!.id;
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const item = async (body: Record<string, unknown>) =>
      (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;

    const t1 = await item({
      type: 'TASK',
      title: 'T1',
      assigneeIds: [ownerId],
      points: 5,
      estimateHours: 4,
      dueDate: nextMonth,
    });
    const t2 = await item({
      type: 'TASK',
      title: 'T2',
      assigneeIds: [ownerId, elifId],
      points: 8,
      estimateHours: 6,
      dueDate: yesterday,
    });
    const b1 = await item({ type: 'BUG', title: 'B1', assigneeIds: [elifId] });
    const t4 = await item({ type: 'TASK', title: 'T4 yeniden açılan', assigneeIds: [ownerId] });
    await item({ type: 'TASK', title: 'T3 açık', assigneeIds: [ownerId], points: 3 });

    // Sprint 1: T1 ve T2 sprint'te.
    const sprint = (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'Sprint 1',
          goal: 'Hedef',
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
        })
        .expect(201)
    ).body as Created;
    sprintId = sprint.id;
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [t1.id, t2.id], sprintId })
      .expect(204);
    await owner.post(api(`/sprints/${sprintId}/start`), {}).expect(204);

    for (const id of [t1.id, t2.id, b1.id]) {
      await owner.patch(api(`/items/${id}`), { statusId: done }).expect(204);
    }
    // T4: önce tamamlanır, sonra yeniden açılır.
    await owner.patch(api(`/items/${t4.id}`), { statusId: done }).expect(204);
    await owner.patch(api(`/items/${t4.id}`), { statusId: todo }).expect(204);
    // Sahip T1 üzerinde 2 saat çalıştı.
    await owner
      .post(api(`/items/${t1.id}/time`), {
        day: new Date().toISOString().slice(0, 10),
        minutes: 120,
      })
      .expect(201);
  });

  const person = async (client: Client, id: string, query = '') =>
    (await client.get(api(`/analytics/person/${id}${query}`)).expect(200)).body as AnalyticsPerson;

  it('kişi analizi: biten iş, puan payı, saat, termine uyum, yeniden açılan ve dağılımlar', async () => {
    const res = await person(owner, ownerId);
    expect(res.totals).toMatchObject({
      done: 2, // T1, T2 (T4 yeniden açıldı, T3 açık)
      points: 9, // 5 + 8/2
      hours: 2,
      bugsFixed: 0,
      reopened: 1,
      estimateHours: 7, // 4 + 6/2
      onTimePct: 50, // T1 zamanında, T2 geç
    });
    expect(res.totals.avgDays).not.toBeNull();
    expect(res.previous.done).toBe(0);
    expect(res.byProject).toHaveLength(1);
    expect(res.byProject[0]).toMatchObject({ space: { key: 'MOB' }, done: 2, points: 9 });
    // Sprint satırı: iki işin listesi.
    const row = res.bySprint.find((s) => s.sprint?.name === 'Sprint 1')!;
    expect(row.items.map((i) => i.title).sort()).toEqual(['T1', 'T2']);
    expect(row.points).toBe(9);
    // Seri toplamı kutucukla tutar.
    expect(res.series.reduce((n, p) => n + p.done, 0)).toBe(res.totals.done);
    expect(res.series.reduce((n, p) => n + p.hours, 0)).toBe(res.totals.hours);

    const elifRes = await person(owner, elifId);
    expect(elifRes.totals).toMatchObject({ done: 2, points: 4, bugsFixed: 1, hours: 0 });
  });

  it('sprint zaman diliminde nokta sprint olur; ay ve hafta aralığı boşları sıfırla doldurur', async () => {
    const bySprint = await person(owner, ownerId, '?grain=sprint');
    const point = bySprint.series.find((p) => p.key === sprintId)!;
    expect(point).toMatchObject({ label: 'Sprint 1', done: 2, points: 9 });

    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);
    const weekly = await person(owner, ownerId, `?grain=week&from=${from}&to=${today}`);
    expect(weekly.series.length).toBeGreaterThanOrEqual(4);
    expect(weekly.series.some((p) => p.done === 0)).toBe(true);
    expect(weekly.series.reduce((n, p) => n + p.done, 0)).toBe(2);
    // Önceki dönem tarihleri aynı uzunlukta ve bitişik.
    expect(weekly.range.prevTo < weekly.range.from).toBe(true);

    const monthly = await person(owner, ownerId, '?grain=month');
    expect(monthly.series.every((p) => /^\d{4}-\d{2}-01$/.test(p.key))).toBe(true);
  });

  it('Proje analizi: iş bir kez sayılır, yeniden açma bir kez, kişilere katkı ve tür dağılımı', async () => {
    const res = (await owner.get(api(`/analytics/project/${spaceId}`)).expect(200))
      .body as AnalyticsProject;
    expect(res.space.key).toBe('MOB');
    expect(res.totals).toMatchObject({ done: 3, points: 13, reopened: 1, bugsFixed: 1 });
    expect(res.byType).toEqual({ task: 2, subtask: 0, bug: 1 });
    expect(res.byPerson.map((p) => p.user.id).sort()).toEqual([elifId, ownerId].sort());
    expect(res.series.reduce((n, p) => n + p.done, 0)).toBe(3);
    expect(res.series.reduce((n, p) => n + p.bugsOpened, 0)).toBe(1);
  });

  it('karşılaştırma: ortak zaman ekseni, kişi başı ölçüt; 5’ten fazla ya da boş seçim reddedilir', async () => {
    const res = (
      await owner.get(api(`/analytics/compare?userIds=${ownerId},${elifId}&grain=week`)).expect(200)
    ).body as AnalyticsCompare;
    expect(res.users).toHaveLength(2);
    const [a, b] = res.users;
    expect(a!.series.map((p) => p.key)).toEqual(res.buckets.map((x) => x.key));
    expect(b!.series.map((p) => p.key)).toEqual(res.buckets.map((x) => x.key));
    expect(a!.totals.points).toBe(9);
    expect(b!.totals.points).toBe(4);

    const six = Array.from({ length: 6 }, () => ownerId).join(',');
    // Aynı kimlik tekilleşir: tek kişi geçerlidir.
    await owner.get(api(`/analytics/compare?userIds=${six}`)).expect(200);
    const many = [
      ownerId,
      elifId,
      ...Array.from({ length: 4 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`),
    ];
    await owner.get(api(`/analytics/compare?userIds=${many.join(',')}`)).expect(400);
    await owner.get(api('/analytics/compare')).expect(400);
  });

  it('kişi listesi sıralanır; geçersiz tarih aralığı reddedilir', async () => {
    const res = (await owner.get(api('/analytics/people')).expect(200)).body as AnalyticsPeople;
    expect(res.people.map((p) => p.user.id)).toEqual([ownerId, elifId]);
    expect(res.people[0]!.totals.points).toBe(9);
    await owner.get(api('/analytics/people?from=2026-10-10&to=2026-10-01')).expect(400);
    await owner.get(api('/analytics/people?from=2020-01-01&to=2026-10-01')).expect(400);
  });

  it('üye yalnızca kendi analizini görür; Proje, karşılaştırma ve kişi listesi yönetici içindir', async () => {
    const own = await person(elif, elifId);
    expect(own.totals).toMatchObject({ done: 2, points: 4 });
    await elif.get(api(`/analytics/person/${ownerId}`)).expect(403);
    await elif.get(api('/analytics/people')).expect(403);
    await elif.get(api(`/analytics/project/${spaceId}`)).expect(403);
    await elif.get(api(`/analytics/compare?userIds=${elifId}`)).expect(403);
  });
});
