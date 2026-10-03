import type {
  Created,
  CreatedItem,
  EpicsResponse,
  HierarchyResponse,
  SpaceDetail,
  WorkItemDetail,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

describe('Epic detayı ve Epic listesi (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (key = 'MOB') => {
    const res = await owner
      .post(api('/spaces'), { name: `Space ${key}`, key, color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === id)!.lists[0]!.id;
    return { id, listId, statuses: detail.statuses };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const epics = async (spaceId: string) =>
    (await owner.get(api(`/spaces/${spaceId}/epics`)).expect(200)).body as EpicsResponse;

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

  async function seed() {
    const s = await space();
    const epic = await item(s.listId, { type: 'EPIC', title: 'Giriş yenileme', goal: 'SSO hazır' });
    const child = (type: string, points: number | null, categoryName: 'DONE' | 'ACTIVE' | null) =>
      item(s.listId, { type, title: `${type} ${points}`, parentId: epic.id, points }).then(
        async (created) => {
          if (categoryName) {
            const statusId = s.statuses.find((x) => x.category === categoryName)!.id;
            await owner.patch(api(`/items/${created.id}`), { statusId }).expect(204);
          }
          return created;
        },
      );
    const a = await child('STORY', 5, 'DONE');
    await child('STORY', 3, 'ACTIVE');
    await child('BUG', 2, null);
    return { s, epic, a };
  }

  it('Epic detayı puan ve adet özetini taşır', async () => {
    const { epic } = await seed();
    const detail = (await owner.get(api(`/items/${epic.id}`)).expect(200)).body as WorkItemDetail;
    expect(detail.progress).toBe(50);
    expect(detail.epicStats).toEqual({
      points: 10,
      donePoints: 5,
      itemCount: 3,
      doneCount: 1,
      activeCount: 1,
      unestimatedCount: 0,
    });
  });

  it('Epic olmayan öğenin özeti null', async () => {
    const { a } = await seed();
    const detail = (await owner.get(api(`/items/${a.id}`)).expect(200)).body as WorkItemDetail;
    expect(detail.epicStats).toBeNull();
  });

  it('Space Epic listesi ilerlemeyi gösterir; silinen alt öğe sayılmaz', async () => {
    const { s, epic, a } = await seed();
    await item(s.listId, { type: 'EPIC', title: 'Boş Epic' });

    const before = await epics(s.id);
    expect(before.epics.map((e) => e.title)).toEqual(['Giriş yenileme', 'Boş Epic']);
    expect(before.epics[0]).toMatchObject({ id: epic.id, goal: 'SSO hazır', progress: 50 });
    expect(before.epics[1]).toMatchObject({ progress: 0 });
    expect(before.epics[1]!.stats.itemCount).toBe(0);

    await owner.delete(api(`/items/${a.id}`)).expect(204);
    const after = await epics(s.id);
    expect(after.epics[0]!.stats).toMatchObject({ points: 5, donePoints: 0, itemCount: 2 });
    expect(after.epics[0]!.progress).toBe(0);
  });

  it('başka Space’in Epic’i listede görünmez; bilinmeyen Space 404', async () => {
    const { s } = await seed();
    const other = await space('OTH');
    await item(other.listId, { type: 'EPIC', title: 'Başka' });
    expect((await epics(s.id)).epics).toHaveLength(1);
    await owner.get(api('/spaces/019dd2a0-0000-7000-8000-000000000000/epics')).expect(404);
  });
});
