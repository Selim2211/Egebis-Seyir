import type {
  ActivityResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  MemberProfile,
} from '@scrum/shared';
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
const MEHMET = { email: 'mehmet@example.com', name: 'Mehmet Can', password: 'mehmet-pass-1' };

describe('Kişinin Proje profili (ADR-165)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const idOf = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

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

  it('Proje Yöneticisi üyenin sprint sprint puanını, açık işlerini ve hareketlerini görür; üye göremez', async () => {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const pm = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
    const member = await inviteAndAccept(ctx, owner, ws, MEHMET, 'MEMBER', []);
    const elif = await idOf(ELIF.email);
    const mehmet = await idOf(MEHMET.email);
    await owner
      .put(api(`/spaces/${spaceId}/members/${elif}`), { role: 'PROJECT_MANAGER' })
      .expect(204);
    await owner
      .put(api(`/spaces/${spaceId}/members/${mehmet}`), { role: 'PROJECT_MEMBER' })
      .expect(204);
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
    const task = async (title: string, assigneeIds: string[], points: number) => {
      const id = (
        (
          await member
            .post(api(`/lists/${listId}/items`), { type: 'TASK', title, assigneeIds })
            .expect(201)
        ).body as CreatedItem
      ).id;
      await member.patch(api(`/items/${id}`), { points }).expect(204);
      return id;
    };
    const a = await task('Bitecek', [mehmet], 3);
    const b = await task('Açık', [mehmet], 5);
    const c = await task('Başkası', [elif], 2);
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [a, b, c], sprintId })
      .expect(204);
    const doneStatus = await ctx.prisma.status.findFirstOrThrow({
      where: { spaceId, category: 'DONE' },
    });
    await member.patch(api(`/items/${a}`), { statusId: doneStatus.id }).expect(204);

    const profile = (await pm.get(api(`/spaces/${spaceId}/members/${mehmet}/profile`)).expect(200))
      .body as MemberProfile;
    expect(profile).toMatchObject({
      user: { id: mehmet, name: MEHMET.name },
      role: 'PROJECT_MEMBER',
      totals: { doneItems: 1, donePoints: 3, openItems: 1, openPoints: 5 },
    });
    expect(profile.sprints[0]).toMatchObject({
      name: 'S1',
      committed: 8,
      done: 3,
      items: 2,
      doneItems: 1,
      share: 0.8,
    });
    expect(profile.openItems.map((i) => i.title)).toEqual(['Açık']);

    const feed = (await pm.get(api(`/spaces/${spaceId}/members/${mehmet}/activity`)).expect(200))
      .body as ActivityResponse;
    expect(feed.events.length).toBeGreaterThan(0);
    expect(feed.events.every((e) => e.actor?.id === mehmet)).toBe(true);

    await member.get(api(`/spaces/${spaceId}/members/${elif}/profile`)).expect(403);
    await member.get(api(`/spaces/${spaceId}/members/${elif}/activity`)).expect(403);
  });
});
