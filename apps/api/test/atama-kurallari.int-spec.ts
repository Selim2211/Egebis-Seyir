import type { Created, CreatedItem, HierarchyResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const PO = { email: 'po@example.com', name: 'Pelin Owner', password: 'po-pass-12345' };
const SM = { email: 'sm@example.com', name: 'Sinan Master', password: 'sm-pass-12345' };
const DEV1 = { email: 'dev1@example.com', name: 'Deniz Bir', password: 'dev1-pass-1234' };
const DEV2 = { email: 'dev2@example.com', name: 'Derya İki', password: 'dev2-pass-1234' };

/** Atama kuralları (ADR-170): PO atanmış işi değiştiremez; Scrum Master sprint planlar ve atar. */
describe('PO / Scrum Master atama kuralları', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const userId = async (email: string) =>
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

  async function setup() {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const po = await inviteAndAccept(ctx, owner, ws, PO, 'MEMBER', [spaceId]);
    const sm = await inviteAndAccept(ctx, owner, ws, SM, 'MEMBER', [spaceId]);
    await inviteAndAccept(ctx, owner, ws, DEV1, 'MEMBER', [spaceId]);
    await inviteAndAccept(ctx, owner, ws, DEV2, 'MEMBER', [spaceId]);
    await owner
      .put(api(`/spaces/${spaceId}/scrum-roles`), {
        productOwnerId: await userId(PO.email),
        scrumMasterId: await userId(SM.email),
      })
      .expect(204);
    return { spaceId, listId, po, sm };
  }

  it('Product Owner atanmış işin atananını değiştiremez; Scrum Master ve Super Admin değiştirir', async () => {
    const { listId, po, sm } = await setup();
    const dev1 = await userId(DEV1.email);
    const dev2 = await userId(DEV2.email);
    const created = (
      await owner
        .post(api(`/lists/${listId}/items`), {
          type: 'TASK',
          title: 'Atanmış iş',
          assigneeIds: [dev1],
        })
        .expect(201)
    ).body as CreatedItem;

    const denied = await po.patch(api(`/items/${created.id}`), { assigneeIds: [dev2] }).expect(403);
    expect((denied.body as { code: string }).code).toBe('ASSIGNEE_SCRUM_MASTER_ONLY');

    await sm.patch(api(`/items/${created.id}`), { assigneeIds: [dev2] }).expect(204);
    await owner.patch(api(`/items/${created.id}`), { assigneeIds: [dev1] }).expect(204);
  });

  it('Product Owner atanmamış işe atama yapabilir ve diğer alanları düzenleyebilir', async () => {
    const { listId, po } = await setup();
    const dev1 = await userId(DEV1.email);
    const created = (
      await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'Boşta' }).expect(201)
    ).body as CreatedItem;
    // Atanansız iş (eski atanansız kayıtları temsil eder).
    await ctx.prisma.workItemAssignee.deleteMany({ where: { workItemId: created.id } });
    await po.patch(api(`/items/${created.id}`), { assigneeIds: [dev1] }).expect(204);
    // Atananı değiştirmeyen güncelleme (aynı küme) PO için serbesttir.
    await po
      .patch(api(`/items/${created.id}`), { assigneeIds: [dev1], title: 'Yeni ad' })
      .expect(204);
  });

  it('Scrum Master Proje Üyesi rolünde bile Backlog işini sprint’e alır; sıradan üye alamaz', async () => {
    const { spaceId, listId, sm } = await setup();
    const dev1 = await inviteAndAccept(
      ctx,
      owner,
      ws,
      { email: 'dev3@example.com', name: 'Deniz Üç', password: 'dev3-pass-1234' },
      'MEMBER',
      [spaceId],
    );
    const item = (
      await owner
        .post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'Backlog işi' })
        .expect(201)
    ).body as CreatedItem;
    const sprint = (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'Sprint 1',
          goal: 'Hedef — ekip bu sprintte kapsamı uçtan uca teslim edip demoya hazır hale getirecek',
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
        })
        .expect(201)
    ).body as Created;

    await dev1
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [item.id], sprintId: sprint.id })
      .expect(403);
    await sm
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [item.id], sprintId: sprint.id })
      .expect(204);
  });
});
