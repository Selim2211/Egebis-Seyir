import type { Created, TeamsResponse } from '@scrum/shared';
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
const CAN = { email: 'can@example.com', name: 'Can Aydın', password: 'can-pass-12' };

describe('Ekipler (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let elifId: string;
  let canId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const teams = async (client = owner) =>
    ((await client.get(api('/teams')).expect(200)).body as TeamsResponse).teams;
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    await inviteAndAccept(ctx, owner, ws, ELIF);
    await inviteAndAccept(ctx, owner, ws, CAN);
    elifId = await userId(ELIF.email);
    canId = await userId(CAN.email);
  });

  it('ekip oluşturulur, üyeleri adıyla sıralı listelenir, güncellenir ve silinir', async () => {
    const created = (
      await owner
        .post(api('/teams'), { name: 'Backend', color: '#112233', memberIds: [canId, elifId] })
        .expect(201)
    ).body as Created;
    let [team] = await teams();
    expect(team).toMatchObject({ id: created.id, name: 'Backend', color: '#112233' });
    expect(team!.members.map((m) => m.name)).toEqual(['Can Aydın', 'Elif Demir']);

    await owner
      .patch(api(`/teams/${created.id}`), { name: 'Arka uç', memberIds: [elifId] })
      .expect(204);
    [team] = await teams();
    expect(team).toMatchObject({ name: 'Arka uç' });
    expect(team!.members.map((m) => m.id)).toEqual([elifId]);

    await owner.patch(api(`/teams/${created.id}`), { memberIds: [] }).expect(204);
    expect((await teams())[0]!.members).toEqual([]);

    await owner.delete(api(`/teams/${created.id}`)).expect(204);
    expect(await teams()).toEqual([]);
    await owner.delete(api(`/teams/${created.id}`)).expect(404);
  });

  it('aynı ad ikinci kez kullanılamaz; geçersiz girdi ve bilinmeyen üye reddedilir', async () => {
    await owner.post(api('/teams'), { name: 'Tasarım' }).expect(201);
    const dup = await owner.post(api('/teams'), { name: 'Tasarım' }).expect(409);
    expect(dup.body).toMatchObject({ code: 'TEAM_NAME_TAKEN' });
    await owner.post(api('/teams'), { name: '   ' }).expect(400);
    await owner.post(api('/teams'), { name: 'X', color: 'kırmızı' }).expect(400);
    await owner
      .post(api('/teams'), { name: 'Y', memberIds: ['0194ba6a-0001-7000-8000-000000000001'] })
      .expect(404);
    const second = (await owner.post(api('/teams'), { name: 'Test' }).expect(201)).body as Created;
    const rename = await owner.patch(api(`/teams/${second.id}`), { name: 'Tasarım' }).expect(409);
    expect(rename.body).toMatchObject({ code: 'TEAM_NAME_TAKEN' });
  });

  it('üyeler ekibi görür ve yönetir; Guest erişemez ve ekibe eklenemez', async () => {
    const elif = await Client.create(ctx.app);
    await elif.post('/api/auth/login', { email: ELIF.email, password: ELIF.password }).expect(200);
    const created = (await elif.post(api('/teams'), { name: 'Ürün' }).expect(201)).body as Created;
    expect(await teams(owner)).toHaveLength(1);
    await elif.patch(api(`/teams/${created.id}`), { memberIds: [canId] }).expect(204);

    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'S', key: 'SPC', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const guest = await inviteAndAccept(
      ctx,
      owner,
      ws,
      { email: 'misafir@example.com', name: 'Misafir', password: 'misafir-pass' },
      'GUEST',
      [spaceId],
    );
    await guest.get(api('/teams')).expect(403);
    const guestId = await userId('misafir@example.com');
    await owner.patch(api(`/teams/${created.id}`), { memberIds: [guestId] }).expect(404);
  });
});
