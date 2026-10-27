import type {
  AnalyticsSprints,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
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

/** ADR-145: sprint derinliği — taahhüt, biten, kapsam değişimi, devir ve devralma. */
describe('Analiz: sprint derinliği (gerçek veritabanı)', { timeout: 60_000 }, () => {
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

  const sprints = async (query = '') =>
    (await owner.get(api(`/analytics/sprints${query}`)).expect(200)).body as AnalyticsSprints;

  it('taahhüt, kapsam değişimi, devir ve devralma hesaplanır; ortalamalar tamamlananlardan gelir', async () => {
    const created = await owner
      .post(api('/spaces'), { name: 'Sprintli', key: 'SPR', color: '#7C3AED' })
      .expect(201);
    const spaceId = (created.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const done = detail.statuses.find((s) => s.category === 'DONE')!.id;
    const item = async (title: string, points: number) =>
      (await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title, points }).expect(201))
        .body as CreatedItem;
    const sprint = async (name: string, from: number, to: number) =>
      (
        await owner
          .post(api(`/spaces/${spaceId}/sprints`), {
            name,
            goal: 'Hedef',
            startDate: new Date(Date.now() + from * 86_400_000).toISOString().slice(0, 10),
            endDate: new Date(Date.now() + to * 86_400_000).toISOString().slice(0, 10),
          })
          .expect(201)
      ).body as Created;

    // Sprint 1: taahhüt 10 puan (5+3+2); başladıktan sonra 3 puanlık iş eklenir.
    const t1 = await item('T1', 5);
    const t2 = await item('T2', 3);
    const t3 = await item('T3', 2);
    const t4 = await item('T4 sonradan', 3);
    const s1 = await sprint('Sprint 1', 0, 9);
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), {
        itemIds: [t1.id, t2.id, t3.id],
        sprintId: s1.id,
      })
      .expect(204);
    await owner.post(api(`/sprints/${s1.id}/start`), {}).expect(204);
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [t4.id], sprintId: s1.id })
      .expect(204);
    // T1 ve T4 biter; T2 ve T3 bitmez → Sprint 2'ye devredilir.
    const s2 = await sprint('Sprint 2', 10, 20);
    for (const id of [t1.id, t4.id]) {
      await owner.patch(api(`/items/${id}`), { statusId: done }).expect(204);
    }
    await owner
      .post(api(`/sprints/${s1.id}/complete`), { unfinished: 'NEXT_SPRINT', nextSprintId: s2.id })
      .expect(204);

    const res = await sprints();
    // Yalnızca aktif ve tamamlanmış sprintler listelenir; planlı Sprint 2 yok.
    expect(res.sprints.map((s) => s.name)).toEqual(['Sprint 1']);
    const one = res.sprints[0]!;
    expect(one).toMatchObject({
      status: 'COMPLETED',
      project: { name: 'Sprintli' },
      committed: 10,
      completed: 8, // T1 (5) + T4 (3)
      doneItems: 2,
      scopeAdded: 3,
      scopeRemoved: 0,
      carryOverItems: 2,
      carryOverPoints: 5,
      commitmentPct: 80,
      scopeChangePct: 30,
      carryOverPct: 38, // 5 / (8 + 5)
    });
    // Sprint 2 henüz başlamadı (planlı): listede yok; devralınan iş ayrıca görünür olacak şekilde başlatılırsa sayılır.
    expect(res.sprints.find((s) => s.name === 'Sprint 2')).toBeUndefined();
  });

  it('özet yalnızca tamamlanan sprintlerden hesaplanır; Proje süzgeci ve erişim', async () => {
    const empty = await sprints();
    expect(empty.sprints).toEqual([]);
    expect(empty.summary).toMatchObject({
      completedCount: 0,
      avgVelocity: null,
      avgCommitmentPct: null,
    });

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/analytics/sprints')).expect(403);
    await owner.get(api('/analytics/sprints?from=2026-10-10&to=2026-10-01')).expect(400);
  });
});
