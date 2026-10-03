import type { MeResponse, SessionsResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  OWNER,
  RESET_LINK,
  resetState,
  setupOwner,
  type TestContext,
  tokenFromMail,
} from './helpers';

describe('Kimlik doğrulama (gerçek veritabanı)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });

  describe('ilk kurulum', () => {
    const body = {
      workspaceName: 'Test Kurumu',
      name: OWNER.name,
      email: OWNER.email,
      password: OWNER.password,
      locale: 'tr',
    };

    it('kullanıcı yokken gerekir; anahtar ve CSRF olmadan çalışmaz', async () => {
      const client = await Client.create(ctx.app);
      await client.get('/api/setup/status').expect(200, { needsSetup: true });

      const noCsrf = await client.postWithoutCsrf('/api/setup', body).expect(403);
      expect(noCsrf.body).toEqual({ code: 'CSRF_INVALID' });
    });

    it('Owner ve workspace oluşturur, oturum açar ve bir daha çalışmaz', async () => {
      const client = await Client.create(ctx.app);
      const res = await client
        .post('/api/setup', { ...body, email: '  Zeynep@Example.com ' })
        .expect(201);
      const me = res.body as MeResponse;
      expect(me.user).toMatchObject({
        email: 'zeynep@example.com',
        name: OWNER.name,
        locale: 'tr',
      });
      expect(me.workspaces).toHaveLength(1);
      expect(me.workspaces[0]).toMatchObject({ name: 'Test Kurumu', role: 'OWNER' });
      expect(me.workspaces[0]!.permissions).toContain('workspace.members.manage');

      await client.get('/api/auth/me').expect(200);
      await client.get('/api/setup/status').expect(200, { needsSetup: false });

      const again = await (await Client.create(ctx.app)).post('/api/setup', body).expect(409);
      expect(again.body).toEqual({ code: 'SETUP_ALREADY_DONE' });

      const events = await ctx.prisma.activityEvent.findMany();
      expect(events.map((e) => e.action)).toEqual(['workspace.created']);
    });
  });

  describe('giriş ve oturumlar', () => {
    it('oturum yokken korumalı uçlar 401 döner', async () => {
      const client = await Client.create(ctx.app);
      const res = await client.get('/api/auth/me').expect(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED' });
    });

    it('yanlış şifre ve kayıtsız e-posta aynı hatayı verir', async () => {
      await setupOwner(ctx);
      const client = await Client.create(ctx.app);
      const wrong = await client
        .post('/api/auth/login', { email: OWNER.email, password: 'x' })
        .expect(401);
      const unknown = await client
        .post('/api/auth/login', { email: 'yok@example.com', password: 'x' })
        .expect(401);
      expect(wrong.body).toEqual({ code: 'INVALID_CREDENTIALS' });
      expect(unknown.body).toEqual(wrong.body);
    });

    it('giriş yapar, çıkışta oturum kapanır', async () => {
      await setupOwner(ctx);
      const client = await Client.create(ctx.app);
      const res = await client
        .post('/api/auth/login', { email: OWNER.email, password: OWNER.password })
        .expect(200);
      expect((res.body as MeResponse).user.email).toBe(OWNER.email);
      expect(res.headers['set-cookie']?.toString()).toMatch(/sm_session=.*HttpOnly.*SameSite=Lax/i);

      await client.get('/api/auth/me').expect(200);
      await client.post('/api/auth/logout').expect(204);
      await client.get('/api/auth/me').expect(401);
    });

    it('oturumları listeler ve başka bir oturumu sonlandırır', async () => {
      const { owner } = await setupOwner(ctx);
      const laptop = await Client.create(ctx.app);
      await laptop
        .post('/api/auth/login', { email: OWNER.email, password: OWNER.password, remember: true })
        .expect(200);

      const list = (await owner.get('/api/auth/sessions').expect(200)).body as SessionsResponse;
      expect(list.sessions).toHaveLength(2);
      const other = list.sessions.find((s) => !s.current)!;

      await owner.delete(`/api/auth/sessions/${other.id}`).expect(204);
      await laptop.get('/api/auth/me').expect(401);
      await owner.get('/api/auth/me').expect(200);
    });

    it('başkasının oturumu sonlandırılamaz', async () => {
      const { owner } = await setupOwner(ctx);
      const foreign = await ctx.prisma.user.create({
        data: { email: 'baska@example.com', name: 'Başka', passwordHash: 'x' },
      });
      const session = await ctx.prisma.session.create({
        data: { tokenHash: 'h', userId: foreign.id, expiresAt: new Date(Date.now() + 60_000) },
      });
      await owner.delete(`/api/auth/sessions/${session.id}`).expect(404);
    });
  });

  describe('şifre sıfırlama', () => {
    it('kayıtsız e-postada da 204 döner ama e-posta göndermez', async () => {
      await setupOwner(ctx);
      const client = await Client.create(ctx.app);
      await client.post('/api/auth/password/forgot', { email: 'yok@example.com' }).expect(204);
      expect(ctx.mail.outbox).toHaveLength(0);
    });

    it('bağlantıyla şifreyi değiştirir, tüm oturumları kapatır, token tek kullanımlıktır', async () => {
      const { owner } = await setupOwner(ctx);
      const client = await Client.create(ctx.app);
      await client.post('/api/auth/password/forgot', { email: OWNER.email }).expect(204);
      expect(ctx.mail.outbox.at(-1)!.subject).toBe('Şifre sıfırlama');
      const token = tokenFromMail(ctx, RESET_LINK);

      await client.post('/api/auth/password/reset', { token, password: 'yeni-sifre' }).expect(204);
      await owner.get('/api/auth/me').expect(401);

      await client
        .post('/api/auth/login', { email: OWNER.email, password: OWNER.password })
        .expect(401);
      await client
        .post('/api/auth/login', { email: OWNER.email, password: 'yeni-sifre' })
        .expect(200);

      const reuse = await client
        .post('/api/auth/password/reset', { token, password: 'baska' })
        .expect(400);
      expect(reuse.body).toEqual({ code: 'TOKEN_INVALID' });
    });
  });

  describe('profil', () => {
    it('tercihleri günceller', async () => {
      const { owner } = await setupOwner(ctx);
      const res = await owner
        .patch('/api/users/me', { locale: 'en', theme: 'dark', title: 'Admin' })
        .expect(200);
      expect((res.body as MeResponse).user).toMatchObject({
        locale: 'en',
        theme: 'dark',
        title: 'Admin',
      });
    });

    it('şifre değişiminde mevcut şifre doğrulanır ve diğer oturumlar kapanır', async () => {
      const { owner } = await setupOwner(ctx);
      const phone = await Client.create(ctx.app);
      await phone
        .post('/api/auth/login', { email: OWNER.email, password: OWNER.password })
        .expect(200);

      const bad = await owner
        .post('/api/users/me/password', { currentPassword: 'yanlis', newPassword: 'n' })
        .expect(400);
      expect(bad.body).toEqual({ code: 'CURRENT_PASSWORD_INVALID' });

      await owner
        .post('/api/users/me/password', { currentPassword: OWNER.password, newPassword: 'n' })
        .expect(204);
      await owner.get('/api/auth/me').expect(200);
      await phone.get('/api/auth/me').expect(401);
    });
  });
});
