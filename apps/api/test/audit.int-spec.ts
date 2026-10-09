import type { AuditResponse, Created, CreatedItem, HierarchyResponse } from '@scrum/shared';
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

/** Faz 8.3 (ADR-103): workspace denetim günlüğü. */
describe('Denetim günlüğü (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let elif: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const audit = async (qs = '', client = owner) =>
    (await client.get(api(`/audit${qs}`)).expect(200)).body as AuditResponse;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    elif = await inviteAndAccept(ctx, owner, ws, ELIF);
  });

  it('yalnız Sahip/Yönetici görür; Üye 403 alır', async () => {
    await elif.get(api('/audit')).expect(403);
    const res = await audit();
    expect(res.events.length).toBeGreaterThan(0);
  });

  it('kim, ne zaman, neyi yaptı: Space, sprint, öğe, ekip ve doküman kayıtları', async () => {
    const space = (
      await owner.post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === space.id)!.lists[0]!.id;
    const item = (
      await owner.post(api(`/lists/${listId}/items`), { type: 'STORY', title: 'Giriş' }).expect(201)
    ).body as CreatedItem;
    await owner
      .post(api(`/spaces/${space.id}/sprints`), {
        name: 'Sprint 1',
        startDate: '2026-10-05',
        endDate: '2026-10-16',
      })
      .expect(201);
    await owner.post(api('/teams'), { name: 'Backend', memberIds: [] }).expect(201);
    const doc = (await owner.post(api(`/spaces/${space.id}/docs`), { title: 'Mimari' }).expect(201))
      .body as Created;
    await owner.patch(api(`/docs/${doc.id}`), { title: 'Mimari v2', revision: 1 });

    const res = await audit();
    const actions = res.events.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'space.created',
        'item.created',
        'sprint.created',
        'team.created',
        'doc.created',
        'member.joined',
      ]),
    );
    const created = res.events.find((e) => e.action === 'item.created')!;
    expect(created.actor?.name).toBe('Zeynep Kaya');
    expect(created.entityLabel).toBe(`${item.key} Giriş`);
    expect(Number.isNaN(Date.parse(created.at))).toBe(false);
    expect(res.events.find((e) => e.action === 'sprint.created')?.entityLabel).toBe('Sprint 1');
    expect(res.events.find((e) => e.action === 'team.created')?.entityLabel).toBe('Backend');
    expect(res.actors.map((a) => a.name)).toContain('Zeynep Kaya');
  });

  it('süzgeçler: kişi, tür, eylem öneki, tarih; imleçle sayfalanır', async () => {
    const space = (
      await owner.post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    for (const name of ['A', 'B', 'C']) {
      await owner
        .post(api(`/spaces/${space.id}/sprints`), {
          name: `Sprint ${name}`,
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201);
    }
    const sprints = await audit('?entityType=sprint');
    expect(sprints.events.every((e) => e.entityType === 'sprint')).toBe(true);
    expect(sprints.events).toHaveLength(3);

    const prefix = await audit('?action=sprint.');
    expect(prefix.events.every((e) => e.action.startsWith('sprint.'))).toBe(true);

    const joinedActor = (await audit()).events.find((e) => e.action === 'member.joined')!.actor!;
    const byActor = await audit(`?actorId=${joinedActor.id}`);
    expect(byActor.events.every((e) => e.actor?.id === joinedActor.id)).toBe(true);

    const future = await audit('?from=2999-01-01');
    expect(future.events).toHaveLength(0);
    const today = new Date().toISOString().slice(0, 10);
    expect((await audit(`?from=${today}&to=${today}`)).events.length).toBeGreaterThan(0);

    // Sayfalama: 50'den çok kayıt üretip imleçle ikinci sayfayı al.
    for (let i = 0; i < 55; i++) {
      await owner
        .post(api(`/spaces/${space.id}/sprints`), {
          name: `Toplu ${i}`,
          startDate: '2026-11-02',
          endDate: '2026-11-13',
        })
        .expect(201);
    }
    const first = await audit('?entityType=sprint');
    expect(first.events).toHaveLength(50);
    expect(first.next).not.toBeNull();
    const second = await audit(`?entityType=sprint&before=${first.next}`);
    expect(second.events).toHaveLength(8);
    expect(second.next).toBeNull();
    const ids = new Set([...first.events, ...second.events].map((e) => e.id));
    expect(ids.size).toBe(58);
  });
});
