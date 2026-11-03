import type {
  Created,
  CreatedItem,
  HandoverPlan,
  HierarchyResponse,
  QuotasResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  OWNER,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };
const MEHMET = { email: 'mehmet@example.com', name: 'Mehmet Can', password: 'mehmet-pass-1' };
const AYSE = { email: 'ayse@example.com', name: 'Ayşe Yıl', password: 'ayse-pass-123' };

describe('Üye çıkarmada iş devri (ADR-153) ve yükleme sınırları (ADR-154)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const idOf = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const space = async (key: string) => {
    const id = (
      (await owner.post(api('/spaces'), { name: key, key, color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const join = (spaceId: string, userId: string, role: string) =>
    owner.put(api(`/spaces/${spaceId}/members/${userId}`), { role }).expect(204);
  const task = async (listId: string, assigneeIds: string[], title = 'İş') =>
    (
      await owner
        .post(api(`/lists/${listId}/items`), { type: 'TASK', title, assigneeIds })
        .expect(201)
    ).body as CreatedItem;
  const assignees = async (itemId: string) =>
    (await ctx.prisma.workItemAssignee.findMany({ where: { workItemId: itemId } })).map(
      (a) => a.userId,
    );

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

  describe('devir', () => {
    it('üyenin açık işleri Proje Yöneticisine geçer; biten işin ataması korunur', async () => {
      const s = await space('MOB');
      await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
      await inviteAndAccept(ctx, owner, ws, MEHMET, 'MEMBER', []);
      const elif = await idOf(ELIF.email);
      const mehmet = await idOf(MEHMET.email);
      await join(s.id, mehmet, 'PROJECT_MANAGER');
      await join(s.id, elif, 'PROJECT_MEMBER');
      // Projeyi açan Super Admin de yöneticidir; Mehmet tek yönetici kalsın.
      await owner.delete(api(`/spaces/${s.id}/members/${await idOf(OWNER.email)}`)).expect(204);
      const open = await task(s.listId, [elif], 'Açık');
      const done = await task(s.listId, [elif], 'Biten');
      const doneStatus = await ctx.prisma.status.findFirstOrThrow({
        where: { spaceId: s.id, category: 'DONE' },
      });
      await owner.patch(api(`/items/${done.id}`), { statusId: doneStatus.id }).expect(204);

      const plan = (await owner.get(api(`/members/${elif}/handover`)).expect(200))
        .body as HandoverPlan;
      expect(plan.projects).toEqual([
        expect.objectContaining({
          spaceId: s.id,
          openItems: 1,
          isManager: false,
          needsChoice: false,
          defaultAssigneeId: mehmet,
        }),
      ]);

      await owner.delete(api(`/members/${elif}`)).expect(204);
      expect(await assignees(open.id)).toEqual([mehmet]);
      expect(await assignees(done.id)).toEqual([elif]);
    });

    it('çıkarılan Proje Yöneticisiyse alıcıyı Super Admin seçer', async () => {
      const s = await space('MOB');
      await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
      await inviteAndAccept(ctx, owner, ws, AYSE, 'MEMBER', []);
      const elif = await idOf(ELIF.email);
      const ayse = await idOf(AYSE.email);
      await join(s.id, elif, 'PROJECT_MANAGER');
      await join(s.id, ayse, 'PROJECT_MEMBER');
      const open = await task(s.listId, [elif]);

      const plan = (await owner.get(api(`/members/${elif}/handover`)).expect(200))
        .body as HandoverPlan;
      expect(plan.projects[0]).toMatchObject({ isManager: true, needsChoice: true });

      const res = await owner.delete(api(`/members/${elif}`)).expect(422);
      expect(res.body).toEqual({ code: 'HANDOVER_TARGET_REQUIRED' });
      await owner.delete(api(`/members/${elif}`), { reassign: { [s.id]: ayse } }).expect(204);
      expect(await assignees(open.id)).toEqual([ayse]);
    });

    it('Proje Yöneticisini yalnızca Super Admin projeden çıkarır', async () => {
      const s = await space('MOB');
      const elifClient = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
      await inviteAndAccept(ctx, owner, ws, MEHMET, 'MEMBER', []);
      const elif = await idOf(ELIF.email);
      const mehmet = await idOf(MEHMET.email);
      await join(s.id, elif, 'PROJECT_MANAGER');
      await join(s.id, mehmet, 'PROJECT_MANAGER');

      const res = await elifClient.delete(api(`/spaces/${s.id}/members/${mehmet}`)).expect(403);
      expect(res.body).toEqual({ code: 'MANAGER_REMOVAL_SUPER_ADMIN' });
      await owner.delete(api(`/spaces/${s.id}/members/${mehmet}`)).expect(204);
    });

    it('Projeden çıkarılan üyenin açık işi Projenin ilk yöneticisine geçer', async () => {
      const s = await space('MOB');
      const elifClient = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
      await inviteAndAccept(ctx, owner, ws, MEHMET, 'MEMBER', []);
      const elif = await idOf(ELIF.email);
      const mehmet = await idOf(MEHMET.email);
      await join(s.id, elif, 'PROJECT_MANAGER');
      await join(s.id, mehmet, 'PROJECT_MEMBER');
      const open = await task(s.listId, [mehmet]);

      await elifClient.delete(api(`/spaces/${s.id}/members/${mehmet}`)).expect(204);
      expect(await assignees(open.id)).toEqual([await idOf(OWNER.email)]);
    });

    it('Projeyi göremeyen kişi atanamaz', async () => {
      const s = await space('MOB');
      await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
      const elif = await idOf(ELIF.email);
      await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'X', assigneeIds: [elif] })
        .expect(404);
    });
  });

  describe('yükleme sınırları', () => {
    const PNG = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const upload = (client: Client, itemId: string, name = 'bir.png') =>
      client.upload(api(`/items/${itemId}/attachments`), PNG, name);

    it('kişi sınırı dolunca yükleme 413 ile reddedilir; kaldırılınca açılır', async () => {
      const s = await space('MOB');
      const elifClient = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [s.id]);
      const elif = await idOf(ELIF.email);
      await join(s.id, elif, 'PROJECT_MEMBER');
      const item = await task(s.listId, []);

      await owner.put(api('/quotas'), { userId: elif, maxFiles: 1, maxMb: null }).expect(204);
      await upload(elifClient, item.id).expect(201);
      const res = await upload(elifClient, item.id, 'iki.png').expect(413);
      expect(res.body).toMatchObject({ code: 'UPLOAD_QUOTA_EXCEEDED' });

      const list = (await owner.get(api('/quotas')).expect(200)).body as QuotasResponse;
      expect(list.quotas).toHaveLength(1);
      expect(list.quotas[0]).toMatchObject({
        target: 'USER',
        targetId: elif,
        maxFiles: 1,
        usage: { files: 1 },
      });
      await owner.put(api('/quotas'), { userId: elif, maxFiles: null, maxMb: null }).expect(204);
      await upload(elifClient, item.id, 'iki.png').expect(201);
    });

    it('ekip sınırı ekip üyelerinin toplamına uygulanır; yalnızca Super Admin yönetir', async () => {
      const s = await space('MOB');
      const elifClient = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [s.id]);
      const mehmetClient = await inviteAndAccept(ctx, owner, ws, MEHMET, 'MEMBER', [s.id]);
      const elif = await idOf(ELIF.email);
      const mehmet = await idOf(MEHMET.email);
      const team = (
        (await owner.post(api('/teams'), { name: 'Mobil', memberIds: [elif, mehmet] }).expect(201))
          .body as Created
      ).id;
      const item = await task(s.listId, []);

      await elifClient.put(api('/quotas'), { teamId: team, maxFiles: 1, maxMb: null }).expect(403);
      await owner.put(api('/quotas'), { teamId: team, maxFiles: 1, maxMb: null }).expect(204);
      await upload(elifClient, item.id).expect(201);
      await upload(mehmetClient, item.id, 'b.png').expect(413);
    });
  });
});
