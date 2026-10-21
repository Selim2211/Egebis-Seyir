import type { AppUrlSettings } from '@scrum/shared';
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

describe('Uygulamanın genel adresi (ADR-122)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const url = () => `/api/workspaces/${ws}/settings/app-url`;

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

  it('kaydedilen adres e-postalardaki davet bağlantısında kullanılır', async () => {
    expect(((await owner.get(url()).expect(200)).body as AppUrlSettings).custom).toBe(false);

    await owner.put(url(), { url: 'https://seyir.firma.com/' }).expect(204);
    expect((await owner.get(url()).expect(200)).body).toEqual({
      url: 'https://seyir.firma.com',
      custom: true,
    });

    const before = ctx.mail.outbox.length;
    await owner
      .post(`/api/workspaces/${ws}/invitations`, { emails: [ELIF.email], role: 'MEMBER' })
      .expect(204);
    const mail = ctx.mail.outbox.slice(before).at(-1)!;
    expect(mail.text).toContain('https://seyir.firma.com/invite/');
    expect(mail.text).not.toContain('localhost');
  });

  it('null gönderilince kayıt silinir ve sunucu değerine dönülür', async () => {
    await owner.put(url(), { url: 'https://seyir.firma.com' }).expect(204);
    await owner.put(url(), { url: null }).expect(204);
    const view = (await owner.get(url()).expect(200)).body as AppUrlSettings;
    expect(view.custom).toBe(false);
    expect(view.url).not.toBe('https://seyir.firma.com');
  });

  it('http(s) dışındaki ya da bozuk adresler reddedilir', async () => {
    for (const bad of [
      'javascript:alert(1)',
      'seyir.firma.com',
      'ftp://x.com',
      'https://a b.com',
    ]) {
      await owner.put(url(), { url: bad }).expect(400);
    }
    expect(await ctx.prisma.appSettings.count()).toBe(0);
  });

  it('yalnızca workspace.settings sahibi görür ve değiştirir; değişiklik etkinlik kaydına düşer', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(url()).expect(403);
    await elif.put(url(), { url: 'https://x.com' }).expect(403);

    await owner.put(url(), { url: 'https://seyir.firma.com' }).expect(204);
    const events = await ctx.prisma.activityEvent.findMany({
      where: { action: 'workspace.app_url_updated' },
    });
    expect(events).toHaveLength(1);
  });
});
