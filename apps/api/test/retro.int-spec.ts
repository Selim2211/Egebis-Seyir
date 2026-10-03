import type { Created, HierarchyResponse, RetroResponse, RetroTaskCreated } from '@scrum/shared';
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

describe('Sprint retrospektifi (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const sprint = async (spaceId: string, start = true) => {
    const { id } = (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'Sprint 1',
          goal: 'Hedef',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
    if (start) await owner.post(api(`/sprints/${id}/start`), {}).expect(204);
    return id;
  };
  const retro = async (id: string, client = owner) =>
    (await client.get(api(`/sprints/${id}/retro`)).expect(200)).body as RetroResponse;
  const add = (id: string, column: string, text: string, client = owner) =>
    client.post(api(`/sprints/${id}/retro/items`), { column, text });

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

  it('maddeler sütunlara eklenir; boş ve geçersiz sütun reddedilir', async () => {
    const s = await space();
    const id = await sprint(s.id);
    await add(id, 'WENT_WELL', 'Ekip uyumu iyiydi').expect(201);
    await add(id, 'IMPROVE', 'Toplantılar uzadı').expect(201);
    await add(id, 'IMPROVE', '   ').expect(400);
    await add(id, 'OTHER', 'x').expect(400);

    const data = await retro(id);
    expect(data.canParticipate).toBe(true);
    expect(data.sprint).toMatchObject({ id, name: 'Sprint 1', spaceId: s.id });
    expect(data.items.map((i) => [i.column, i.text])).toEqual([
      ['WENT_WELL', 'Ekip uyumu iyiydi'],
      ['IMPROVE', 'Toplantılar uzadı'],
    ]);
    expect(data.items[0]).toMatchObject({
      author: { name: 'Zeynep Kaya' },
      votes: 0,
      canDelete: true,
    });
  });

  it('oy açılıp kapanır; çok oy alan maddeler öne geçer', async () => {
    const s = await space();
    const id = await sprint(s.id);
    await add(id, 'IMPROVE', 'Birinci').expect(201);
    const second = ((await add(id, 'IMPROVE', 'İkinci').expect(201)).body as Created).id;

    await owner.put(api(`/sprints/${id}/retro/items/${second}/vote`), {}).expect(204);
    let data = await retro(id);
    expect(data.items.map((i) => i.text)).toEqual(['İkinci', 'Birinci']);
    expect(data.items[0]).toMatchObject({ votes: 1, voted: true });

    await owner.put(api(`/sprints/${id}/retro/items/${second}/vote`), {}).expect(204);
    data = await retro(id);
    expect(data.items[0]).toMatchObject({ text: 'Birinci' });
    expect(data.items.find((i) => i.id === second)).toMatchObject({ votes: 0, voted: false });
  });

  it('aksiyon göreve çevrilir ve Backlog’a düşer; ikinci kez ve diğer sütunlar reddedilir', async () => {
    const s = await space();
    const id = await sprint(s.id);
    const action = ((await add(id, 'ACTION', 'CI süresini kısalt').expect(201)).body as Created).id;
    const idea = ((await add(id, 'IMPROVE', 'Fikir').expect(201)).body as Created).id;

    await owner.post(api(`/sprints/${id}/retro/items/${idea}/task`), {}).expect(409);
    const res = await owner.post(api(`/sprints/${id}/retro/items/${action}/task`), {}).expect(201);
    expect((res.body as RetroTaskCreated).key).toBe('MOB-1');
    await owner.post(api(`/sprints/${id}/retro/items/${action}/task`), {}).expect(409);

    const data = await retro(id);
    expect(data.items.find((i) => i.id === action)!.task).toMatchObject({
      key: 'MOB-1',
      title: 'CI süresini kısalt',
    });
    const backlog = (await owner.get(api(`/spaces/${s.id}/backlog`)).expect(200)).body as {
      items: Array<{ title: string; type: string }>;
    };
    expect(backlog.items.find((i) => i.title === 'CI süresini kısalt')).toMatchObject({
      type: 'TASK',
    });

    // Görev silinirse bağ kopar ve aksiyon yeniden çevrilebilir.
    await owner.delete(api(`/items/${(res.body as RetroTaskCreated).id}`)).expect(204);
    expect((await retro(id)).items.find((i) => i.id === action)!.task).toBeNull();
    await owner.post(api(`/sprints/${id}/retro/items/${action}/task`), {}).expect(201);
  });

  it('planlı sprint’te retrospektif yok; tamamlanmışta düzenlenebilir', async () => {
    const s = await space();
    const planned = await sprint(s.id, false);
    await owner.get(api(`/sprints/${planned}/retro`)).expect(409);
    await add(planned, 'WENT_WELL', 'x').expect(409);

    await owner.post(api(`/sprints/${planned}/start`), {}).expect(204);
    await add(planned, 'WENT_WELL', 'Sprint içinde').expect(201);
    await owner.post(api(`/sprints/${planned}/complete`), { unfinished: 'BACKLOG' }).expect(204);
    await add(planned, 'IMPROVE', 'Sprint sonrası').expect(201);
    expect((await retro(planned)).items).toHaveLength(2);
  });

  it('yetki: Stakeholder okur ama katılamaz; başkasının maddesini yalnızca yönetici siler', async () => {
    const s = await space();
    const id = await sprint(s.id);
    const mine = ((await add(id, 'WENT_WELL', 'Benim').expect(201)).body as Created).id;
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

    expect((await retro(id, elif)).canParticipate).toBe(false);
    await add(id, 'WENT_WELL', 'x', elif).expect(403);
    await elif.put(api(`/sprints/${id}/retro/items/${mine}/vote`), {}).expect(403);

    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    await elif.put(api(`/sprints/${id}/retro/items/${mine}/vote`), {}).expect(204);
    expect((await retro(id, elif)).items[0]).toMatchObject({ canDelete: false, voted: true });
    await elif.delete(api(`/sprints/${id}/retro/items/${mine}`)).expect(403);

    // Yönetici (Space sahibi) başkasının maddesini siler.
    await owner.delete(api(`/sprints/${id}/retro/items/${mine}`)).expect(204);
    expect((await retro(id)).items).toEqual([]);
  });

  it('özel Space’in retrospektifi üye olmayana görünmez', async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Gizli', key: 'GZL', color: '#111111', isPrivate: true })
      .expect(201);
    const id = await sprint((res.body as Created).id);
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api(`/sprints/${id}/retro`)).expect(404);
  });
});
