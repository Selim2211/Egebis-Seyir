import type {
  BugBoxResponse,
  Created,
  HierarchyResponse,
  TicketAiTest,
  TicketSettings,
} from '@scrum/shared';
import { simpleParser } from 'mailparser';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { TicketAiService } from '../src/modules/tickets/ticket-ai.service';
import { TicketsService } from '../src/modules/tickets/tickets.service';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

/** ADR-141: yapay zeka ile Proje/önem/özet önerisi (gerçek ağ yok, sahte cevaplı). */
describe('Çağrı sistemi: yapay zeka yönlendirme (gerçek veritabanı)', { timeout: 40_000 }, () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const sent: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    ctx.app.get(TicketAiService).useFetcher(null);
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    sent.length = 0;
  });

  /** Modelin döndüreceği JSON'u (ya da hatayı) ayarlar; giden istek gövdesini `sent`e yazar. */
  const model = (answer: unknown, status = 200) =>
    ctx.app.get(TicketAiService).useFetcher((_url, init) => {
      sent.push(typeof init.body === 'string' ? init.body : '');
      return Promise.resolve(
        new Response(
          JSON.stringify(
            status === 200
              ? { choices: [{ message: { content: JSON.stringify(answer) } }] }
              : { error: 'hata' },
          ),
          { status },
        ),
      );
    });

  const enableAi = async (aiEnabled = true) => {
    const before = (await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings;
    await owner
      .put(api('/tickets/settings'), {
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapSecure: true,
        smtpHost: null,
        smtpPort: 465,
        smtpSecure: true,
        username: 'destek@example.com',
        address: 'destek@example.com',
        fromName: 'Destek',
        pollSeconds: 60,
        autoReply: false,
        orgName: null,
        orgPhone: null,
        orgWebsite: null,
        orgSignature: null,
        templates: before.templates,
        aiEnabled,
        aiModel: 'test/model',
        aiKey: 'gizli-ai-anahtari',
      })
      .expect(204);
  };

  const mime = (from: string, subject: string, id: string, text: string) =>
    Buffer.from(
      [
        `From: ${from}`,
        'To: destek@egebis.com.tr',
        `Subject: ${subject}`,
        `Message-ID: <${id}>`,
        'Date: Fri, 23 Oct 2026 10:00:00 +0300',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        text,
        '',
      ].join('\r\n'),
    );
  const ingest = async (raw: Buffer) =>
    ctx.app
      .get(TicketsService)
      .ingest(await simpleParser(raw), raw, new Date('2026-10-23T07:00:00Z'));
  const space = async (key: string, name: string) => {
    const created = await owner.post(api('/spaces'), { name, key, color: '#7C3AED' }).expect(201);
    return (created.body as Created).id;
  };
  const box = async () => (await owner.get(api('/bug-box')).expect(200)).body as BugBoxResponse;
  const summaryOf = (itemId: string) =>
    ctx.app
      .get(PrismaService)
      .inboundEmail.findFirst({ where: { workItemId: itemId }, select: { aiSummary: true } });

  it('kural ve firma projeyi belirleyemezse yapay zeka seçer; önem ve özet kaydedilir; kişisel veri gönderilmez', async () => {
    await space('MOB', 'Mobil');
    await space('WEB', 'Web Sitesi');
    await enableAi();
    model({
      project: 'mob',
      severity: 'CRITICAL',
      summary: 'Mobil uygulamada ödeme çöküyor.',
      reason: 'mobil uygulama sorunu',
    });
    expect(
      await ingest(
        mime(
          'Ali <ali@bilinmeyen.org>',
          'Ödeme çöküyor',
          'ai1@x.com',
          'Telefon 0532 111 22 33, ali@bilinmeyen.org adresime dönün. Uygulama açılışta kapanıyor.',
        ),
      ),
    ).toBe('created');
    const item = (await box()).items[0]!;
    expect(item).toMatchObject({
      space: { name: 'Mobil', inbox: false },
      severity: 'CRITICAL',
      email: { routedTo: 'Mobil', routeReason: 'YZ: mobil uygulama sorunu' },
    });
    expect((await summaryOf(item.id))?.aiSummary).toBe('Mobil uygulamada ödeme çöküyor.');
    // Dışarı giden istekte e-posta adresi ve telefon yok; anahtar sadece başlıkta gider (gövdede yok).
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('ali@bilinmeyen.org');
    expect(sent[0]).not.toContain('111 22 33');
    expect(sent[0]).toContain('[e-posta]');
    expect(sent[0]).not.toContain('gizli-ai-anahtari');
  });

  it('kural eşleşirse Proje kuraldan gelir, yapay zeka yalnızca önem ve özet ekler', async () => {
    const web = await space('WEB', 'Web Sitesi');
    await space('MOB', 'Mobil');
    await owner
      .post(api('/tickets/rules'), {
        companyId: null,
        keyword: 'fatura',
        spaceId: web,
        enabled: true,
      })
      .expect(201);
    await enableAi();
    model({ project: 'MOB', severity: 'MINOR', summary: 'Fatura sorusu.', reason: 'yanlış' });
    await ingest(mime('x@acme.com', 'Fatura soru', 'ai2@x.com', 'fatura nerede'));
    const item = (await box()).items[0]!;
    expect(item.space.name).toBe('Web Sitesi');
    expect(item.severity).toBe('MINOR');
    expect(item.email?.routeReason).toBe('Kural: “fatura”');
    expect((await summaryOf(item.id))?.aiSummary).toBe('Fatura sorusu.');
  });

  it('model olmayan bir proje uydurursa ya da emin değilse Bug Belirsiz’de kalır', async () => {
    await space('MOB', 'Mobil');
    await enableAi();
    model({ project: 'UYDURMA', severity: 'MAJOR', summary: 'Bilinmiyor.', reason: 'x' });
    await ingest(mime('x@acme.com', 'Garip konu', 'ai3@x.com', 'bir şey'));
    const item = (await box()).items[0]!;
    expect(item.space.inbox).toBe(true);
    expect(item.email?.routeReason).toContain('YZ de emin olamadı');
  });

  it('yapay zeka hata verse ya da kapalı olsa da Bug açılır, akış eskisi gibi çalışır', async () => {
    await space('MOB', 'Mobil');
    await enableAi();
    model({}, 503);
    expect(await ingest(mime('x@acme.com', 'Hata 1', 'ai4@x.com', 'bir şey'))).toBe('created');
    let item = (await box()).items[0]!;
    expect(item).toMatchObject({ severity: 'MAJOR', space: { inbox: true } });
    expect((await summaryOf(item.id))?.aiSummary).toBeNull();

    await enableAi(false);
    sent.length = 0;
    model({ project: 'MOB', severity: 'CRITICAL', summary: 's', reason: 'r' });
    await ingest(mime('x@acme.com', 'Hata 2', 'ai5@x.com', 'bir şey daha'));
    item = (await box()).items.find((i) => i.title === 'Hata 2')!;
    expect(item.space.inbox).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('ayarlar: anahtar şifreli saklanır ve görünmez; bağlantı testi çalışır', async () => {
    await enableAi();
    const view = (await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings;
    expect(view).toMatchObject({ aiEnabled: true, aiModel: 'test/model', aiKeyState: 'SET' });
    expect(JSON.stringify(view)).not.toContain('gizli-ai-anahtari');
    const stored = await ctx.app.get(PrismaService).ticketSettings.findFirst();
    expect(stored?.aiKeyEnc).toBeTruthy();
    expect(stored?.aiKeyEnc).not.toContain('gizli-ai-anahtari');

    ctx.app.get(TicketAiService).useFetcher(() =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'tamam' } }] }), {
          status: 200,
        }),
      ),
    );
    const ok = (await owner.post(api('/tickets/settings/ai-test'), {}).expect(200))
      .body as TicketAiTest;
    expect(ok).toMatchObject({ ok: true, sample: 'tamam' });

    model({}, 401);
    const bad = (await owner.post(api('/tickets/settings/ai-test'), {}).expect(200))
      .body as TicketAiTest;
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain('401');

    // Anahtar alanı gönderilmezse korunur; boş metin siler.
    await owner
      .put(api('/tickets/settings'), {
        ...view,
        passwordState: undefined,
        source: undefined,
        aiKeyState: undefined,
        aiEnabled: true,
      })
      .expect(204);
    expect(
      ((await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings).aiKeyState,
    ).toBe('SET');
  });

  it('hiyerarşiye bakan testler için: gelen kutusu Projesi menüde görünmez', async () => {
    await space('MOB', 'Mobil');
    await enableAi();
    model({ project: null, severity: 'MAJOR', summary: 's', reason: 'r' });
    await ingest(mime('x@acme.com', 'Belirsiz konu', 'ai6@x.com', 'bir şey'));
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    expect(tree.spaces.map((s) => s.name)).toEqual(['Mobil']);
  });
});
