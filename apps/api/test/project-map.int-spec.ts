import type { Created, CreatedItem, HierarchyResponse, ProjectMap } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

/** ADR-136: Proje Kuş Bakışı verisi ve kullanıcıya özel kutu konumları. */
describe('Proje Kuş Bakışı (gerçek veritabanı)', () => {
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

  const setup = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Harita', key: 'MAP', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === id)!.lists[0]!.id;
    const item = async (body: Record<string, unknown>) =>
      (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
    return { id, item };
  };
  const map = async (spaceId: string) =>
    (await owner.get(api(`/spaces/${spaceId}/map`)).expect(200)).body as ProjectMap;

  it('Epic, Task, Sub-Task ve Bug düğüm olarak döner; arşivlenenler dönmez', async () => {
    const s = await setup();
    const epic = await s.item({ type: 'EPIC', title: 'Ödeme' });
    const task = await s.item({ type: 'TASK', title: 'Kart', parentId: epic.id });
    const sub = await s.item({ type: 'SUBTASK', title: 'API', parentId: task.id });
    const bug = await s.item({ type: 'BUG', title: 'Hata' });
    const gone = await s.item({ type: 'TASK', title: 'Arşiv' });
    await owner.post(api(`/items/${gone.id}/archive`)).expect(204);

    const res = await map(s.id);
    expect(res.nodes.map((n) => n.key).sort()).toEqual(
      [epic.key, task.key, sub.key, bug.key].sort(),
    );
    const node = res.nodes.find((n) => n.id === sub.id)!;
    expect(node).toMatchObject({ type: 'SUBTASK', parentId: task.id });
    expect(node.status.category).toBeTruthy();
    expect(res.positions).toEqual({});
  });

  it('konumlar kullanıcıya özel kaydedilir; silinen işin konumu düşer; boş kayıt sıfırlar', async () => {
    const s = await setup();
    const a = await s.item({ type: 'TASK', title: 'A' });
    const b = await s.item({ type: 'TASK', title: 'B' });
    await owner
      .put(api(`/spaces/${s.id}/map/layout`), {
        positions: { [a.id]: { x: 10, y: 20.5 }, [b.id]: { x: -5, y: 0 } },
      })
      .expect(204);
    expect((await map(s.id)).positions).toEqual({
      [a.id]: { x: 10, y: 20.5 },
      [b.id]: { x: -5, y: 0 },
    });

    await owner.post(api(`/items/${b.id}/archive`)).expect(204);
    expect((await map(s.id)).positions).toEqual({ [a.id]: { x: 10, y: 20.5 } });

    await owner.put(api(`/spaces/${s.id}/map/layout`), { positions: {} }).expect(204);
    expect((await map(s.id)).positions).toEqual({});
  });

  it('geçersiz konum reddedilir', async () => {
    const s = await setup();
    await owner
      .put(api(`/spaces/${s.id}/map/layout`), { positions: { 'not-a-uuid': { x: 1, y: 1 } } })
      .expect(400);
  });
});
