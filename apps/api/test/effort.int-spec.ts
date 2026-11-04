import type { Created, CreatedItem, EffortSheet, HierarchyResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };

describe('Story Point tabanlı zaman çizelgesi (ADR-164)', () => {
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

  it('kişi başına üstlenilen/biten/kalan; yaprak işler sayılır, ortak iş paylaştırılır', async () => {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const elif = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    const me = (await ctx.prisma.user.findFirstOrThrow({ where: { NOT: { id: elif } } })).id;
    const sprintId = (
      (
        await owner
          .post(api(`/spaces/${spaceId}/sprints`), {
            name: 'S1',
            startDate: '2026-11-02',
            endDate: '2026-11-13',
          })
          .expect(201)
      ).body as Created
    ).id;
    const item = async (body: Record<string, unknown>) =>
      ((await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem).id;
    const solo = await item({ type: 'TASK', title: 'Tek', assigneeIds: [elif] });
    const shared = await item({ type: 'TASK', title: 'Ortak', assigneeIds: [elif, me] });
    const parent = await item({ type: 'TASK', title: 'Üst', assigneeIds: [me] });
    const sub = await item({ type: 'SUBTASK', title: 'Alt', parentId: parent, assigneeIds: [me] });
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [solo, shared, parent], sprintId })
      .expect(204);
    await owner.patch(api(`/items/${solo}`), { points: 3 }).expect(204);
    await owner.patch(api(`/items/${shared}`), { points: 5 }).expect(204);
    await owner.patch(api(`/items/${sub}`), { points: 2 }).expect(204);
    const doneStatus = await ctx.prisma.status.findFirstOrThrow({
      where: { spaceId, category: 'DONE' },
    });
    await owner.patch(api(`/items/${solo}`), { statusId: doneStatus.id }).expect(204);
    await ctx.prisma.workItem.update({
      where: { id: solo },
      data: { completedAt: new Date('2026-11-04T09:00:00Z') },
    });

    const sheet = (
      await owner.get(api(`/spaces/${spaceId}/effort?sprintId=${sprintId}`)).expect(200)
    ).body as EffortSheet;
    expect(sheet.days).toHaveLength(12);
    // Üst Task'ın puanı alt görevin toplamıdır; yalnızca alt görev sayılır.
    expect(sheet.committed).toBe(10);
    expect(sheet.done).toBe(3);
    const elifRow = sheet.rows.find((r) => r.user.id === elif)!;
    expect(elifRow).toMatchObject({
      committed: 5.5,
      done: 3,
      remaining: 2.5,
      items: 2,
      doneItems: 1,
    });
    expect(elifRow.perDay[sheet.days.indexOf('2026-11-04')]).toBe(3);
    expect(sheet.rows.find((r) => r.user.id === me)).toMatchObject({ committed: 4.5, done: 0 });
    expect(sheet.topItems[0]).toMatchObject({ title: 'Ortak', points: 5 });
  });

  it('başka Projenin sprint’i 404', async () => {
    const a = (
      (await owner.post(api('/spaces'), { name: 'A', key: 'AAA', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const b = (
      (await owner.post(api('/spaces'), { name: 'B', key: 'BBB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const sprintId = (
      (
        await owner
          .post(api(`/spaces/${b}/sprints`), {
            name: 'S1',
            startDate: '2026-11-02',
            endDate: '2026-11-13',
          })
          .expect(201)
      ).body as Created
    ).id;
    await owner.get(api(`/spaces/${a}/effort?sprintId=${sprintId}`)).expect(404);
  });
});
