import type {
  BacklogResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
  SprintReview,
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
const DOD = ['Kod gözden geçirildi', 'Testler geçti'];
const DOR = ['Kabul kriteri yazıldı', 'Tahmin yapıldı', 'Bağımlılık yok'];

describe('DoD/DoR ve Sprint Review (gerçek veritabanı)', () => {
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
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const done = (s: { statuses: SpaceDetail['statuses'] }) =>
    s.statuses.find((x) => x.category === 'DONE')!.id;
  const backlog = async (spaceId: string) =>
    (await owner.get(api(`/spaces/${spaceId}/backlog`)).expect(200)).body as BacklogResponse;

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

  describe('Definition of Done (brief §6.3, ADR-065)', () => {
    it('Space maddeleri ayarlanır; Story detayında işaretsiz görünür, Task için boştur', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: DOD, dorItems: DOR }).expect(204);
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      const task = await item(s.listId, { type: 'TASK', title: 'B' });

      expect((await detail(story.id)).readiness).toEqual({
        dod: DOD.map((text) => ({ text, checked: false })),
        dor: DOR.map((text) => ({ text, checked: false })),
        dodEnforced: false,
      });
      expect((await detail(task.id)).readiness.dod).toEqual([]);
    });

    it('geçersiz maddeler reddedilir: tekrar, boş, fazla uzun, 20’den çok', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: ['a', 'a'] }).expect(400);
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: [' '] }).expect(400);
      await owner.patch(api(`/spaces/${s.id}`), { dorItems: ['x'.repeat(201)] }).expect(400);
      await owner
        .patch(api(`/spaces/${s.id}`), { dodItems: Array.from({ length: 21 }, (_, i) => `m${i}`) })
        .expect(400);
    });

    it('işaretler yalnızca Space maddeleriyle sınırlanır; Task’a işaret konamaz', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: DOD }).expect(204);
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      const task = await item(s.listId, { type: 'TASK', title: 'B' });

      await owner
        .put(api(`/items/${story.id}/dod`), { checked: ['Testler geçti', 'Uydurma'] })
        .expect(204);
      expect((await detail(story.id)).readiness.dod.map((d) => d.checked)).toEqual([false, true]);

      const res = await owner.put(api(`/items/${task.id}/dod`), { checked: [] }).expect(422);
      expect(res.body).toEqual({ code: 'READINESS_NOT_APPLICABLE' });
    });

    it('Space maddesi yeniden yazılırsa eski işaret düşer', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: DOD }).expect(204);
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      await owner.put(api(`/items/${story.id}/dod`), { checked: DOD }).expect(204);

      await owner
        .patch(api(`/spaces/${s.id}`), { dodItems: [DOD[0]!, 'Testler yazıldı ve geçti'] })
        .expect(204);
      expect((await detail(story.id)).readiness.dod.map((d) => d.checked)).toEqual([true, false]);
    });

    it('eksik DoD ile Done uyarıdır: force ile geçer; tamamlanınca uyarı yok', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: DOD }).expect(204);
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      const doneId = done(s);

      const warn = await owner.patch(api(`/items/${story.id}`), { statusId: doneId }).expect(409);
      expect(warn.body).toMatchObject({ code: 'DOD_INCOMPLETE', details: { count: 2 } });
      await owner.patch(api(`/items/${story.id}`), { statusId: doneId, force: true }).expect(204);

      const second = await item(s.listId, { type: 'STORY', title: 'B' });
      await owner.put(api(`/items/${second.id}/dod`), { checked: DOD }).expect(204);
      await owner.patch(api(`/items/${second.id}`), { statusId: doneId }).expect(204);
    });

    it('Space ayarıyla zorunlu: force da geçmez; Task etkilenmez', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: DOD, dodEnforced: true }).expect(204);
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      const task = await item(s.listId, { type: 'TASK', title: 'B' });
      const doneId = done(s);

      const blocked = await owner
        .patch(api(`/items/${story.id}`), { statusId: doneId, force: true })
        .expect(409);
      expect(blocked.body).toMatchObject({ code: 'DOD_ENFORCED', details: { count: 2 } });
      await owner.patch(api(`/items/${task.id}`), { statusId: doneId }).expect(204);

      await owner.put(api(`/items/${story.id}/dod`), { checked: DOD }).expect(204);
      await owner.patch(api(`/items/${story.id}`), { statusId: doneId }).expect(204);
    });

    it('DoD tanımsızsa hiçbir engel yoktur', async () => {
      const s = await space();
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      await owner.patch(api(`/items/${story.id}`), { statusId: done(s) }).expect(204);
    });

    it('işaretleme yetkisi: Stakeholder değiştiremez', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dodItems: DOD }).expect(204);
      const story = await item(s.listId, { type: 'STORY', title: 'A' });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.put(api(`/items/${story.id}/dod`), { checked: DOD }).expect(403);
    });
  });

  describe('Definition of Ready (brief §6.3)', () => {
    it('Backlog satırları DoR durumunu taşır; madde yoksa null', async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A' });
      const t = await item(s.listId, { type: 'TASK', title: 'T' });
      expect((await backlog(s.id)).items.map((i) => i.dor)).toEqual([null, null]);

      await owner.patch(api(`/spaces/${s.id}`), { dorItems: DOR }).expect(204);
      await owner.put(api(`/items/${a.id}/dor`), { checked: [DOR[0]!, DOR[1]!] }).expect(204);
      const rows = (await backlog(s.id)).items;
      expect(rows.find((r) => r.id === a.id)!.dor).toEqual({ checked: 2, total: 3 });
      expect(rows.find((r) => r.id === t.id)!.dor).toBeNull(); // Task'a uygulanmaz
    });
  });

  describe('sprint özeti (DoR)', () => {
    it('hazır olmayan Story sayısını verir', async () => {
      const s = await space();
      await owner.patch(api(`/spaces/${s.id}`), { dorItems: DOR }).expect(204);
      const a = await item(s.listId, { type: 'STORY', title: 'A' });
      const b = await item(s.listId, { type: 'STORY', title: 'B' });
      const { id } = (
        await owner
          .post(api(`/spaces/${s.id}/sprints`), {
            name: 'Sprint 1',
            startDate: '2026-10-05',
            endDate: '2026-10-16',
          })
          .expect(201)
      ).body as Created;
      await owner
        .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [a.id, b.id], sprintId: id })
        .expect(204);
      const count = async () =>
        (
          (await owner.get(api(`/spaces/${s.id}/sprints`)).expect(200)).body as {
            sprints: Array<{ notReadyCount: number }>;
          }
        ).sprints[0]!.notReadyCount;

      expect(await count()).toBe(2);
      await owner.put(api(`/items/${a.id}/dor`), { checked: DOR }).expect(204);
      expect(await count()).toBe(1);
    });
  });

  describe('Sprint Review (brief §5.6)', () => {
    async function finishedSprint() {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'Biten', points: 5 });
      const b = await item(s.listId, { type: 'STORY', title: 'Süren', points: 3 });
      const c = await item(s.listId, { type: 'STORY', title: 'Sonradan', points: 2 });
      const { id } = (
        await owner
          .post(api(`/spaces/${s.id}/sprints`), {
            name: 'Sprint 1',
            goal: 'Hedef',
            startDate: '2026-10-05',
            endDate: '2026-10-16',
          })
          .expect(201)
      ).body as Created;
      await owner
        .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [a.id, b.id], sprintId: id })
        .expect(204);
      await owner.post(api(`/sprints/${id}/start`), {}).expect(204);
      await owner
        .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [c.id], sprintId: id })
        .expect(204);
      await owner.patch(api(`/items/${a.id}`), { statusId: done(s) }).expect(204);
      return { s, id, a, b, c };
    }
    const review = async (id: string, client = owner) =>
      (await client.get(api(`/sprints/${id}/review`)).expect(200)).body as SprintReview;

    it('aktif sprint için önizleme: biten, bitmeyen ve sonradan eklenen (kapsam değişikliği)', async () => {
      const { id, a, b, c } = await finishedSprint();
      const r = await review(id);
      expect(r.completed.map((i) => i.key)).toEqual([a.key]);
      expect(r.unfinished.map((i) => i.key)).toEqual([b.key, c.key]);
      expect(r.scopeChanges).toHaveLength(1);
      expect(r.scopeChanges[0]).toMatchObject({ action: 'ADDED', points: 2, item: { key: c.key } });
      expect(r.notes).toBeNull();
    });

    it('tamamlanınca bitmeyenler çıkış olaylarından gelir (artık Backlog’da olsalar da)', async () => {
      const { id, a, b, c } = await finishedSprint();
      await owner.post(api(`/sprints/${id}/complete`), { unfinished: 'BACKLOG' }).expect(204);

      const r = await review(id);
      expect(r.sprint).toMatchObject({ status: 'COMPLETED', completedPoints: 5 });
      expect(r.completed.map((i) => i.key)).toEqual([a.key]);
      expect(r.unfinished.map((i) => i.key).sort()).toEqual([b.key, c.key].sort());
      expect(r.unfinished.every((i) => i.sprintId === null)).toBe(true);
    });

    it('demo notları yazılır ve silinir; Developer yazamaz, Space görenler okur', async () => {
      const { s, id } = await finishedSprint();
      await owner.put(api(`/sprints/${id}/review-notes`), { notes: 'Demo iyi geçti.' }).expect(204);
      expect((await review(id)).notes).toBe('Demo iyi geçti.');

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await elif.put(api(`/sprints/${id}/review-notes`), { notes: 'x' }).expect(403);
      expect((await review(id, elif)).notes).toBe('Demo iyi geçti.');

      await owner.put(api(`/sprints/${id}/review-notes`), { notes: '  ' }).expect(204);
      expect((await review(id)).notes).toBeNull();
      await owner.put(api(`/sprints/${id}/review-notes`), { notes: 'x'.repeat(5001) }).expect(400);
    });

    it("tamamlanmış sprint'in notları yine de yazılabilir (yalnızca öğe kümesi kilitli)", async () => {
      const { id } = await finishedSprint();
      await owner.post(api(`/sprints/${id}/complete`), { unfinished: 'BACKLOG' }).expect(204);
      await owner
        .put(api(`/sprints/${id}/review-notes`), { notes: 'Retro’ya taşınacak.' })
        .expect(204);
      expect((await review(id)).notes).toBe('Retro’ya taşınacak.');
    });
  });
});
