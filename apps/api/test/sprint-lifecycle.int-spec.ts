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

describe('Sprint yaşam döngüsü (gerçek veritabanı)', () => {
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
  const move = (spaceId: string, body: Record<string, unknown>, client = owner) =>
    client.post(api(`/spaces/${spaceId}/backlog/move`), body);
  const backlog = async (spaceId: string) =>
    (await owner.get(api(`/spaces/${spaceId}/backlog`)).expect(200)).body as BacklogResponse;
  const detail = async (id: string) =>
    (await owner.get(api(`/sprints/${id}`)).expect(200)).body as SprintDetail;
  const summaries = async (spaceId: string) =>
    ((await owner.get(api(`/spaces/${spaceId}/sprints`)).expect(200)).body as SprintsResponse)
      .sprints;
  const start = (id: string, client = owner) => client.post(api(`/sprints/${id}/start`), {});
  const complete = (id: string, body: Record<string, unknown>, client = owner) =>
    client.post(api(`/sprints/${id}/complete`), body);
  const status = (id: string, statusId: string) =>
    owner.patch(api(`/items/${id}`), { statusId }).expect(204);

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

  /** İki öğeli aktif sprint: biri (5 puan) Done, diğeri (3 puan) devam ediyor. */
  async function activeSprint() {
    const s = await space();
    const done = await item(s.listId, { type: 'STORY', title: 'Biten', points: 5 });
    const open = await item(s.listId, { type: 'STORY', title: 'Süren', points: 3 });
    const { id } = await sprint(s.id);
    await move(s.id, { itemIds: [done.id, open.id], sprintId: id }).expect(204);
    await start(id).expect(204);
    await status(done.id, s.statuses.find((x) => x.category === 'DONE')!.id);
    await status(open.id, s.statuses.find((x) => x.category === 'ACTIVE')!.id);
    return { s, id, done, open };
  }

  describe('başlatma (brief §6.1.1, §6.1.3)', () => {
    it('planlı sprint aktif olur; başlangıç zamanı ve aktivite yazılır', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      await start(id).expect(204);

      const [one] = await summaries(s.id);
      expect(one).toMatchObject({ status: 'ACTIVE' });
      expect(one!.startedAt).not.toBeNull();
      const events = await ctx.prisma.activityEvent.findMany({ where: { entityId: id } });
      expect(events.map((e) => e.action)).toContain('sprint.started');
    });

    it('hedef zorunludur; Space ayarı kapatılırsa hedefsiz başlar', async () => {
      const s = await space();
      const { id } = await sprint(s.id, { goal: null });
      const res = await start(id).expect(422);
      expect(res.body).toEqual({ code: 'SPRINT_GOAL_REQUIRED' });

      await owner.patch(api(`/spaces/${s.id}`), { sprintGoalRequired: false }).expect(204);
      await start(id).expect(204);
    });

    it('Space başına tek aktif sprint', async () => {
      const s = await space();
      const a = await sprint(s.id);
      const b = await sprint(s.id, {
        name: 'Sprint 2',
        startDate: '2026-10-19',
        endDate: '2026-10-30',
      });
      await start(a.id).expect(204);
      const res = await start(b.id).expect(409);
      expect(res.body).toMatchObject({
        code: 'SPRINT_ACTIVE_EXISTS',
        details: { name: 'Sprint 1' },
      });
    });

    it('aktif sprint yeniden başlatılamaz', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      await start(id).expect(204);
      const res = await start(id).expect(409);
      expect(res.body).toEqual({ code: 'SPRINT_NOT_PLANNED' });
    });

    it('Developer başlatamaz, Scrum Master başlatır', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await start(id, elif).expect(403);
      await owner
        .put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'SCRUM_MASTER' })
        .expect(204);
      await start(id, elif).expect(204);
    });
  });

  describe('tamamlama (brief §6.1.5, §6.1.7, §6.1.8)', () => {
    it("bitmeyenler Backlog'a döner; Done kalır; velocity donar; sprint salt-okunur olur", async () => {
      const { s, id, done, open } = await activeSprint();
      await complete(id, { unfinished: 'BACKLOG' }).expect(204);

      const [summary] = await summaries(s.id);
      expect(summary).toMatchObject({ status: 'COMPLETED', completedPoints: 5 });
      expect((await detail(id)).items.map((i) => i.key)).toEqual([done.key]);
      expect((await backlog(s.id)).items.map((i) => i.key)).toEqual([open.key]);

      const left = await ctx.prisma.sprintItemEvent.findMany({
        where: { sprintId: id, action: 'REMOVED' },
      });
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ workItemId: open.id, reason: 'UNFINISHED', points: 3 });

      // Sonradan Done geri açılsa da dondurulan velocity değişmez.
      await status(done.id, s.statuses[0]!.id);
      expect((await summaries(s.id))[0]!.completedPoints).toBe(5);
      await owner.patch(api(`/sprints/${id}`), { name: 'Y' }).expect(409);
    });

    it("bitmeyenler sonraki planlı sprint'e devredilir (CARRIED_OVER)", async () => {
      const { s, id, open } = await activeSprint();
      const next = await sprint(s.id, {
        name: 'Sprint 2',
        startDate: '2026-10-19',
        endDate: '2026-10-30',
      });
      await complete(id, { unfinished: 'NEXT_SPRINT', nextSprintId: next.id }).expect(204);

      expect((await detail(next.id)).items.map((i) => i.key)).toEqual([open.key]);
      const added = await ctx.prisma.sprintItemEvent.findMany({
        where: { sprintId: next.id, action: 'ADDED' },
      });
      expect(added.map((e) => e.reason)).toEqual(['CARRIED_OVER']);
      expect((await backlog(s.id)).items).toHaveLength(0);
    });

    it("devir hedefi planlı ve aynı Space'te olmalı; NEXT_SPRINT için hedef zorunlu", async () => {
      const { s, id } = await activeSprint();
      const other = await space({ key: 'WEB', name: 'Web' });
      const foreign = await sprint(other.id);
      const res = await complete(id, {
        unfinished: 'NEXT_SPRINT',
        nextSprintId: foreign.id,
      }).expect(422);
      expect(res.body).toEqual({ code: 'SPRINT_NEXT_INVALID' });
      await complete(id, { unfinished: 'NEXT_SPRINT', nextSprintId: id }).expect(422);
      await complete(id, { unfinished: 'NEXT_SPRINT' }).expect(400);
      await complete(id, { unfinished: 'ANYWHERE' }).expect(400);
      // Reddedilen denemelerde sprint hâlâ aktif.
      expect((await summaries(s.id)).find((x) => x.id === id)!.status).toBe('ACTIVE');
    });

    it('yalnızca aktif sprint tamamlanır', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      const res = await complete(id, { unfinished: 'BACKLOG' }).expect(409);
      expect(res.body).toEqual({ code: 'SPRINT_NOT_ACTIVE' });
    });

    it("tüm işler bittiyse Backlog'a dönen bir şey yoktur", async () => {
      const s = await space();
      const a = await item(s.listId, { type: 'STORY', title: 'A', points: 8 });
      const { id } = await sprint(s.id);
      await move(s.id, { itemIds: [a.id], sprintId: id }).expect(204);
      await start(id).expect(204);
      await status(a.id, s.statuses.find((x) => x.category === 'DONE')!.id);
      await complete(id, { unfinished: 'BACKLOG' }).expect(204);
      expect((await summaries(s.id))[0]).toMatchObject({ completedPoints: 8, itemCount: 1 });
      expect(await ctx.prisma.sprintItemEvent.count({ where: { reason: 'UNFINISHED' } })).toBe(0);
    });
  });

  describe('iptal (brief §6.1.6)', () => {
    it("yalnızca Product Owner iptal eder; öğeler Backlog'a döner", async () => {
      const { s, id, done, open } = await activeSprint();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner
        .put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'SCRUM_MASTER' })
        .expect(204);
      await elif.post(api(`/sprints/${id}/cancel`), {}).expect(403);

      await owner.post(api(`/sprints/${id}/cancel`), {}).expect(204);
      const [summary] = await summaries(s.id);
      expect(summary).toMatchObject({ status: 'CANCELLED', itemCount: 0 });
      expect(summary!.cancelledAt).not.toBeNull();
      // Done öğe Backlog'da görünmez, açık olan döner.
      expect((await backlog(s.id)).items.map((i) => i.key)).toEqual([open.key]);
      expect(done.key).toBeDefined();
    });

    it('tamamlanmış veya iptal sprint tekrar iptal edilemez', async () => {
      const { id } = await activeSprint();
      await complete(id, { unfinished: 'BACKLOG' }).expect(204);
      const res = await owner.post(api(`/sprints/${id}/cancel`), {}).expect(409);
      expect(res.body).toEqual({ code: 'SPRINT_CANCEL_NOT_ALLOWED' });
    });

    it('planlı sprint iptal edilebilir', async () => {
      const s = await space();
      const { id } = await sprint(s.id);
      await owner.post(api(`/sprints/${id}/cancel`), {}).expect(204);
      expect((await summaries(s.id))[0]!.status).toBe('CANCELLED');
    });
  });
});
