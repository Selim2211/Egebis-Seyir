import type { Created, CreatedMember, MeResponse } from '@scrum/shared';
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

describe('Yönetici hesabı doğrudan oluşturur (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const loginAs = async (email: string, password: string) => {
    const client = await Client.create(ctx.app);
    return { client, res: await client.post('/api/auth/login', { email, password }) };
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

  it('verilen şifreyle hesap açılır; kullanıcı hemen giriş yapar ve e-posta gönderilmez', async () => {
    const res = await owner
      .post(api('/members'), {
        name: 'Ali Veli',
        email: 'ali@example.com',
        role: 'MEMBER',
        password: 'gizli-sifre-1',
      })
      .expect(201);
    const created = res.body as CreatedMember;
    expect(created).toMatchObject({ temporaryPassword: null, existingAccount: false });

    const { res: login } = await loginAs('ali@example.com', 'gizli-sifre-1');
    expect(login.status).toBe(200);
    const me = login.body as MeResponse;
    expect(me.user.email).toBe('ali@example.com');
    expect(me.workspaces[0]!.role).toBe('MEMBER');
    expect(ctx.mail.outbox).toHaveLength(0);

    const events = await ctx.prisma.activityEvent.findMany({ where: { action: 'member.created' } });
    expect(events).toHaveLength(1);
  });

  it('şifre verilmezse geçici şifre üretilir ve bir kez döner; o şifreyle giriş yapılır', async () => {
    const created = (
      await owner
        .post(api('/members'), { name: 'Ayşe', email: 'ayse@example.com', role: 'ADMIN' })
        .expect(201)
    ).body as CreatedMember;
    expect(created.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const { res } = await loginAs('ayse@example.com', created.temporaryPassword!);
    expect(res.status).toBe(200);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ayse@example.com' } });
    expect(row.passwordHash).not.toContain(created.temporaryPassword!);
    const members = (await owner.get(api('/members')).expect(200)).body as {
      members: Array<{ email: string; role: string }>;
    };
    expect(members.members.find((m) => m.email === 'ayse@example.com')?.role).toBe('ADMIN');
  });

  it('aynı e-posta ikinci kez açılamaz; kısa şifre ve Owner rolü reddedilir', async () => {
    await owner
      .post(api('/members'), { name: 'Ali', email: 'ali@example.com', role: 'MEMBER' })
      .expect(201);
    const dup = await owner
      .post(api('/members'), { name: 'Ali 2', email: 'ali@example.com', role: 'MEMBER' })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'ALREADY_MEMBER' });
    await owner
      .post(api('/members'), {
        name: 'X',
        email: 'x@example.com',
        role: 'MEMBER',
        password: 'kisa',
      })
      .expect(400);
    await owner
      .post(api('/members'), { name: 'X', email: 'x@example.com', role: 'OWNER' })
      .expect(400);
  });

  it('Guest en az bir Space ile açılır ve Stakeholder olur', async () => {
    const space = (
      await owner.post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    await owner
      .post(api('/members'), { name: 'Misafir', email: 'misafir@example.com', role: 'GUEST' })
      .expect(400);
    const created = (
      await owner
        .post(api('/members'), {
          name: 'Misafir',
          email: 'misafir@example.com',
          role: 'GUEST',
          spaceIds: [space.id],
        })
        .expect(201)
    ).body as CreatedMember;
    const member = await ctx.prisma.spaceMember.findFirstOrThrow({
      where: { userId: created.userId, spaceId: space.id },
      include: { role: true },
    });
    expect(member.role.key).toBe('STAKEHOLDER');
    await owner
      .post(api('/members'), {
        name: 'Misafir 2',
        email: 'misafir2@example.com',
        role: 'GUEST',
        spaceIds: ['0194ba6a-0001-7000-8000-000000000001'],
      })
      .expect(404);
  });

  it('yalnızca üye yönetme yetkisi olan açabilir', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif
      .post(api('/members'), { name: 'X', email: 'x@example.com', role: 'MEMBER' })
      .expect(403);
  });
});
