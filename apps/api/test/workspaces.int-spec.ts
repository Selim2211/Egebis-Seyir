import type {
  InvitationPreview,
  InvitationsResponse,
  MeResponse,
  MembersResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccessService } from '../src/modules/access/access.service';
import {
  Client,
  createTestApp,
  INVITE_LINK,
  inviteAndAccept,
  OWNER,
  resetState,
  setupOwner,
  type TestContext,
  tokenFromMail,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

describe('Workspace üyeleri ve davetler (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;

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

  it('davet e-postası gönderir, bekleyen davetlerde görünür', async () => {
    await owner
      .post(`/api/workspaces/${ws}/invitations`, { emails: ['Elif@Example.com'], role: 'MEMBER' })
      .expect(204);

    const mail = ctx.mail.outbox.at(-1)!;
    expect(mail.to).toBe('elif@example.com');
    expect(mail.subject).toBe('Test Kurumu çalışma alanına davet edildin');

    const list = (await owner.get(`/api/workspaces/${ws}/invitations`).expect(200))
      .body as InvitationsResponse;
    expect(list.invitations).toMatchObject([
      { email: 'elif@example.com', role: 'MEMBER', invitedBy: OWNER.name },
    ]);
  });

  it('davetle yeni hesap açılır, oturum başlar ve token bir daha kullanılamaz', async () => {
    await owner
      .post(`/api/workspaces/${ws}/invitations`, { emails: [ELIF.email], role: 'MEMBER' })
      .expect(204);
    const token = tokenFromMail(ctx, INVITE_LINK);
    const guest = await Client.create(ctx.app);

    const preview = (await guest.get(`/api/invitations/${token}`).expect(200))
      .body as InvitationPreview;
    expect(preview).toMatchObject({
      workspaceName: 'Test Kurumu',
      invitedBy: OWNER.name,
      email: ELIF.email,
      role: 'MEMBER',
      accountExists: false,
    });

    const missing = await guest.post(`/api/invitations/${token}/accept`, {}).expect(400);
    expect(missing.body).toEqual({ code: 'VALIDATION_FAILED' });

    await guest
      .post(`/api/invitations/${token}/accept`, { name: ELIF.name, password: ELIF.password })
      .expect(200, {
        workspaceId: ws,
      });
    const me = (await guest.get('/api/auth/me').expect(200)).body as MeResponse;
    expect(me.workspaces).toMatchObject([{ id: ws, role: 'MEMBER' }]);

    await guest.get(`/api/invitations/${token}`).expect(404);
    await (
      await Client.create(ctx.app)
    )
      .post(`/api/invitations/${token}/accept`, { name: 'X', password: 'y' })
      .expect(404);
  });

  it('hesabı olan kişi daveti giriş yaparak kabul eder', async () => {
    await inviteAndAccept(ctx, owner, ws, ELIF);
    // Elif workspace'ten çıkarılıp yeniden davet edilir: artık hesabı var.
    await ctx.prisma.membership.deleteMany({ where: { user: { email: ELIF.email } } });
    await owner
      .post(`/api/workspaces/${ws}/invitations`, { emails: [ELIF.email], role: 'MEMBER' })
      .expect(204);
    const token = tokenFromMail(ctx, INVITE_LINK);

    const anonymous = await Client.create(ctx.app);
    const preview = (await anonymous.get(`/api/invitations/${token}`).expect(200))
      .body as InvitationPreview;
    expect(preview.accountExists).toBe(true);
    const needLogin = await anonymous.post(`/api/invitations/${token}/accept`, {}).expect(401);
    expect(needLogin.body).toEqual({ code: 'INVITE_REQUIRES_LOGIN' });

    const wrongUser = await owner.post(`/api/invitations/${token}/accept`, {}).expect(403);
    expect(wrongUser.body).toEqual({ code: 'INVITE_EMAIL_MISMATCH' });

    await anonymous
      .post('/api/auth/login', { email: ELIF.email, password: ELIF.password })
      .expect(200);
    await anonymous.post(`/api/invitations/${token}/accept`, {}).expect(200);
  });

  it('mevcut üyeye davet gönderilemez', async () => {
    await inviteAndAccept(ctx, owner, ws, ELIF);
    const res = await owner
      .post(`/api/workspaces/${ws}/invitations`, { emails: [ELIF.email], role: 'MEMBER' })
      .expect(409);
    expect(res.body).toEqual({ code: 'ALREADY_MEMBER', details: { emails: [ELIF.email] } });
  });

  it('iptal edilen davet bağlantısı çalışmaz', async () => {
    await owner
      .post(`/api/workspaces/${ws}/invitations`, { emails: [ELIF.email], role: 'MEMBER' })
      .expect(204);
    const token = tokenFromMail(ctx, INVITE_LINK);
    const { invitations } = (await owner.get(`/api/workspaces/${ws}/invitations`))
      .body as InvitationsResponse;
    await owner.delete(`/api/workspaces/${ws}/invitations/${invitations[0]!.id}`).expect(204);
    await owner.get(`/api/invitations/${token}`).expect(404);
  });

  describe('yetkiler', () => {
    it('Member üyeleri görür ama davet edemez ve rol değiştiremez', async () => {
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const members = (await elif.get(`/api/workspaces/${ws}/members`).expect(200))
        .body as MembersResponse;
      expect(members.members.map((m) => [m.email, m.role])).toEqual([
        [OWNER.email, 'OWNER'],
        [ELIF.email, 'MEMBER'],
      ]);

      const invite = await elif
        .post(`/api/workspaces/${ws}/invitations`, { emails: ['x@example.com'], role: 'MEMBER' })
        .expect(403);
      expect(invite.body).toEqual({ code: 'FORBIDDEN' });
      const ownerId = members.members[0]!.userId;
      await elif.patch(`/api/workspaces/${ws}/members/${ownerId}`, { role: 'MEMBER' }).expect(403);
    });

    it('Guest üye listesini göremez (ADR-035)', async () => {
      const space = await owner
        .post(`/api/workspaces/${ws}/spaces`, { name: 'Müşteri', key: 'MUS', color: '#7C3AED' })
        .expect(201);
      const guest = await inviteAndAccept(
        ctx,
        owner,
        ws,
        { ...ELIF, email: 'ece@musteri.example' },
        'GUEST',
        [(space.body as { id: string }).id],
      );
      await guest.get(`/api/workspaces/${ws}/members`).expect(403);
    });

    it('Owner rolü korunur: Admin dokunamaz, son Owner düşürülemez', async () => {
      const admin = await inviteAndAccept(ctx, owner, ws, ELIF, 'ADMIN');
      const { members } = (await owner.get(`/api/workspaces/${ws}/members`))
        .body as MembersResponse;
      const ownerId = members.find((m) => m.role === 'OWNER')!.userId;
      const adminId = members.find((m) => m.role === 'ADMIN')!.userId;

      const byAdmin = await admin
        .patch(`/api/workspaces/${ws}/members/${ownerId}`, { role: 'MEMBER' })
        .expect(403);
      expect(byAdmin.body).toEqual({ code: 'OWNER_ONLY' });
      await admin.patch(`/api/workspaces/${ws}/members/${adminId}`, { role: 'OWNER' }).expect(403);

      const last = await owner
        .patch(`/api/workspaces/${ws}/members/${ownerId}`, { role: 'ADMIN' })
        .expect(403);
      expect(last.body).toEqual({ code: 'LAST_OWNER' });

      await owner.patch(`/api/workspaces/${ws}/members/${adminId}`, { role: 'MEMBER' }).expect(204);
      const events = await ctx.prisma.activityEvent.findMany({
        where: { action: 'member.role_changed' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.changes).toEqual({ role: { from: 'ADMIN', to: 'MEMBER' } });
    });

    it("üye çıkarılınca workspace'e erişemez", async () => {
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const { members } = (await owner.get(`/api/workspaces/${ws}/members`))
        .body as MembersResponse;
      await owner.delete(`/api/workspaces/${ws}/members/${members[1]!.userId}`).expect(204);
      await elif.get(`/api/workspaces/${ws}/members`).expect(404);
    });
  });

  describe('veri izolasyonu (ADR-012)', () => {
    it("başka workspace'in verisi yokmuş gibi 404 döner", async () => {
      const other = await ctx.prisma.$transaction(async (tx) => {
        const w = await tx.workspace.create({ data: { name: 'Başka Kurum' } });
        await ctx.app.get(AccessService).createSystemRoles(tx, w.id);
        return w;
      });
      const res = await owner.get(`/api/workspaces/${other.id}/members`).expect(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND' });
      await owner.get('/api/workspaces/gecersiz-id/members').expect(404);
      await owner
        .post(`/api/workspaces/${other.id}/invitations`, {
          emails: ['x@example.com'],
          role: 'MEMBER',
        })
        .expect(404);
    });
  });
});
