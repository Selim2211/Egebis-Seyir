import type { Created, SpaceDetail } from '@scrum/shared';
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

describe('Durumlar: WIP limiti ve özel akış (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    return (res.body as Created).id;
  };
  const detail = async (spaceId: string, client = owner) =>
    (await client.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
  const listOf = async (spaceId: string) =>
    (
      (await owner.get(api('/hierarchy')).expect(200)).body as {
        spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
      }
    ).spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
  const names = async (spaceId: string) => (await detail(spaceId)).statuses.map((s) => s.name);
  const addItem = async (listId: string, statusId: string, title = 'İş') =>
    (
      (
        await owner
          .post(api(`/lists/${listId}/items`), { type: 'TASK', title, statusId })
          .expect(201)
      ).body as Created
    ).id;
  const item = (id: string) => ctx.prisma.workItem.findUniqueOrThrow({ where: { id } });
  const status = (spaceId: string, id: string) => api(`/spaces/${spaceId}/statuses/${id}`);

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

  describe('WIP limiti', () => {
    it('varsayılan durumların limiti yok; limit konur ve kaldırılır', async () => {
      const id = await space();
      const before = await detail(id);
      expect(before.statuses.every((s) => s.wipLimit === null)).toBe(true);
      const target = before.statuses[1]!;

      await owner.patch(status(id, target.id), { wipLimit: 3 }).expect(204);
      expect((await detail(id)).statuses[1]!.wipLimit).toBe(3);

      await owner.patch(status(id, target.id), { wipLimit: null }).expect(204);
      expect((await detail(id)).statuses[1]!.wipLimit).toBeNull();
    });

    it('geçersiz limit reddedilir', async () => {
      const id = await space();
      const target = (await detail(id)).statuses[0]!;
      for (const wipLimit of [0, -1, 1000, 1.5]) {
        await owner.patch(status(id, target.id), { wipLimit }).expect(400);
      }
    });

    it('limit işin taşınmasını engellemez', async () => {
      const id = await space();
      const list = await listOf(id);
      const column = (await detail(id)).statuses[1]!;
      await owner.patch(status(id, column.id), { wipLimit: 1 }).expect(204);
      await addItem(list, column.id, 'A');
      await addItem(list, column.id, 'B');
    });

    it('Space ayarı yetkisi olmayan limit koyamaz; başka Space durumu bulunamaz', async () => {
      const id = await space();
      const other = (
        await owner.post(api('/spaces'), { name: 'Web', key: 'WEB', color: '#7C3AED' }).expect(201)
      ).body as Created;
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      const first = (await detail(id)).statuses[0]!;
      await elif.patch(status(id, first.id), { wipLimit: 2 }).expect(403);
      await owner.patch(status(other.id, first.id), { wipLimit: 2 }).expect(404);
    });
  });

  describe('özel durum akışı', () => {
    it('durum eklenir, sıraya konur, adı ve rengi değişir; aynı ad çakışır', async () => {
      const id = await space();
      const review = (await detail(id)).statuses.find((s) => s.name === 'İncelemede')!;
      const created = (
        await owner
          .post(api(`/spaces/${id}/statuses`), {
            name: 'Test',
            color: '#112233',
            category: 'ACTIVE',
            afterId: review.id,
          })
          .expect(201)
      ).body as Created;
      expect(await names(id)).toEqual([
        'Backlog',
        'Yapılacak',
        'Devam ediyor',
        'İncelemede',
        'Test',
        'Tamamlandı',
      ]);

      await owner.patch(status(id, created.id), { name: 'QA', color: '#445566' }).expect(204);
      const qa = (await detail(id)).statuses.find((s) => s.id === created.id)!;
      expect(qa).toMatchObject({ name: 'QA', color: '#445566', category: 'ACTIVE' });

      const dup = await owner
        .post(api(`/spaces/${id}/statuses`), { name: 'qa', color: '#112233', category: 'ACTIVE' })
        .expect(409);
      expect(dup.body).toEqual({ code: 'STATUS_NAME_TAKEN' });
      await owner
        .post(api(`/spaces/${id}/statuses`), { name: 'X', color: 'kırmızı', category: 'ACTIVE' })
        .expect(400);
    });

    it('durum sırası değişir; ilk durum Done olamaz', async () => {
      const id = await space();
      const [, todo, , , done] = (await detail(id)).statuses;
      await owner
        .post(api(`/spaces/${id}/statuses/${done!.id}/move`), { afterId: todo!.id })
        .expect(204);
      expect(await names(id)).toEqual([
        'Backlog',
        'Yapılacak',
        'Tamamlandı',
        'Devam ediyor',
        'İncelemede',
      ]);
      const res = await owner
        .post(api(`/spaces/${id}/statuses/${done!.id}/move`), { afterId: null })
        .expect(409);
      expect(res.body).toEqual({ code: 'STATUS_WORKFLOW_INVALID' });
    });

    it('son Done kategorisi kaldırılamaz; kategori değişince tamamlanma zamanı uyar', async () => {
      const id = await space();
      const list = await listOf(id);
      const d = await detail(id);
      const done = d.statuses.find((s) => s.category === 'DONE')!;
      const review = d.statuses.find((s) => s.name === 'İncelemede')!;
      const blocked = await owner.patch(status(id, done.id), { category: 'ACTIVE' }).expect(409);
      expect(blocked.body).toEqual({ code: 'STATUS_WORKFLOW_INVALID' });

      const itemId = await addItem(list, review.id);
      expect((await item(itemId)).completedAt).toBeNull();
      await owner.patch(status(id, review.id), { category: 'DONE' }).expect(204);
      expect((await item(itemId)).completedAt).not.toBeNull();
      await owner.patch(status(id, review.id), { category: 'ACTIVE' }).expect(204);
      expect((await item(itemId)).completedAt).toBeNull();
    });

    it('durum silinince işler taşınır, kayıt arşivlenir ve aktivite yazılır', async () => {
      const id = await space();
      const list = await listOf(id);
      const d = await detail(id);
      const review = d.statuses.find((s) => s.name === 'İncelemede')!;
      const done = d.statuses.find((s) => s.category === 'DONE')!;
      const itemId = await addItem(list, review.id);

      const noTarget = await owner.delete(status(id, review.id)).expect(409);
      expect(noTarget.body).toEqual({ code: 'STATUS_MOVE_TARGET_INVALID' });
      await owner.delete(`${status(id, review.id)}?moveTo=${review.id}`).expect(409);

      await owner.delete(`${status(id, review.id)}?moveTo=${done.id}`).expect(204);
      expect(await names(id)).toEqual(['Backlog', 'Yapılacak', 'Devam ediyor', 'Tamamlandı']);
      const moved = await item(itemId);
      expect(moved.statusId).toBe(done.id);
      expect(moved.completedAt).not.toBeNull();
      const row = await ctx.prisma.status.findUniqueOrThrow({ where: { id: review.id } });
      expect(row.archivedAt).not.toBeNull();
      const events = await ctx.prisma.activityEvent.findMany({
        where: { entityId: itemId, action: 'item.updated' },
      });
      expect(events.some((e) => JSON.stringify(e.changes).includes(review.id))).toBe(true);

      // Arşivlenen duruma iş atanamaz; son Done durumu silinemez.
      await owner
        .post(api(`/lists/${list}/items`), { type: 'TASK', title: 'Y', statusId: review.id })
        .expect(404);
      const lastDone = await owner
        .delete(`${status(id, done.id)}?moveTo=${d.statuses[1]!.id}`)
        .expect(409);
      expect(lastDone.body).toEqual({ code: 'STATUS_WORKFLOW_INVALID' });
    });

    it('boş durum taşıma hedefi olmadan silinir', async () => {
      const id = await space();
      const review = (await detail(id)).statuses.find((s) => s.name === 'İncelemede')!;
      await owner.delete(status(id, review.id)).expect(204);
      expect(await names(id)).not.toContain('İncelemede');
    });

    it('en çok 20 durum', async () => {
      const id = await space();
      for (let i = 0; i < 15; i += 1) {
        await owner
          .post(api(`/spaces/${id}/statuses`), {
            name: `Ek ${i}`,
            color: '#112233',
            category: 'ACTIVE',
          })
          .expect(201);
      }
      const res = await owner
        .post(api(`/spaces/${id}/statuses`), {
          name: 'Fazla',
          color: '#112233',
          category: 'ACTIVE',
        })
        .expect(409);
      expect(res.body).toEqual({ code: 'STATUS_LIMIT' });
    });
  });
});
