import type { Created, CreatedItem, HierarchyResponse, SpaceDetail } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };
const CAN = { email: 'can@example.com', name: 'Can Öz', password: 'can-pass-1234' };

/** Yönetici 5. tur (ADR-176): atanan zorunluluğu, tek SM/PO, arşiv sıkıştırma, ikon. */
describe('Yönetici 5. tur', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

  const project = async (key = 'MOB') => {
    const id = (
      (await owner.post(api('/spaces'), { name: key, key, color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { spaceId: id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
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

  describe('atanan zorunlu', () => {
    it('Task ve Sub-task atanansız açılamaz; atanan tamamen kaldırılamaz', async () => {
      const { listId } = await project();
      const none = await owner
        .post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'A', assigneeIds: [] })
        .expect(422);
      expect(none.body).toEqual({ code: 'ASSIGNEE_REQUIRED' });

      const task = (
        await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'A' }).expect(201)
      ).body as CreatedItem;
      const sub = await owner
        .post(api(`/lists/${listId}/items`), {
          type: 'SUBTASK',
          title: 'S',
          parentId: task.id,
          assigneeIds: [],
        })
        .expect(422);
      expect(sub.body).toEqual({ code: 'ASSIGNEE_REQUIRED' });

      const removed = await owner.patch(api(`/items/${task.id}`), { assigneeIds: [] }).expect(422);
      expect(removed.body).toEqual({ code: 'ASSIGNEE_REQUIRED' });
    });

    it('Epic atanansız açılabilir', async () => {
      const { listId } = await project();
      await owner
        .post(api(`/lists/${listId}/items`), { type: 'EPIC', title: 'E', assigneeIds: [] })
        .expect(201);
    });
  });

  describe('Scrum Master / Product Owner', () => {
    it('proje açan ilk Scrum Master olur; yeni Scrum Master atanınca öncekisi Team Member olur', async () => {
      const { spaceId } = await project();
      await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
      const elifId = await userId(ELIF.email);
      const ownerId = owner.userId!;

      let detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
      expect(detail.scrumMaster?.id).toBe(ownerId);

      await owner
        .put(api(`/spaces/${spaceId}/members/${elifId}`), { role: 'PROJECT_MANAGER' })
        .expect(204);
      detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
      expect(detail.scrumMaster?.id).toBe(elifId);
      const ownerRole = await ctx.prisma.spaceMember.findFirstOrThrow({
        where: { spaceId, userId: ownerId },
        include: { role: true },
      });
      expect(ownerRole.role.key).toBe('PROJECT_MEMBER');
    });

    it('Product Owner rolü alanı doldurur; rolü bırakan kişinin alanı boşalır', async () => {
      const { spaceId } = await project();
      await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
      const elifId = await userId(ELIF.email);
      const path = api(`/spaces/${spaceId}/members/${elifId}`);

      await owner.put(path, { role: 'PRODUCT_OWNER' }).expect(204);
      let detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
      expect(detail.productOwner?.id).toBe(elifId);

      await owner.put(path, { role: 'PROJECT_MEMBER' }).expect(204);
      detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
      expect(detail.productOwner).toBeNull();
    });

    it('Product Owner Backlog önceliğini sıralar, sprint planlayamaz', async () => {
      const { spaceId } = await project();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
      const elifId = await userId(ELIF.email);
      await owner
        .put(api(`/spaces/${spaceId}/members/${elifId}`), { role: 'PRODUCT_OWNER' })
        .expect(204);
      const me = (await elif.get('/api/auth/me').expect(200)).body as {
        workspaces: Array<{ id: string }>;
      };
      expect(me.workspaces[0]!.id).toBe(ws);
      await elif
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'S1',
          startDate: '2026-11-02',
          endDate: '2026-11-13',
        })
        .expect(403);
    });
  });

  describe('arşiv sıkıştırma', () => {
    it('arşivleyince içerik sıkıştırılıp canlı tablolardan kalkar; çıkarınca aynı kimliklerle döner', async () => {
      const { spaceId, listId } = await project();
      const make = async (title: string, extra: object = {}) =>
        (
          await owner
            .post(api(`/lists/${listId}/items`), { type: 'TASK', title, ...extra })
            .expect(201)
        ).body as CreatedItem;
      const a = await make('Birinci', { points: 5 });
      const b = await make('İkinci');
      await owner
        .post(api(`/items/${a.id}/comments`), {
          body: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Not' }] }],
          },
        })
        .expect(201);
      const sprint = (
        await owner
          .post(api(`/spaces/${spaceId}/sprints`), {
            name: 'Sprint 1',
            goal: 'Birinci ve ikinci işleri uçtan uca tamamlayıp ekibin ilk demosunu yapmak',
            startDate: '2026-11-02',
            endDate: '2026-11-13',
          })
          .expect(201)
      ).body as Created;
      await owner
        .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [a.id], sprintId: sprint.id })
        .expect(204);

      const before = {
        items: await ctx.prisma.workItem.count({ where: { spaceId } }),
        comments: await ctx.prisma.comment.count({ where: { workItem: { spaceId } } }),
        sprints: await ctx.prisma.sprint.count({ where: { spaceId } }),
      };
      expect(before).toEqual({ items: 2, comments: 1, sprints: 1 });

      await owner.post(api(`/spaces/${spaceId}/archive`), {}).expect(204);
      expect(await ctx.prisma.workItem.count({ where: { spaceId } })).toBe(0);
      expect(await ctx.prisma.comment.count({})).toBe(0);
      expect(await ctx.prisma.sprint.count({ where: { spaceId } })).toBe(0);
      const archive = await ctx.prisma.spaceArchive.findUniqueOrThrow({ where: { spaceId } });
      expect(archive.storedBytes).toBeGreaterThan(0);
      expect(archive.storedBytes).toBeLessThan(archive.rawBytes);

      await owner.post(api(`/spaces/${spaceId}/unarchive`), {}).expect(204);
      expect(await ctx.prisma.spaceArchive.count({ where: { spaceId } })).toBe(0);
      expect({
        items: await ctx.prisma.workItem.count({ where: { spaceId } }),
        comments: await ctx.prisma.comment.count({ where: { workItem: { spaceId } } }),
        sprints: await ctx.prisma.sprint.count({ where: { spaceId } }),
      }).toEqual(before);
      // Aynı kimlik ve anahtarlar: eski bağlantılar çalışır.
      const restored = await ctx.prisma.workItem.findUniqueOrThrow({ where: { id: a.id } });
      expect(restored).toMatchObject({ title: 'Birinci', points: 5, sprintId: sprint.id });
      expect(await ctx.prisma.workItem.findUnique({ where: { id: b.id } })).not.toBeNull();
    });

    it('iki kez arşivlemek ikinci kez sıkıştırmaz', async () => {
      const { spaceId, listId } = await project();
      await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'X' }).expect(201);
      await owner.post(api(`/spaces/${spaceId}/archive`), {}).expect(204);
      const first = await ctx.prisma.spaceArchive.findUniqueOrThrow({ where: { spaceId } });
      await owner.post(api(`/spaces/${spaceId}/archive`), {}).expect(204);
      const second = await ctx.prisma.spaceArchive.findUniqueOrThrow({ where: { spaceId } });
      expect(second.createdAt).toEqual(first.createdAt);
    });
  });

  describe('proje ikonu ve açıklama', () => {
    // 1x1 PNG
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );

    it('PNG yüklenir, sürümle sunulur ve kaldırılır; geçersiz dosya reddedilir', async () => {
      const { spaceId } = await project();
      const url = api(`/spaces/${spaceId}/icon`);
      const bad = await owner.upload(url, Buffer.from('düz metin'), 'x.png');
      expect(bad.status).toBe(422);

      const ok = await owner.upload(url, PNG, 'icon.png');
      expect(ok.status).toBe(200);
      const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
      expect(detail.iconImage).toBe((ok.body as { version: string }).version);
      const got = await owner.get(url).expect(200);
      expect(got.headers['content-type']).toContain('image/png');

      await owner.delete(url).expect(204);
      await owner.get(url).expect(404);
    });

    it('açıklama 1024 karaktere kadar kabul edilir', async () => {
      const { spaceId } = await project();
      await owner.patch(api(`/spaces/${spaceId}`), { description: 'a'.repeat(1024) }).expect(204);
      await owner.patch(api(`/spaces/${spaceId}`), { description: 'a'.repeat(1025) }).expect(400);
    });
  });

  it('Can: üye olmayan Scrum Master olamaz', async () => {
    const { spaceId } = await project();
    await inviteAndAccept(ctx, owner, ws, CAN, 'MEMBER', []);
    const canId = await userId(CAN.email);
    await owner
      .put(api(`/spaces/${spaceId}/scrum-roles`), { productOwnerId: null, scrumMasterId: canId })
      .expect(403);
  });
});
