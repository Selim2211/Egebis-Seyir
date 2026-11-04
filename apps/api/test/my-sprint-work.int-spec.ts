import type { Created, CreatedItem, HierarchyResponse, MySprintWorkResponse } from '@scrum/shared';
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

describe('Bana atananlar → Proje görünümü (ADR-163)', () => {
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

  it('son 3 sprint (aktif önce) ve her birinde bana atanan işler; alt görev üst Task’ın sprint’inde', async () => {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    const ownerId = (await ctx.prisma.user.findFirstOrThrow({ where: { NOT: { id: elifId } } })).id;

    const sprint = async (name: string, start: string, end: string) =>
      (
        (
          await owner
            .post(api(`/spaces/${spaceId}/sprints`), { name, startDate: start, endDate: end })
            .expect(201)
        ).body as Created
      ).id;
    const s1 = await sprint('S1', '2026-09-07', '2026-09-18');
    const s2 = await sprint('S2', '2026-09-21', '2026-10-02');
    const s3 = await sprint('S3', '2026-10-05', '2026-10-16');
    const s4 = await sprint('S4', '2026-10-19', '2026-10-30');
    const task = async (title: string, assigneeIds: string[], parentId?: string) =>
      (
        (
          await owner
            .post(api(`/lists/${listId}/items`), {
              type: parentId ? 'SUBTASK' : 'TASK',
              title,
              assigneeIds,
              ...(parentId && { parentId }),
            })
            .expect(201)
        ).body as CreatedItem
      ).id;
    const mine = await task('Benim', [elifId]);
    const other = await task('Başkasının', [ownerId]);
    const old = await task('Eski', [elifId]);
    const sub = await task('Alt', [elifId], other);
    const move = (itemIds: string[], sprintId: string) =>
      owner.post(api(`/spaces/${spaceId}/backlog/move`), { itemIds, sprintId }).expect(204);
    await move([mine, other], s4);
    await move([old], s1);
    await ctx.prisma.sprint.updateMany({
      where: { id: { in: [s2, s3] } },
      data: { status: 'COMPLETED' },
    });
    await ctx.prisma.sprint.update({ where: { id: s4 }, data: { status: 'ACTIVE' } });

    const res = (await elif.get(api(`/my-work/sprints?spaceId=${spaceId}`)).expect(200))
      .body as MySprintWorkResponse;
    expect(res.sprints.map((s) => s.name)).toEqual(['S4', 'S3', 'S2']);
    expect(res.sprints[0]!.items.map((i) => i.title).sort()).toEqual(['Alt', 'Benim']);
    expect(res.sprints[1]!.items).toEqual([]);
    expect(sub).toBeTruthy();
  });

  it('göremediği Projede 404', async () => {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'GZL', key: 'GZL', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
    await elif.get(api(`/my-work/sprints?spaceId=${spaceId}`)).expect(404);
  });
});
