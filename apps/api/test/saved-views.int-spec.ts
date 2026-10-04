import type { Created, HierarchyResponse, SavedViewsResponse } from '@scrum/shared';
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
const CONFIG = { view: 'table', status: ['x'], sort: 'due', dir: 'asc', q: 'rapor' };

describe('Kayıtlı görünümler (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const create = (listId: string, body: Record<string, unknown>, client = owner) =>
    client.post(api(`/lists/${listId}/views`), body);
  const views = async (listId: string, client = owner) =>
    (await client.get(api(`/lists/${listId}/views`)).expect(200)).body as SavedViewsResponse;

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

  it('görünüm kaydedilir, listelenir, güncellenir ve silinir', async () => {
    const s = await space();
    const { id } = (await create(s.listId, { name: 'Geciken işler', config: CONFIG }).expect(201))
      .body as Created;

    const list = await views(s.listId);
    expect(list.views).toHaveLength(1);
    expect(list.views[0]).toMatchObject({
      id,
      name: 'Geciken işler',
      shared: false,
      mine: true,
      canEdit: true,
      config: CONFIG,
    });
    expect(list.views[0]!.owner?.name).toBe('Zeynep Kaya');

    await owner
      .patch(api(`/lists/${s.listId}/views/${id}`), { name: 'Yeni ad', config: { view: 'board' } })
      .expect(204);
    expect((await views(s.listId)).views[0]).toMatchObject({
      name: 'Yeni ad',
      config: { view: 'board' },
    });

    await owner.delete(api(`/lists/${s.listId}/views/${id}`)).expect(204);
    expect((await views(s.listId)).views).toEqual([]);
  });

  it('geçersiz ad, bilinmeyen anahtar ve çok büyük yapılandırma reddedilir', async () => {
    const s = await space();
    await create(s.listId, { name: '  ', config: CONFIG }).expect(400);
    await create(s.listId, { name: 'A', config: { bilinmeyen: 1 } }).expect(400);
    await create(s.listId, { name: 'A', config: { q: 'x'.repeat(5000) } }).expect(400);
    await create(s.listId, { name: 'A' }).expect(400);
  });

  it('aynı kişi aynı adı iki kez kullanamaz; başkası kullanabilir', async () => {
    const s = await space();
    await create(s.listId, { name: 'Benim', config: CONFIG }).expect(201);
    const dup = await create(s.listId, { name: 'Benim', config: CONFIG }).expect(409);
    expect(dup.body).toEqual({ code: 'SAVED_VIEW_NAME_TAKEN' });

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await create(s.listId, { name: 'Benim', config: CONFIG }, elif).expect(201);
  });

  it('kişisel görünüm başkasına görünmez; paylaşımlı herkese görünür', async () => {
    const s = await space();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);

    const personal = (await create(s.listId, { name: 'Kişisel', config: CONFIG }).expect(201))
      .body as Created;
    await create(s.listId, { name: 'Ortak', shared: true, config: CONFIG }).expect(201);

    const theirs = await views(s.listId, elif);
    expect(theirs.views.map((v) => v.name)).toEqual(['Ortak']);
    expect(theirs.views[0]).toMatchObject({ mine: false, canEdit: false, shared: true });
    await elif.delete(api(`/lists/${s.listId}/views/${personal.id}`)).expect(404);

    const shared = theirs.views[0]!;
    await elif.patch(api(`/lists/${s.listId}/views/${shared.id}`), { name: 'Hack' }).expect(403);
    await elif.delete(api(`/lists/${s.listId}/views/${shared.id}`)).expect(403);
  });

  it('paylaşım için düzenleme yetkisi gerekir; Stakeholder kişisel görünüm kaydedebilir', async () => {
    const s = await space();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const own = (await create(s.listId, { name: 'Kişisel', config: CONFIG }, elif).expect(201))
      .body as Created;
    const denied = await create(
      s.listId,
      { name: 'Ortak', shared: true, config: CONFIG },
      elif,
    ).expect(403);
    expect(denied.body).toEqual({ code: 'SAVED_VIEW_SHARE_FORBIDDEN' });
    await elif.patch(api(`/lists/${s.listId}/views/${own.id}`), { shared: true }).expect(403);
  });

  it('Space yöneticisi paylaşımlı görünümü silebilir; sahip silinse de görünüm kalır', async () => {
    const s = await space();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    const shared = (
      await create(s.listId, { name: 'Ekip', shared: true, config: CONFIG }, elif).expect(201)
    ).body as Created;

    await ctx.prisma.savedView.update({ where: { id: shared.id }, data: { ownerId: null } });
    const list = await views(s.listId);
    expect(list.views[0]).toMatchObject({ name: 'Ekip', owner: null, mine: false, canEdit: true });
    await owner.delete(api(`/lists/${s.listId}/views/${shared.id}`)).expect(204);
  });

  it('özel Space’in görünümleri üye olmayana kapalı', async () => {
    const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api(`/lists/${hidden.listId}/views`)).expect(404);
    await create(hidden.listId, { name: 'X', config: CONFIG }, elif).expect(404);
  });
});
