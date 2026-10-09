import type {
  ActivityResponse,
  BacklogResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  SprintDetail,
  WorkItemDetail,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

/** Faz 8.2 (ADR-102): sprint ↔ sprint taşıma ve sürükleyerek alt öğe yapma. */
describe('Backlog sürükle-bırak: sprint arası taşıma ve alt öğe (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const sprint = async (spaceId: string, name: string) =>
    (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name,
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
  const sprintKeys = async (id: string) =>
    ((await owner.get(api(`/sprints/${id}`)).expect(200)).body as SprintDetail).items.map(
      (i) => i.key,
    );
  const backlogKeys = async (spaceId: string) =>
    (
      (await owner.get(api(`/spaces/${spaceId}/backlog`)).expect(200)).body as BacklogResponse
    ).items.map((i) => i.key);
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const nest = (id: string, parentId: string) => owner.post(api(`/items/${id}/nest`), { parentId });

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

  it("öğe bir sprint'ten diğerine doğrudan taşınır", async () => {
    const s = await space();
    const a = await item(s.listId, { type: 'STORY', title: 'Giriş' });
    const one = await sprint(s.id, 'Sprint 1');
    const two = await sprint(s.id, 'Sprint 2');
    await owner
      .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [a.id], sprintId: one.id })
      .expect(204);
    await owner
      .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [a.id], sprintId: two.id })
      .expect(204);
    expect(await sprintKeys(one.id)).toEqual([]);
    expect(await sprintKeys(two.id)).toEqual([a.key]);
  });

  it("Task, Task üzerine bırakılınca Sub-task olur, backlog'dan çıkar ve aktivite yazılır", async () => {
    const s = await space();
    const parent = await item(s.listId, { type: 'TASK', title: 'API' });
    const child = await item(s.listId, { type: 'TASK', title: 'Doğrulama' });
    expect(await backlogKeys(s.id)).toEqual([parent.key, child.key]);

    await nest(child.id, parent.id).expect(204);

    const moved = await detail(child.id);
    expect(moved.type).toBe('SUBTASK');
    expect(moved.parentId).toBe(parent.id);
    expect(await backlogKeys(s.id)).toEqual([parent.key]);
    const feed = (await owner.get(api(`/items/${child.id}/activity`)).expect(200))
      .body as ActivityResponse;
    const changes = Object.fromEntries(feed.events[0]!.changes.map((c) => [c.field, c]));
    expect(changes.parentId?.to).toBe(parent.key);
    expect(changes.type).toMatchObject({ from: 'TASK', to: 'SUBTASK' });
  });

  it("Story, Epic altına girince sprint'te kalır; Story altına giren Task sprint'ten çıkar", async () => {
    const s = await space();
    const epic = await item(s.listId, { type: 'EPIC', title: 'Ödeme' });
    const story = await item(s.listId, { type: 'STORY', title: 'Kartla ödeme' });
    const task = await item(s.listId, { type: 'TASK', title: 'Form' });
    const one = await sprint(s.id, 'Sprint 1');
    await owner
      .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [story.id, task.id], sprintId: one.id })
      .expect(204);

    await nest(story.id, epic.id).expect(204);
    await nest(task.id, story.id).expect(204);

    expect((await detail(story.id)).parentId).toBe(epic.id);
    expect((await detail(task.id)).type).toBe('TASK');
    expect(await sprintKeys(one.id)).toEqual([story.key]);
  });

  it('kurala uymayan bırakma reddedilir', async () => {
    const s = await space();
    const a = await item(s.listId, { type: 'STORY', title: 'A' });
    const b = await item(s.listId, { type: 'STORY', title: 'B' });
    const res = await nest(a.id, b.id).expect(422);
    expect(res.body).toEqual({ code: 'WORK_ITEM_PARENT_NOT_ALLOWED' });
    await nest(a.id, a.id).expect(422);
  });
});
