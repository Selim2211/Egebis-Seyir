import type { Created, CreatedItem, HierarchyResponse, WorkItemDetail } from '@scrum/shared';
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

describe("Task'ı Epic'e dönüştürme (ADR-109)", () => {
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
  const create = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const promote = (id: string, client = owner) => client.post(api(`/items/${id}/convert-to-epic`));

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

  it("Story altındaki, sprint'teki Task Epic olur; alt görevleri Story'ye döner, uyumsuz alanlar temizlenir", async () => {
    const s = await space();
    const story = await create(s.listId, { type: 'STORY', title: 'Üst Story' });
    const task = await create(s.listId, {
      type: 'TASK',
      title: 'Çok kapsamlı iş',
      parentId: story.id,
      estimateHours: 12,
    });
    await owner.patch(api(`/items/${task.id}`), { percentDone: 20 }).expect(204);
    const a = await create(s.listId, { type: 'SUBTASK', title: 'A', parentId: task.id, points: 2 });
    const b = await create(s.listId, { type: 'SUBTASK', title: 'B', parentId: task.id, points: 3 });
    // Task Story'nin altında olduğu için sprint'e önce üst düzey bir Task olarak girer.
    const loose = await create(s.listId, { type: 'TASK', title: 'Sprint işi', estimateHours: 4 });
    const sprint = (
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'Sprint 1',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [loose.id], sprintId: sprint.id })
      .expect(204);

    await promote(task.id).expect(204);
    const epic = await detail(task.id);
    expect(epic).toMatchObject({
      type: 'EPIC',
      points: 5,
      estimateHours: null,
      percentDone: null,
    });
    expect(epic.ancestors).toEqual([]);
    expect(epic.children.map((c) => [c.key, c.type]).sort()).toEqual(
      [
        [a.key, 'STORY'],
        [b.key, 'STORY'],
      ].sort(),
    );
    // Epic'e dönüşen eski Task'ın üstü artık yok.
    expect((await detail(story.id)).children).toHaveLength(0);

    // Sprint'teki Task da dönüştürülebilir; sprint'ten çıkar ve üyelik geçmişine yazılır.
    await promote(loose.id).expect(204);
    expect(await detail(loose.id)).toMatchObject({ type: 'EPIC', sprintId: null });
    const events = await ctx.prisma.sprintItemEvent.findMany({ where: { workItemId: loose.id } });
    expect(events.map((e) => e.action)).toContain('REMOVED');
    const activity = await ctx.prisma.activityEvent.findMany({ where: { entityId: task.id } });
    expect(JSON.stringify(activity.map((e) => e.changes))).toContain('EPIC');
  });

  it('yalnızca Task dönüştürülebilir; basit liste Space’inde Epic olmaz', async () => {
    const s = await space();
    const story = await create(s.listId, { type: 'STORY', title: 'S' });
    const res = await promote(story.id).expect(422);
    expect(res.body).toEqual({ code: 'WORK_ITEM_NOT_PROMOTABLE' });

    const simple = await space({ name: 'Basit', key: 'BAS', scrumEnabled: false });
    const task = await create(simple.listId, { type: 'TASK', title: 'T' });
    const denied = await promote(task.id).expect(422);
    expect(denied.body).toEqual({ code: 'WORK_ITEM_TYPE_NOT_ALLOWED' });
  });

  it('yazma yetkisi olmayan dönüştüremez', async () => {
    const s = await space();
    const task = await create(s.listId, { type: 'TASK', title: 'T' });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await promote(task.id, elif).expect(403);
    expect((await detail(task.id)).type).toBe('TASK');
  });
});
