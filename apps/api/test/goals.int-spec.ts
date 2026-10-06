import type {
  Created,
  CreatedItem,
  GoalsResponse,
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

describe('Hedefler (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const goals = async (client = owner) =>
    ((await client.get(api('/goals')).expect(200)).body as GoalsResponse).goals;

  const space = async (body: Record<string, unknown> = {}) => {
    const created = (
      await owner
        .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
        .expect(201)
    ).body as Created;
    const detail = (await owner.get(api(`/spaces/${created.id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return {
      listId: tree.spaces.find((s) => s.id === created.id)!.lists[0]!.id,
      done: detail.statuses.find((s) => s.category === 'DONE')!.id,
    };
  };
  const item = async (listId: string, title: string) =>
    (await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title }).expect(201))
      .body as CreatedItem;

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

  it('görev bazlı hedef: bağlı görevler tamamlandıkça ilerler', async () => {
    const s = await space();
    const a = await item(s.listId, 'A');
    const b = await item(s.listId, 'B');
    const goal = (
      await owner
        .post(api('/goals'), { name: 'Q4 yayını', kind: 'TASKS', dueDate: '2030-12-31' })
        .expect(201)
    ).body as Created;

    await owner.put(api(`/goals/${goal.id}/items/${a.id}`)).expect(204);
    await owner.put(api(`/goals/${goal.id}/items/${a.id}`)).expect(204); // tekrar zararsız
    await owner.put(api(`/goals/${goal.id}/items/${b.id}`)).expect(204);
    let [g] = await goals();
    expect(g).toMatchObject({
      name: 'Q4 yayını',
      kind: 'TASKS',
      percent: 0,
      dueDate: '2030-12-31',
    });
    expect(g!.items.map((i) => i.key)).toEqual(['MOB-1', 'MOB-2']);

    await owner.patch(api(`/items/${a.id}`), { statusId: s.done }).expect(204);
    [g] = await goals();
    expect(g!.percent).toBe(50);

    await owner.delete(api(`/goals/${goal.id}/items/${b.id}`)).expect(204);
    [g] = await goals();
    expect(g!.percent).toBe(100);
    await owner.delete(api(`/goals/${goal.id}/items/${b.id}`)).expect(404);

    // Silinen görev hedefte sayılmaz.
    await owner.delete(api(`/items/${a.id}`)).expect(204);
    [g] = await goals();
    expect(g!.items).toEqual([]);
    expect(g!.percent).toBe(0);
  });

  it('sayısal hedef: başlangıçtan hedefe; azaltma hedefi de çalışır', async () => {
    const up = (
      await owner
        .post(api('/goals'), {
          name: 'Aylık satış',
          kind: 'NUMBER',
          startValue: 0,
          targetValue: 200,
          unit: '₺',
        })
        .expect(201)
    ).body as Created;
    const down = (
      await owner
        .post(api('/goals'), {
          name: 'Hata sayısı',
          kind: 'NUMBER',
          startValue: 100,
          targetValue: 40,
        })
        .expect(201)
    ).body as Created;
    await owner.patch(api(`/goals/${up.id}`), { currentValue: 50 }).expect(204);
    await owner.patch(api(`/goals/${down.id}`), { currentValue: 70 }).expect(204);
    const list = await goals();
    expect(list.find((g) => g.id === up.id)).toMatchObject({ percent: 25, unit: '₺' });
    expect(list.find((g) => g.id === down.id)).toMatchObject({ percent: 50, currentValue: 70 });

    // Sayısal hedef için hedef değerler zorunlu; görev bağlanamaz.
    await owner.post(api('/goals'), { name: 'X', kind: 'NUMBER' }).expect(400);
    const sp = await space();
    const t = await item(sp.listId, 'T');
    const wrong = await owner.put(api(`/goals/${up.id}/items/${t.id}`)).expect(422);
    expect(wrong.body).toMatchObject({ code: 'GOAL_WRONG_KIND' });
  });

  it('görev bazlı hedefe sayısal alan yazılamaz; güncelle ve sil', async () => {
    const goal = (await owner.post(api('/goals'), { name: 'Hedef', kind: 'TASKS' }).expect(201))
      .body as Created;
    const bad = await owner.patch(api(`/goals/${goal.id}`), { currentValue: 5 }).expect(422);
    expect(bad.body).toMatchObject({ code: 'GOAL_WRONG_KIND' });
    await owner
      .patch(api(`/goals/${goal.id}`), {
        name: 'Yeni ad',
        color: '#112233',
        description: 'Açıklama',
      })
      .expect(204);
    expect((await goals())[0]).toMatchObject({ name: 'Yeni ad', color: '#112233' });
    await owner.delete(api(`/goals/${goal.id}`)).expect(204);
    expect(await goals()).toEqual([]);
    await owner.delete(api(`/goals/${goal.id}`)).expect(404);
  });

  it('görünmeyen Space görevi bağlanamaz ve ilerlemeyi sızdırmaz; Guest erişemez', async () => {
    const hidden = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
    const secret = await item(hidden.listId, 'Gizli iş');
    const open = await space({ name: 'Açık', key: 'ACK' });
    const visible = await item(open.listId, 'Açık iş');
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);

    const goal = (await owner.post(api('/goals'), { name: 'Ortak', kind: 'TASKS' }).expect(201))
      .body as Created;
    await owner.put(api(`/goals/${goal.id}/items/${secret.id}`)).expect(204);
    await owner.put(api(`/goals/${goal.id}/items/${visible.id}`)).expect(204);
    await elif.put(api(`/goals/${goal.id}/items/${secret.id}`)).expect(404);

    const [asOwner] = await goals();
    expect(asOwner!.items).toHaveLength(2);
    const [asElif] = await goals(elif);
    expect(asElif!.items.map((i) => i.title)).toEqual(['Açık iş']);
    expect(asElif!.hiddenItemCount).toBe(1);

    // Guest hedeflere erişemez.
    const spaceId = await goalSpaceId(open.listId);
    const guest = await inviteAndAccept(
      ctx,
      owner,
      ws,
      { email: 'misafir@example.com', name: 'Misafir', password: 'misafir-pass' },
      'GUEST',
      [spaceId],
    );
    await guest.get(api('/goals')).expect(403);
  });

  async function goalSpaceId(listId: string): Promise<string> {
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return tree.spaces.find((s) => s.lists.some((l) => l.id === listId))!.id;
  }
});
