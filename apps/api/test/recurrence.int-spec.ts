import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
  WorkItemDetail,
  WorkItemsResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

describe('Tekrarlayan görevler (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const id = (
      await owner
        .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED' })
        .expect(201)
    ).body as Created;
    const detail = (await owner.get(api(`/spaces/${id.id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return {
      listId: tree.spaces.find((s) => s.id === id.id)!.lists[0]!.id,
      todo: detail.statuses.find((s) => s.category === 'NOT_STARTED')!.id,
      done: detail.statuses.find((s) => s.category === 'DONE')!.id,
    };
  };
  const create = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const items = async (listId: string) =>
    ((await owner.get(api(`/lists/${listId}/items`)).expect(200)).body as WorkItemsResponse).items;

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

  it('tamamlanınca bir sonraki örnek üretilir; kural yeni örneğe geçer', async () => {
    const s = await space();
    const task = await create(s.listId, {
      type: 'TASK',
      title: 'Haftalık rapor',
      startDate: '2030-03-02',
      dueDate: '2030-03-04',
      priority: 'HIGH',
    });
    const child = await create(s.listId, {
      type: 'SUBTASK',
      title: 'Veriyi topla',
      parentId: task.id,
      dueDate: '2030-03-03',
    });
    await owner
      .patch(api(`/items/${task.id}`), { recurrence: { freq: 'WEEKLY', interval: 1 } })
      .expect(204);
    expect((await detail(task.id)).recurrence).toEqual({ freq: 'WEEKLY', interval: 1 });

    await owner.patch(api(`/items/${child.id}`), { statusId: s.done }).expect(204);
    await owner.patch(api(`/items/${task.id}`), { statusId: s.done }).expect(204);

    const rows = await items(s.listId);
    const next = rows.find((r) => r.title === 'Haftalık rapor' && r.id !== task.id)!;
    expect(next).toMatchObject({
      startDate: '2030-03-09',
      dueDate: '2030-03-11',
      priority: 'HIGH',
      statusId: s.todo,
      completedAt: null,
    });
    const sub = rows.find((r) => r.title === 'Veriyi topla' && r.parentId === next.id)!;
    expect(sub.dueDate).toBe('2030-03-10'); // alt öğe aynı kadar kayar

    expect((await detail(next.id)).recurrence).toEqual({ freq: 'WEEKLY', interval: 1 });
    expect((await detail(task.id)).recurrence).toBeNull();

    // Eski örnek yeniden açılıp kapansa da yeni bir örnek doğmaz (kural artık onda değil).
    await owner.patch(api(`/items/${task.id}`), { statusId: s.todo }).expect(204);
    await owner.patch(api(`/items/${task.id}`), { statusId: s.done }).expect(204);
    expect((await items(s.listId)).filter((r) => r.title === 'Haftalık rapor')).toHaveLength(2);

    // Yeni örnek de tamamlanınca zincir sürer.
    await owner.patch(api(`/items/${sub.id}`), { statusId: s.done }).expect(204);
    await owner.patch(api(`/items/${next.id}`), { statusId: s.done }).expect(204);
    const again = (await items(s.listId)).filter(
      (r) => r.title === 'Haftalık rapor' && r.completedAt === null,
    );
    expect(again.map((r) => r.dueDate)).toEqual(['2030-03-18']);
  });

  it('tekrarsız görevin tamamlanması yeni görev üretmez', async () => {
    const s = await space();
    const task = await create(s.listId, { type: 'TASK', title: 'Tek seferlik' });
    await owner.patch(api(`/items/${task.id}`), { statusId: s.done }).expect(204);
    expect(await items(s.listId)).toHaveLength(1);
  });

  it('bitiş tarihi olmadan tekrar kurulamaz; tarih silinemez; Epic tekrarlayamaz', async () => {
    const s = await space();
    const task = await create(s.listId, { type: 'TASK', title: 'T' });
    const noDate = await owner
      .patch(api(`/items/${task.id}`), { recurrence: { freq: 'DAILY', interval: 1 } })
      .expect(422);
    expect(noDate.body).toMatchObject({ code: 'RECURRENCE_NEEDS_DUE_DATE' });

    await owner
      .patch(api(`/items/${task.id}`), {
        dueDate: '2030-05-01',
        recurrence: { freq: 'MONTHLY', interval: 2 },
      })
      .expect(204);
    const cleared = await owner.patch(api(`/items/${task.id}`), { dueDate: null }).expect(422);
    expect(cleared.body).toMatchObject({ code: 'RECURRENCE_NEEDS_DUE_DATE' });
    await owner.patch(api(`/items/${task.id}`), { recurrence: null }).expect(204);
    expect((await detail(task.id)).recurrence).toBeNull();
    await owner.patch(api(`/items/${task.id}`), { dueDate: null }).expect(204);

    await owner
      .patch(api(`/items/${task.id}`), { recurrence: { freq: 'DAILY', interval: 0 } })
      .expect(400);

    const epic = await create(s.listId, { type: 'EPIC', title: 'E', dueDate: '2030-05-01' });
    const notAllowed = await owner
      .patch(api(`/items/${epic.id}`), { recurrence: { freq: 'DAILY', interval: 1 } })
      .expect(422);
    expect(notAllowed.body).toMatchObject({ code: 'RECURRENCE_NOT_ALLOWED' });
  });
});
