import type {
  BacklogResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
  SprintDetail,
  SprintsResponse,
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

describe('Sprint ve Product Backlog (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED', ...body })
      .expect(201);
    const id = (res.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === id)!.lists[0]!.id;
    return { id, listId, statuses: detail.statuses };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const sprint = async (spaceId: string, body: Record<string, unknown> = {}) =>
    (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'Sprint 1',
          goal: 'Giriş akışı',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
          ...body,
        })
        .expect(201)
    ).body as Created;
  const backlog = async (spaceId: string, client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/backlog`)).expect(200)).body as BacklogResponse;
  const keys = (res: BacklogResponse) => res.items.map((i) => i.key);
  const move = (spaceId: string, body: Record<string, unknown>, client = owner) =>
    client.post(api(`/spaces/${spaceId}/backlog/move`), body);
  const detail = async (id: string) =>
    (await owner.get(api(`/sprints/${id}`)).expect(200)).body as SprintDetail;

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

  describe('sprint CRUD (ADR-061)', () => {
    it('oluşturulur, listelenir, düzenlenir ve silinir; aktivite yazılır', async () => {
      const s = await space();
      const { id } = await sprint(s.id, { capacityNote: '2 kişi, 1 izinli' });

      const list = (await owner.get(api(`/spaces/${s.id}/sprints`)).expect(200))
        .body as SprintsResponse;
      expect(list.sprints).toHaveLength(1);
      expect(list.sprints[0]).toMatchObject({
        name: 'Sprint 1',
        goal: 'Giriş akışı',
        status: 'PLANNED',
        capacityNote: '2 kişi, 1 izinli',
        startDate: '2026-10-05',
        endDate: '2026-10-16',
        itemCount: 0,
        points: 0,
      });

      await owner.patch(api(`/sprints/${id}`), { name: 'Sprint Bir', goal: null }).expect(204);
      const after = await detail(id);
      expect(after.sprint).toMatchObject({ name: 'Sprint Bir', goal: null });

      await owner.delete(api(`/sprints/${id}`)).expect(204);
      await owner.get(api(`/sprints/${id}`)).expect(404);
      const events = await ctx.prisma.activityEvent.findMany({ where: { entityId: id } });
      expect(events.map((e) => e.action).sort()).toEqual([
        'sprint.created',
        'sprint.deleted',
        'sprint.updated',
      ]);
    });

    it('geçersiz tarihler reddedilir', async () => {
      const s = await space();
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'X',
          startDate: '2026-10-16',
          endDate: '2026-10-05',
        })
        .expect(400);
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'X',
          startDate: '2026-10-01',
          endDate: '2027-01-01',
        })
        .expect(400);
      const { id } = await sprint(s.id);
      await owner.patch(api(`/sprints/${id}`), { endDate: '2026-10-01' }).expect(400);
    });

    it('Scrum kapalı Space sprint kabul etmez', async () => {
      const s = await space({ scrumEnabled: false, key: 'KAN' });
      const res = await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'X',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(409);
      expect(res.body).toEqual({ code: 'SCRUM_DISABLED' });
      await owner.get(api(`/spaces/${s.id}/backlog`)).expect(409);
    });

    it('aktif sprint silinemez, tarihleri değişmez (brief §6.1.2); ad ve hedef değişir', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      await ctx.prisma.sprint.update({ where: { id }, data: { status: 'ACTIVE' } });

      const del = await owner.delete(api(`/sprints/${id}`)).expect(409);
      expect(del.body).toEqual({ code: 'SPRINT_NOT_PLANNED' });
      const dates = await owner.patch(api(`/sprints/${id}`), { endDate: '2026-10-30' }).expect(409);
      expect(dates.body).toEqual({ code: 'SPRINT_DATES_LOCKED' });
      await owner.patch(api(`/sprints/${id}`), { goal: 'Yeni hedef' }).expect(204);
    });

    it('Space başına tek aktif sprint veritabanında garanti edilir (brief §6.1.1)', async () => {
      const s = await space();
      const a = await sprint(s.id);
      const b = await sprint(s.id, {
        name: 'Sprint 2',
        startDate: '2026-10-19',
        endDate: '2026-10-30',
      });
      await ctx.prisma.sprint.update({ where: { id: a.id }, data: { status: 'ACTIVE' } });
      await expect(
        ctx.prisma.sprint.update({ where: { id: b.id }, data: { status: 'ACTIVE' } }),
      ).rejects.toThrow();
    });

    it('tamamlanmış sprint salt-okunurdur (brief §6.1.8)', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      await ctx.prisma.sprint.update({ where: { id }, data: { status: 'COMPLETED' } });
      const res = await owner.patch(api(`/sprints/${id}`), { name: 'Y' }).expect(409);
      expect(res.body).toEqual({ code: 'SPRINT_READONLY' });
    });
  });

  describe('Product Backlog (ADR-062)', () => {
    it('Story/Bug/Task öncelik sırasıyla listelenir; yeni öğe en alta gelir', async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A', points: 5 });
      const b = await item(s.listId, { type: 'BUG', title: 'B' });
      expect(keys(await backlog(s.id))).toEqual([a.key, b.key]);
      const c = await item(s.listId, { type: 'TASK', title: 'C' });
      expect(keys(await backlog(s.id))).toEqual([a.key, b.key, c.key]);
    });

    it('Epic, alt öğeler ve tamamlananlar görünmez; Epic filtre için ayrıca döner', async () => {
      const s = await space();
      const epic = await item(s.listId, { type: 'EPIC', title: 'Ödeme', color: '#7C3AED' });
      const story = await item(s.listId, { type: 'STORY', title: 'Kart ekle', parentId: epic.id });
      await item(s.listId, { type: 'TASK', title: 'API', parentId: story.id });
      const done = await item(s.listId, { type: 'STORY', title: 'Biten' });
      const doneStatus = s.statuses.find((x) => x.category === 'DONE')!;
      await owner.patch(api(`/items/${done.id}`), { statusId: doneStatus.id }).expect(204);

      const res = await backlog(s.id);
      expect(keys(res)).toEqual([story.key]);
      expect(res.items[0]!.parentId).toBe(epic.id);
      expect(res.epics).toEqual([{ id: epic.id, key: epic.key, title: 'Ödeme', color: '#7C3AED' }]);
    });

    it('sıra mevcut öğelerin arasına sürüklenerek değişir', async () => {
      const s = await space();
      const [a, b, c] = [
        await item(s.listId, { type: 'STORY', title: 'A' }),
        await item(s.listId, { type: 'STORY', title: 'B' }),
        await item(s.listId, { type: 'STORY', title: 'C' }),
      ] as const;
      await backlog(s.id); // sıraları atar

      await move(s.id, { itemIds: [c.id], sprintId: null, afterId: null }).expect(204); // en başa
      expect(keys(await backlog(s.id))).toEqual([c.key, a.key, b.key]);
      await move(s.id, { itemIds: [c.id], sprintId: null, afterId: b.id }).expect(204); // en sona
      expect(keys(await backlog(s.id))).toEqual([a.key, b.key, c.key]);
      await move(s.id, { itemIds: [a.id, b.id], sprintId: null, afterId: c.id }).expect(204);
      expect(keys(await backlog(s.id))).toEqual([c.key, a.key, b.key]);
    });
  });

  describe('Backlog ↔ sprint (ADR-061, ADR-062)', () => {
    it("sprint'e taşınır, öncelik sırası korunur; toplamlar ve geçmiş yazılır", async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A', points: 5 });
      const b = await item(s.listId, { type: 'STORY', title: 'B', points: 3 });
      const c = await item(s.listId, { type: 'BUG', title: 'C' });
      const { id } = await sprint(s.id);

      await move(s.id, { itemIds: [c.id, a.id], sprintId: id }).expect(204);

      expect(keys(await backlog(s.id))).toEqual([b.key]);
      const d = await detail(id);
      expect(d.items.map((i) => i.key)).toEqual([a.key, c.key]); // öncelik sırası: A, C
      expect(d.items.every((i) => i.sprintId === id)).toBe(true);
      expect(d.sprint).toMatchObject({ itemCount: 2, points: 5, unestimatedCount: 1 });

      const events = await ctx.prisma.sprintItemEvent.findMany({ where: { sprintId: id } });
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.action === 'ADDED' && e.reason === 'PLANNED')).toBe(true);
      expect(events.find((e) => e.workItemId === a.id)!.points).toBe(5);
    });

    it("aktif sprint'e ekleme ve çıkarma scope change olarak kaydedilir", async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A', points: 2 });
      const { id } = await sprint(s.id);
      await ctx.prisma.sprint.update({ where: { id }, data: { status: 'ACTIVE' } });

      await move(s.id, { itemIds: [a.id], sprintId: id }).expect(204);
      await move(s.id, { itemIds: [a.id], sprintId: null }).expect(204);

      const events = await ctx.prisma.sprintItemEvent.findMany({
        where: { sprintId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => [e.action, e.reason])).toEqual([
        ['ADDED', 'SCOPE_CHANGE'],
        ['REMOVED', 'SCOPE_CHANGE'],
      ]);
    });

    it("sprint'ler arası taşımada eski sprint'ten çıkar, yenisine eklenir; aktivite yazılır", async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A', points: 2 });
      const one = await sprint(s.id);
      const two = await sprint(s.id, {
        name: 'Sprint 2',
        startDate: '2026-10-19',
        endDate: '2026-10-30',
      });
      await move(s.id, { itemIds: [a.id], sprintId: one.id }).expect(204);
      await move(s.id, { itemIds: [a.id], sprintId: two.id }).expect(204);

      expect((await detail(one.id)).items).toHaveLength(0);
      expect((await detail(two.id)).items.map((i) => i.key)).toEqual([a.key]);
      const activity = await ctx.prisma.activityEvent.findMany({
        where: { entityId: a.id, action: 'item.updated' },
        orderBy: { createdAt: 'asc' },
      });
      expect(activity.map((e) => e.changes)).toEqual([
        { sprintId: { from: null, to: 'Sprint 1' } },
        { sprintId: { from: 'Sprint 1', to: 'Sprint 2' } },
      ]);
    });

    it('Board için ağaç istenince alt öğeler üstlerinin hemen arkasında gelir', async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A' });
      const b = await item(s.listId, { type: 'STORY', title: 'B' });
      const task = await item(s.listId, { type: 'TASK', title: 'A-task', parentId: a.id });
      const sub = await item(s.listId, { type: 'SUBTASK', title: 'A-sub', parentId: task.id });
      const { id } = await sprint(s.id);
      await move(s.id, { itemIds: [a.id, b.id], sprintId: id }).expect(204);

      expect((await detail(id)).items.map((i) => i.key)).toEqual([a.key, b.key]);
      const tree = (await owner.get(api(`/sprints/${id}?tree=true`)).expect(200))
        .body as SprintDetail;
      expect(tree.items.map((i) => i.key)).toEqual([a.key, task.key, sub.key, b.key]);
    });

    it("sprint silinince öğeleri Backlog'a döner", async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A' });
      const { id } = await sprint(s.id);
      await move(s.id, { itemIds: [a.id], sprintId: id }).expect(204);
      expect(keys(await backlog(s.id))).toEqual([]);

      await owner.delete(api(`/sprints/${id}`)).expect(204);
      expect(keys(await backlog(s.id))).toEqual([a.key]);
    });

    it('uygun olmayan öğe taşınamaz: Epic, Sub-task, Story altındaki Task, tamamlanmış', async () => {
      const s = await space();
      const epic = await item(s.listId, { type: 'EPIC', title: 'E' });
      const story = await item(s.listId, { type: 'STORY', title: 'S' });
      const task = await item(s.listId, { type: 'TASK', title: 'T', parentId: story.id });
      const sub = await item(s.listId, { type: 'SUBTASK', title: 'ST', parentId: task.id });
      const done = await item(s.listId, { type: 'STORY', title: 'D' });
      const doneStatus = s.statuses.find((x) => x.category === 'DONE')!;
      await owner.patch(api(`/items/${done.id}`), { statusId: doneStatus.id }).expect(204);
      const { id } = await sprint(s.id);

      for (const bad of [epic, task, sub, done]) {
        const res = await move(s.id, { itemIds: [bad.id], sprintId: id }).expect(422);
        expect(res.body).toMatchObject({ code: 'SPRINT_ITEM_NOT_ELIGIBLE' });
      }
    });

    it("tamamlanmış sprint'e öğe taşınamaz", async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A' });
      const { id } = await sprint(s.id);
      await ctx.prisma.sprint.update({ where: { id }, data: { status: 'COMPLETED' } });
      const res = await move(s.id, { itemIds: [a.id], sprintId: id }).expect(409);
      expect(res.body).toEqual({ code: 'SPRINT_READONLY' });
    });

    it("başka Space'in öğesi veya sprint'i bulunamaz (404)", async () => {
      const s = await space();
      const other = await space({ key: 'WEB', name: 'Web' });
      const a = await item(other.listId, { type: 'STORY', title: 'A' });
      const { id } = await sprint(s.id);
      await move(s.id, { itemIds: [a.id], sprintId: id }).expect(404);
      const b = await item(s.listId, { type: 'STORY', title: 'B' });
      const foreign = await sprint(other.id);
      await move(s.id, { itemIds: [b.id], sprintId: foreign.id }).expect(404);
    });
  });

  describe('yetkiler (brief §7.2)', () => {
    it('sprint planlama SM/PO ister; sıralama yalnızca PO; Developer ikisini de yapamaz', async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A' });
      const b = await item(s.listId, { type: 'STORY', title: 'B' });
      const { id } = await sprint(s.id);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      // Açık Space'te üye olmayan Stakeholder: görür ama değiştiremez.
      await elif.get(api(`/spaces/${s.id}/backlog`)).expect(200);
      await elif
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'X',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(403);

      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await move(s.id, { itemIds: [a.id], sprintId: id }, elif).expect(403);
      await move(s.id, { itemIds: [a.id], sprintId: null, afterId: b.id }, elif).expect(403);
      await elif.patch(api(`/sprints/${id}`), { name: 'Z' }).expect(403);

      await owner
        .put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'SCRUM_MASTER' })
        .expect(204);
      await move(s.id, { itemIds: [a.id], sprintId: id }, elif).expect(204); // sprint.plan
      await move(s.id, { itemIds: [b.id], sprintId: null, afterId: null }, elif).expect(403); // backlog.rank yok

      await owner
        .put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'PRODUCT_OWNER' })
        .expect(204);
      await move(s.id, { itemIds: [b.id], sprintId: null, afterId: null }, elif).expect(204);
    });

    it("özel Space'in sprint ve backlog'u üye olmayana görünmez (404)", async () => {
      const s = await space({ isPrivate: true });
      const { id } = await sprint(s.id);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(api(`/spaces/${s.id}/backlog`)).expect(404);
      await elif.get(api(`/spaces/${s.id}/sprints`)).expect(404);
      await elif.get(api(`/sprints/${id}`)).expect(404);
    });
  });
});
