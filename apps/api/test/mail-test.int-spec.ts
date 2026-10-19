import type { MailSettings, MailTestResult } from '@scrum/shared';
import { SecretBoxService } from '../src/infra/security/secret-box.service';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type Client,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

describe('Test e-postası (Ayarlar → Genel, ADR-119)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const url = () => `/api/workspaces/${ws}/settings/mail-test`;

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

  it('yöneticinin kendi adresine gider ve sonucu döner', async () => {
    const before = ctx.mail.outbox.length;
    const res = (await owner.post(url(), {}).expect(200)).body as MailTestResult;
    expect(res).toMatchObject({ ok: true, code: null, detail: null });
    const sent = ctx.mail.outbox.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(res.to);
    expect(sent[0]!.subject).toMatch(/test/i);
  });

  it('workspace.settings izni olmayan Member yapamaz', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const before = ctx.mail.outbox.length;
    await elif.post(url(), {}).expect(403);
    expect(ctx.mail.outbox).toHaveLength(before);
  });

  describe('SMTP ayarı uygulamadan girilir (ADR-120)', () => {
    const settingsUrl = () => `/api/workspaces/${ws}/settings/mail`;
    const gmail = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      username: 'egebisseyir@gmail.com',
      password: 'abcd efgh ijkl mnop',
      from: 'Egebis Seyir <egebisseyir@gmail.com>',
    };

    it('kaydedilir; şifre veritabanında şifreli, yanıtta hiç yok', async () => {
      await owner.put(settingsUrl(), gmail).expect(204);
      const res = await owner.get(settingsUrl()).expect(200);
      const view = res.body as MailSettings;
      expect(view).toMatchObject({
        host: 'smtp.gmail.com',
        port: 587,
        username: 'egebisseyir@gmail.com',
        passwordSet: true,
        source: 'APP',
      });
      expect(JSON.stringify(res.body)).not.toContain('abcd');
      const row = await ctx.prisma.mailSettings.findUniqueOrThrow({ where: { id: 1 } });
      expect(row.passwordEnc).toMatch(/^v1:/);
      expect(row.passwordEnc).not.toContain('abcd');
      // Google uygulama şifresindeki boşluklar atılır; çözülünce 16 harf çıkar.
      expect(await ctx.app.get(SecretBoxService).open(row.passwordEnc!)).toBe('abcdefghijklmnop');
    });

    it('şifre alanı verilmezse korunur, boş verilirse silinir', async () => {
      await owner.put(settingsUrl(), gmail).expect(204);
      const { password: _omit, ...withoutPassword } = gmail;
      await owner.put(settingsUrl(), { ...withoutPassword, port: 465, secure: true }).expect(204);
      expect(((await owner.get(settingsUrl())).body as MailSettings).passwordSet).toBe(true);
      await owner.put(settingsUrl(), { ...withoutPassword, password: '' }).expect(204);
      expect(((await owner.get(settingsUrl())).body as MailSettings).passwordSet).toBe(false);
    });

    it('geçersiz sunucu adı reddedilir; DELETE kaydı siler', async () => {
      await owner.put(settingsUrl(), { ...gmail, host: 'https://smtp.gmail.com' }).expect(400);
      await owner.put(settingsUrl(), gmail).expect(204);
      await owner.delete(settingsUrl()).expect(204);
      expect(await ctx.prisma.mailSettings.count()).toBe(0);
    });

    it('yalnızca workspace.settings sahibi görür ve değiştirir; etkinlik kaydında şifre yok', async () => {
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(settingsUrl()).expect(403);
      await elif.put(settingsUrl(), gmail).expect(403);
      expect(await ctx.prisma.mailSettings.count()).toBe(0);

      await owner.put(settingsUrl(), gmail).expect(204);
      const events = await ctx.prisma.activityEvent.findMany({
        where: { action: 'workspace.mail_updated' },
      });
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events[0]!.changes)).not.toContain('abcd');
    });
  });
});
