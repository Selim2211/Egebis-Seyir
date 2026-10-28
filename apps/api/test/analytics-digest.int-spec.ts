import type { AnalyticsDigest, AnalyticsDigestTest, Created } from '@scrum/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../src/infra/mail/mail.service';
import { AnalyticsDigestService } from '../src/modules/analytics/analytics-digest.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

/** ADR-149: haftalık özet e-postası ve Excel dışa aktarma. */
describe('Analiz: haftalık özet ve dışa aktarma (gerçek veritabanı)', { timeout: 60_000 }, () => {
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
    ctx.app.get(MailService).outbox.length = 0;
  });

  const outbox = () => ctx.app.get(MailService).outbox;
  const digest = async () =>
    (await owner.get(api('/analytics/digest')).expect(200)).body as AnalyticsDigest;

  // 2026-10-26 Pazartesi. İstanbul +03:00.
  const monday = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00+03:00`);

  it('ayar varsayılan kapalıdır, açılınca bir sonraki gönderim zamanı ve alıcı sayısı görünür', async () => {
    expect(await digest()).toMatchObject({
      enabled: false,
      lastSentAt: null,
      nextSendAt: null,
      recipients: 1,
    });
    const on = (await owner.put(api('/analytics/digest'), { enabled: true }).expect(200))
      .body as AnalyticsDigest;
    expect(on.enabled).toBe(true);
    expect(on.nextSendAt).not.toBeNull();
    // Gelecekteki bir Pazartesi 09:00 (İstanbul) ya da bu hafta henüz gönderilmediyse "şimdi".
    expect(new Date(on.nextSendAt!).getTime()).toBeGreaterThan(Date.now() - 5000);
    const off = (await owner.put(api('/analytics/digest'), { enabled: false }).expect(200))
      .body as AnalyticsDigest;
    expect(off).toMatchObject({ enabled: false, nextSendAt: null });
  });

  it('Pazartesi 09:00’dan sonra bir kez gönderilir; kapalıyken, başka günde ya da erken saatte gönderilmez', async () => {
    const svc = ctx.app.get(AnalyticsDigestService);
    // Kapalıyken hiçbir şey gitmez.
    expect(await svc.tick(monday('10:00'))).toBe(0);

    await owner.put(api('/analytics/digest'), { enabled: true }).expect(200);
    expect(await svc.tick(monday('08:30'))).toBe(0); // 09:00'dan önce
    expect(await svc.tick(new Date('2026-10-27T10:00:00+03:00'))).toBe(0); // Salı
    expect(outbox()).toHaveLength(0);

    expect(await svc.tick(monday('09:05'))).toBe(1);
    expect(outbox()).toHaveLength(1);
    const mail = outbox()[0]!;
    expect(mail.to).toBe('zeynep@example.com');
    expect(mail.subject).toMatch(/^Haftalık özet — .+ · 2026-10-19 – 2026-10-25$/);
    expect(mail.text).toContain('Geçen hafta (2026-10-19 – 2026-10-25)');
    expect(mail.text).toContain('Biten iş:');
    expect(mail.text).toContain('/analytics');
    expect(mail.html).toContain('Analiz sayfasını aç');

    // Aynı hafta ikinci kez gitmez; sonraki Pazartesi gider.
    expect(await svc.tick(monday('15:00'))).toBe(0);
    expect(await svc.tick(new Date('2026-11-02T09:30:00+03:00'))).toBe(1);
    expect(outbox()).toHaveLength(2);

    const after = await digest();
    expect(after.lastSentAt).not.toBeNull();
  });

  it('"kendime test gönder" özeti yalnızca isteği yapana yollar; üye ayarlara erişemez', async () => {
    const res = (await owner.post(api('/analytics/digest/test'), {}).expect(200))
      .body as AnalyticsDigestTest;
    expect(res.to).toBe('zeynep@example.com');
    expect(outbox()).toHaveLength(1);
    expect(outbox()[0]!.to).toBe('zeynep@example.com');

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/analytics/digest')).expect(403);
    await elif.put(api('/analytics/digest'), { enabled: true }).expect(403);
    await elif.post(api('/analytics/digest/test'), {}).expect(403);
  });

  /** İkili cevabı Buffer olarak okur. */
  const download = (c: Client, path: string) =>
    c
      .get(api(path))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  it('Excel dışa aktarma: sekmeye göre sayfalar iner; kişi dışındaki sekmeler yönetici içindir', async () => {
    const created = await owner
      .post(api('/spaces'), { name: 'Dışa', key: 'DIS', color: '#7C3AED' })
      .expect(201);
    const spaceId = (created.body as Created).id;
    const me = (await owner.get('/api/auth/me').expect(200)).body as { user: { id: string } };

    const names = async (path: string) => {
      const res = await download(owner, path).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain('analiz-');
      const wb = new ExcelJS.Workbook();
      const body: unknown = res.body;
      await wb.xlsx.load(body as ExcelJS.Buffer);
      return wb.worksheets.map((s) => s.name);
    };

    expect(await names(`/analytics/export?view=person&userId=${me.user.id}`)).toEqual([
      'Özet',
      'Zaman serisi',
      'Projeler',
      'Sprintler',
      'İşler',
    ]);
    expect(await names(`/analytics/export?view=project&projectId=${spaceId}`)).toContain('Kişiler');
    expect(await names('/analytics/export?view=flow')).toContain('Durumlarda bekleme');
    expect(await names('/analytics/export?view=sprint')).toContain('Sprintler');
    expect(await names('/analytics/export?view=capacity&weeklyHours=36')).toContain(
      'Haftalık ekip',
    );
    expect(await names('/analytics/export?view=quality')).toContain('Atama doğruluğu');
    expect(await names('/analytics/export?view=forecast')).toContain('Uyarılar');
    expect(await names(`/analytics/export?view=compare&userIds=${me.user.id}`)).toContain(
      'Karşılaştırma',
    );

    // Eksik parametre ve yetki.
    await owner.get(api('/analytics/export?view=project')).expect(400);
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = ((await elif.get('/api/auth/me').expect(200)).body as { user: { id: string } })
      .user.id;
    await download(elif, `/analytics/export?view=person&userId=${elifId}`).expect(200);
    await elif.get(api(`/analytics/export?view=person&userId=${me.user.id}`)).expect(403);
    await elif.get(api('/analytics/export?view=quality')).expect(403);
  });
});
