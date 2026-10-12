import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
  SprintDetail,
  SprintsResponse,
  WorkItemDetail,
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

describe('Story Point, alt görev toplamı ve yüzde (ADR-107)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === id)!.lists[0]!.id;
    return { id, listId, statuses: detail.statuses };
  };
  const create = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const developer = async (spaceId: string) => {
    const client = await inviteAndAccept(ctx, owner, ws, ELIF);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } });
    await owner
      .put(api(`/spaces/${spaceId}/members/${user.id}`), { role: 'DEVELOPER' })
      .expect(204);
    return { client, id: user.id };
  };

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

  it('her tipte yalnızca 1,2,3,5,8,13,21,34,55 girilir', async () => {
    const s = await space();
    for (const type of ['TASK', 'STORY', 'BUG'] as const) {
      for (const points of [1, 2, 3, 5, 8, 13, 21, 34, 55]) {
        await create(s.listId, { type, title: `${type} ${points}`, points });
      }
    }
    const t = await create(s.listId, { type: 'TASK', title: 'T' });
    await owner.patch(api(`/items/${t.id}`), { points: 34 }).expect(204);
    expect((await detail(t.id)).points).toBe(34);
    for (const bad of [4, 0, 56, 89]) {
      const res = await owner.patch(api(`/items/${t.id}`), { points: bad }).expect(422);
      expect(res.body).toEqual({ code: 'WORK_ITEM_ESTIMATE_INVALID' });
    }
  });

  it('alt görevi varsa puan alt görevlerin toplamıdır; kalmayınca elle girilir', async () => {
    const s = await space();
    const task = await create(s.listId, { type: 'TASK', title: 'Ana', points: 8 });
    expect((await detail(task.id)).pointsLocked).toBe(false);

    const a = await create(s.listId, { type: 'SUBTASK', title: 'A', parentId: task.id, points: 2 });
    const b = await create(s.listId, { type: 'SUBTASK', title: 'B', parentId: task.id, points: 3 });
    expect(await detail(task.id)).toMatchObject({ points: 5, pointsLocked: true });

    const locked = await owner.patch(api(`/items/${task.id}`), { points: 8 }).expect(422);
    expect(locked.body).toEqual({ code: 'WORK_ITEM_POINTS_FROM_SUBTASKS' });

    await owner.patch(api(`/items/${a.id}`), { points: 8 }).expect(204);
    expect((await detail(task.id)).points).toBe(11);

    await owner.delete(api(`/items/${b.id}`)).expect(204);
    expect((await detail(task.id)).points).toBe(8);

    await owner.post(api(`/items/${b.id}/restore`)).expect(204);
    expect((await detail(task.id)).points).toBe(11);

    await owner.delete(api(`/items/${a.id}`)).expect(204);
    await owner.delete(api(`/items/${b.id}`)).expect(204);
    // Son alt görev kalkınca son toplam kalır ve puan yeniden elle girilebilir.
    expect(await detail(task.id)).toMatchObject({ points: 3, pointsLocked: false });
    await owner.patch(api(`/items/${task.id}`), { points: 21 }).expect(204);
    expect((await detail(task.id)).points).toBe(21);
  });

  it('Task başka Task’ın altına alt görev yapılınca üst puanı toplar', async () => {
    const s = await space();
    const story = await create(s.listId, { type: 'STORY', title: 'S', points: 13 });
    const a = await create(s.listId, { type: 'TASK', title: 'A', parentId: story.id, points: 5 });
    const b = await create(s.listId, { type: 'TASK', title: 'B', points: 8 });
    await owner.post(api(`/items/${b.id}/nest`), { parentId: a.id }).expect(204);
    expect((await detail(b.id)).type).toBe('SUBTASK');
    expect(await detail(a.id)).toMatchObject({ points: 8, pointsLocked: true });
    expect((await detail(story.id)).points).toBe(13);
  });

  it('atanan yüzdeyi girer; 0–100 dışı reddedilir; alt görevliden türetilir', async () => {
    const s = await space();
    const elif = await developer(s.id);
    const mine = await create(s.listId, {
      type: 'TASK',
      title: 'Elif işi',
      assigneeIds: [elif.id],
      points: 5,
    });
    const other = await create(s.listId, { type: 'TASK', title: 'Başkasının', points: 5 });

    await elif.client.patch(api(`/items/${mine.id}`), { percentDone: 40 }).expect(204);
    expect((await detail(mine.id)).percentDone).toBe(40);
    await elif.client.patch(api(`/items/${other.id}`), { percentDone: 10 }).expect(204);
    await owner.patch(api(`/items/${mine.id}`), { percentDone: 101 }).expect(400);
    await owner.patch(api(`/items/${mine.id}`), { percentDone: null }).expect(204);

    const parent = await create(s.listId, { type: 'TASK', title: 'Ana' });
    const x = await create(s.listId, {
      type: 'SUBTASK',
      title: 'X',
      parentId: parent.id,
      points: 3,
    });
    await create(s.listId, { type: 'SUBTASK', title: 'Y', parentId: parent.id, points: 1 });
    await owner.patch(api(`/items/${x.id}`), { percentDone: 80 }).expect(204);
    expect((await detail(parent.id)).percentDone).toBe(60);
    const res = await owner.patch(api(`/items/${parent.id}`), { percentDone: 10 }).expect(422);
    expect(res.body).toEqual({ code: 'WORK_ITEM_PERCENT_NOT_ALLOWED' });
  });

  it('sprint özeti toplam puan, yüzde ve kişi dağılımını verir; JSON dışa aktarılır', async () => {
    const s = await space();
    const elif = await developer(s.id);
    const sp = (
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'Sprint 1',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
    const a = await create(s.listId, {
      type: 'STORY',
      title: 'A',
      points: 8,
      assigneeIds: [elif.id],
    });
    const b = await create(s.listId, { type: 'TASK', title: 'B', points: 2 });
    await owner.patch(api(`/items/${a.id}`), { percentDone: 50 }).expect(204);
    await owner
      .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [a.id, b.id], sprintId: sp.id })
      .expect(204);

    const list = (await owner.get(api(`/spaces/${s.id}/sprints`)).expect(200))
      .body as SprintsResponse;
    const summary = list.sprints[0]!;
    expect(summary).toMatchObject({ points: 10, percentDone: 40 });
    expect(summary.byAssignee.map((r) => [r.userId, r.points, r.percentDone])).toEqual([
      [elif.id, 8, 50],
      [null, 2, 0],
    ]);
    const full = (await owner.get(api(`/sprints/${sp.id}`)).expect(200)).body as SprintDetail;
    expect(full.sprint.percentDone).toBe(40);

    const res = await owner.get(api(`/sprints/${sp.id}/export.json`)).expect(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toContain('.json');
    const json = JSON.parse(res.text) as {
      format: string;
      sprint: { url: string };
      summary: { points: number; percentDone: number };
      items: Array<{ key: string; url: string; points: number | null; percentDone: number | null }>;
    };
    expect(json.format).toBe('egebis-seyir.sprint');
    expect(json.sprint.url.endsWith(`/sprints/${sp.id}`)).toBe(true);
    expect(json.summary).toMatchObject({ points: 10, percentDone: 40 });
    expect(json.items.map((i) => [i.key, i.points, i.percentDone])).toEqual([
      [a.key, 8, 50],
      [b.key, 2, null],
    ]);
    expect(json.items[0]!.url.endsWith(`/items/${a.key}`)).toBe(true);
  });
});
