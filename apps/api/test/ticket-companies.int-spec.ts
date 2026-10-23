import type {
  BugBoxResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
  TicketCompaniesResponse,
  TicketRulesResponse,
  TicketSettings,
} from '@scrum/shared';
import { simpleParser } from 'mailparser';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TicketRepliesService } from '../src/modules/tickets/ticket-replies.service';
import { TicketsService } from '../src/modules/tickets/tickets.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

/** ADR-140: firmalar, domain eşleme (alt firma → üst firma), proje atama kuralları, Bug Kutusu, şablonlu süreç yanıtları. */
describe(
  'Çağrı sistemi: firma, atama, Bug Kutusu, süreç yanıtları (gerçek veritabanı)',
  { timeout: 40_000 },
  () => {
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
    });

    const mime = (o: {
      from: string;
      subject: string;
      id: string;
      text: string;
      inReplyTo?: string;
    }) =>
      Buffer.from(
        [
          `From: ${o.from}`,
          'To: destek@egebis.com.tr',
          `Subject: ${o.subject}`,
          `Message-ID: <${o.id}>`,
          ...(o.inReplyTo ? [`In-Reply-To: <${o.inReplyTo}>`] : []),
          'Date: Fri, 23 Oct 2026 10:00:00 +0300',
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          o.text,
          '',
        ].join('\r\n'),
      );
    const ingest = async (raw: Buffer) =>
      ctx.app
        .get(TicketsService)
        .ingest(await simpleParser(raw), raw, new Date('2026-10-23T07:00:00Z'));

    const space = async (key: string, name = key) => {
      const created = await owner.post(api('/spaces'), { name, key, color: '#7C3AED' }).expect(201);
      const id = (created.body as Created).id;
      const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
      return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
    };
    const company = async (body: Record<string, unknown>) =>
      (
        await owner
          .post(api('/tickets/companies'), {
            parentId: null,
            defaultSpaceId: null,
            notes: null,
            domains: [],
            ...body,
          })
          .expect(201)
      ).body as Created;
    const box = async (query = '') =>
      (await owner.get(api(`/bug-box${query}`)).expect(200)).body as BugBoxResponse;

    it('alt firma domaini üst firmaya bağlanır; Bug firmanın varsayılan projesine gider ve atama günlüğü tutulur', async () => {
      const mob = await space('MOB', 'Mobil');
      const parent = await company({
        name: 'Acme Holding',
        domains: ['acme.com'],
        defaultSpaceId: mob.id,
      });
      await company({ name: 'Acme Lojistik', parentId: parent.id, domains: ['lojistik-acme.com'] });

      // Alt firmanın domain'i (ve onun alt alan adı) üst firmaya bağlanır; varsayılan proje üst firmadan gelir.
      expect(
        await ingest(
          mime({
            from: 'Ali <ali@mail.lojistik-acme.com>',
            subject: 'Sepet hatası',
            id: 'a1@x.com',
            text: 'beyaz sayfa',
          }),
        ),
      ).toBe('created');
      const res = await box();
      expect(res.total).toBe(1);
      expect(res.items[0]).toMatchObject({
        title: 'Sepet hatası',
        space: { name: 'Mobil', inbox: false },
        email: {
          fromEmail: 'ali@mail.lojistik-acme.com',
          company: 'Acme Holding',
          subCompany: 'Acme Lojistik',
          routedTo: 'Mobil',
          routeReason: 'Firma varsayılanı: Acme Holding',
        },
      });

      // Tanımsız domain: gelen kutusunda (Belirsiz) kalır, gerekçe yazılır.
      await ingest(mime({ from: 'x@bilinmeyen.org', subject: 'Başka', id: 'a2@x.com', text: 'x' }));
      const unknown = (await box()).items.find((i) => i.title === 'Başka')!;
      expect(unknown.space.inbox).toBe(true);
      expect(unknown.email).toMatchObject({
        company: null,
        routeReason: 'Firma bulunamadı (domain tanımlı değil)',
      });
    });

    it('kurallar firma varsayılanından önce uygulanır; kural sırası ve devre dışı bırakma çalışır', async () => {
      const mob = await space('MOB', 'Mobil');
      const web = await space('WEB', 'Web');
      const fin = await company({
        name: 'Finans AŞ',
        domains: ['finans.com'],
        defaultSpaceId: mob.id,
      });
      await owner
        .post(api('/tickets/rules'), {
          companyId: fin.id,
          keyword: 'ödeme',
          spaceId: web.id,
          enabled: true,
        })
        .expect(201);

      await ingest(
        mime({ from: 'a@finans.com', subject: 'Ödeme ekranı donuyor', id: 'r1@x.com', text: 'x' }),
      );
      await ingest(
        mime({ from: 'a@finans.com', subject: 'Giriş sorunu', id: 'r2@x.com', text: 'x' }),
      );
      const items = (await box()).items;
      expect(items.find((i) => i.title === 'Ödeme ekranı donuyor')).toMatchObject({
        space: { name: 'Web' },
        email: { routeReason: 'Kural: “ödeme” · Finans AŞ' },
      });
      expect(items.find((i) => i.title === 'Giriş sorunu')!.space.name).toBe('Mobil');

      // Kural kapatılınca firma varsayılanına döner.
      const rules = (await owner.get(api('/tickets/rules')).expect(200))
        .body as TicketRulesResponse;
      await owner
        .put(api(`/tickets/rules/${rules.rules[0]!.id}`), {
          companyId: fin.id,
          keyword: 'ödeme',
          spaceId: web.id,
          enabled: false,
        })
        .expect(204);
      await ingest(
        mime({ from: 'a@finans.com', subject: 'Ödeme yine', id: 'r3@x.com', text: 'x' }),
      );
      expect((await box()).items.find((i) => i.title === 'Ödeme yine')!.space.name).toBe('Mobil');
    });

    it('firma doğrulamaları: ad/domain tekil, üst firma döngüsü ve geçersiz proje reddedilir', async () => {
      const a = await company({ name: 'A Şirketi', domains: ['a.com'] });
      await owner
        .post(api('/tickets/companies'), {
          name: 'a şirketi',
          parentId: null,
          defaultSpaceId: null,
          notes: null,
          domains: [],
        })
        .expect(409);
      const dup = await owner
        .post(api('/tickets/companies'), {
          name: 'B',
          parentId: null,
          defaultSpaceId: null,
          notes: null,
          domains: ['a.com'],
        })
        .expect(409);
      expect((dup.body as { code: string }).code).toBe('TICKET_DOMAIN_TAKEN');
      const b = await company({ name: 'B Şirketi', parentId: a.id });
      const cycle = await owner
        .put(api(`/tickets/companies/${a.id}`), {
          name: 'A Şirketi',
          parentId: b.id,
          defaultSpaceId: null,
          notes: null,
          domains: ['a.com'],
        })
        .expect(409);
      expect((cycle.body as { code: string }).code).toBe('TICKET_COMPANY_CYCLE');
      await owner
        .post(api('/tickets/companies'), {
          name: 'C',
          parentId: null,
          defaultSpaceId: crypto.randomUUID(),
          notes: null,
          domains: [],
        })
        .expect(422);
      await owner
        .post(api('/tickets/companies'), {
          name: 'D',
          parentId: null,
          defaultSpaceId: null,
          notes: null,
          domains: ['geçersiz domain'],
        })
        .expect(400);
      const list = (await owner.get(api('/tickets/companies')).expect(200))
        .body as TicketCompaniesResponse;
      expect(list.companies.find((c) => c.name === 'A Şirketi')).toMatchObject({
        childCount: 1,
        domains: ['a.com'],
      });
    });

    it('Bug Kutusu: sayfa başına 20, tarihe göre sıralı; firma, başlık, gönderen, sahip ve proje adına göre aranır', async () => {
      const mob = await space('MOB', 'Mobil');
      await company({ name: 'Zeta Ltd', domains: ['zeta.com'], defaultSpaceId: mob.id });
      for (let i = 1; i <= 23; i += 1) {
        await ingest(
          mime({
            from: `K${i} <k${i}@zeta.com>`,
            subject: `Hata ${i}`,
            id: `p${i}@x.com`,
            text: 'x',
          }),
        );
      }
      const first = await box();
      expect(first).toMatchObject({ total: 23, page: 1, pages: 2, pageSize: 20 });
      expect(first.items).toHaveLength(20);
      // En yeni önce (aynı saniyedeki kayıtlar kimlik sırasıyla): ilk sayfada 23. Bug var.
      expect(first.items[0]!.title).toBe('Hata 23');
      const second = await box('?page=2');
      expect(second.items).toHaveLength(3);
      expect(second.items.at(-1)!.title).toBe('Hata 1');
      expect((await box('?page=2&sort=old')).items[0]!.title).toBe('Hata 21');
      expect((await box('?page=99')).page).toBe(2);

      expect((await box('?q=zeta')).total).toBe(23);
      expect((await box('?q=Hata%2017')).total).toBe(1);
      expect((await box('?q=k5%40zeta')).total).toBe(1);
      expect((await box('?q=mobil')).total).toBe(23);
      expect((await box('?q=yokboyle')).total).toBe(0);
    });

    it('Member yalnızca erişebildiği projelerin Bug’larını görür; ayarlar yalnızca Owner/Admin', async () => {
      const mob = await space('MOB', 'Mobil');
      const secret = await space('GZL', 'Gizli');
      await owner.patch(api(`/spaces/${secret.id}`), { isPrivate: true }).expect(204);
      await company({ name: 'Mobil Müşteri', domains: ['m.com'], defaultSpaceId: mob.id });
      await company({ name: 'Gizli Müşteri', domains: ['g.com'], defaultSpaceId: secret.id });
      await ingest(mime({ from: 'a@m.com', subject: 'Herkese açık', id: 'v1@x.com', text: 'x' }));
      await ingest(
        mime({ from: 'a@g.com', subject: 'Gizli proje hatası', id: 'v2@x.com', text: 'x' }),
      );
      expect((await box()).total).toBe(2);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const seen = (await elif.get(api('/bug-box')).expect(200)).body as BugBoxResponse;
      expect(seen.items.map((i) => i.title)).toEqual(['Herkese açık']);
      await elif.get(api('/tickets/settings')).expect(403);
      await elif.get(api('/tickets/companies')).expect(403);
    });

    it('ayarlar: şifre şifreli saklanır ve dışarı verilmez; şablonlar kaydedilir', async () => {
      const before = (await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings;
      expect(before.source).toBe('ENV');
      const body = {
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapSecure: true,
        smtpHost: null,
        smtpPort: 465,
        smtpSecure: true,
        username: 'destek@example.com',
        password: 'gizli-sifre',
        address: 'destek@example.com',
        fromName: 'Destek Ekibi',
        pollSeconds: 60,
        autoReply: true,
        orgName: 'Egebis Bilişim',
        orgPhone: '0232 000 00 00',
        orgWebsite: 'egebis.com.tr',
        orgSignature: null,
        templates: before.templates,
      };
      await owner.put(api('/tickets/settings'), body).expect(204);
      const after = (await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings;
      expect(after).toMatchObject({
        source: 'APP',
        passwordState: 'SET',
        imapHost: 'imap.example.com',
        orgName: 'Egebis Bilişim',
      });
      expect(JSON.stringify(after)).not.toContain('gizli-sifre');
      // Şifre alanı gönderilmezse korunur; boş metin silerek temizler.
      const { password: _p, ...withoutPassword } = body;
      void _p;
      await owner.put(api('/tickets/settings'), withoutPassword).expect(204);
      expect(
        ((await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings)
          .passwordState,
      ).toBe('SET');
      await owner.put(api('/tickets/settings'), { ...body, password: '' }).expect(204);
      expect(
        ((await owner.get(api('/tickets/settings')).expect(200)).body as TicketSettings)
          .passwordState,
      ).toBe('EMPTY');
    });

    it('şablonlu yanıtlar: alındı, işleme alındı (Task + sprint + kişi), çözüldü; her biri bir kez', async () => {
      const mob = await space('MOB', 'Mobil');
      await company({ name: 'Acme', domains: ['acme.com'], defaultSpaceId: mob.id });
      const settings = (await owner.get(api('/tickets/settings')).expect(200))
        .body as TicketSettings;
      await owner
        .put(api('/tickets/settings'), {
          ...settings,
          password: undefined,
          orgName: 'Egebis Bilişim',
          orgPhone: '0232 000 00 00',
          orgWebsite: 'egebis.com.tr',
          orgSignature: null,
          address: 'destek@egebis.com.tr',
          username: 'destek@egebis.com.tr',
        })
        .expect(204);
      const outbox = ctx.app.get(TicketRepliesService).outbox;
      outbox.length = 0;

      await ingest(
        mime({
          from: 'Ayşe Yılmaz <ayse@acme.com>',
          subject: 'Re: Ödeme açılmıyor',
          id: 'f1@acme.com',
          text: 'sorun',
        }),
      );
      expect(outbox).toHaveLength(1);
      expect(outbox[0]).toMatchObject({
        kind: 'ack',
        to: 'ayse@acme.com',
        subject: 'Re: Ödeme açılmıyor',
        inReplyTo: '<f1@acme.com>',
      });
      expect(outbox[0]!.text).toContain('Merhaba Ayşe,');
      expect(outbox[0]!.text).toContain('MOB-1');
      expect(outbox[0]!.text).toContain('Egebis Bilişim\n0232 000 00 00\negebis.com.tr');

      const bug = (await box()).items[0]!;
      const replies = ctx.app.get(TicketRepliesService);
      expect(await replies.sweep(ws)).toBe(0); // henüz Task yok

      // Bug → Task, sprint'e al, kişiye ata → "işleme alındı".
      const task = (await owner.post(api(`/items/${bug.id}/convert-bug-to-task`)).expect(201))
        .body as CreatedItem;
      const me = (await owner.get('/api/auth/me').expect(200)).body as { user: { id: string } };
      const sprint = (
        await owner
          .post(api(`/spaces/${mob.id}/sprints`), {
            name: 'Sprint 1',
            goal: 'Hedef',
            startDate: '2026-10-05',
            endDate: '2026-10-30',
          })
          .expect(201)
      ).body as Created;
      await owner
        .post(api(`/spaces/${mob.id}/backlog/move`), { itemIds: [task.id], sprintId: sprint.id })
        .expect(204);
      expect(await replies.sweep(ws)).toBe(0); // sprint var ama kişi yok
      await owner.patch(api(`/items/${task.id}`), { assigneeIds: [me.user.id] }).expect(204);
      expect(await replies.sweep(ws)).toBe(1);
      expect(outbox.at(-1)).toMatchObject({ kind: 'processing', to: 'ayse@acme.com' });
      expect(outbox.at(-1)!.text).toContain('ön değerlendirmeden geçti ve işleme alındı');
      expect(outbox.at(-1)!.text).toContain('MOB-1');
      expect(await replies.sweep(ws)).toBe(0); // bir kez

      // Task tamamlanınca "çözüldü".
      const detail = (await owner.get(api(`/spaces/${mob.id}`)).expect(200)).body as SpaceDetail;
      const done = detail.statuses.find((s) => s.category === 'DONE')!;
      await owner.patch(api(`/items/${task.id}`), { statusId: done.id }).expect(204);
      expect(await replies.sweep(ws)).toBe(1);
      expect(outbox.at(-1)).toMatchObject({ kind: 'resolved', to: 'ayse@acme.com' });
      expect(outbox.at(-1)!.text).toContain('çözüldü');
      expect(await replies.sweep(ws)).toBe(0);
    });

    it('şablon kapatılınca yanıt gitmez; autoReply kapalıysa hiçbiri gitmez', async () => {
      const settings = (await owner.get(api('/tickets/settings')).expect(200))
        .body as TicketSettings;
      const outbox = ctx.app.get(TicketRepliesService).outbox;
      outbox.length = 0;
      await owner
        .put(api('/tickets/settings'), {
          ...settings,
          password: undefined,
          templates: { ...settings.templates, ack: { ...settings.templates.ack, enabled: false } },
        })
        .expect(204);
      await ingest(
        mime({ from: 'a@x-firma.com', subject: 'Kapalı şablon', id: 's1@x.com', text: 'x' }),
      );
      expect(outbox).toHaveLength(0);
      await owner
        .put(api('/tickets/settings'), {
          ...settings,
          password: undefined,
          autoReply: false,
        })
        .expect(204);
      await ingest(
        mime({ from: 'b@x-firma.com', subject: 'Kapalı yanıt', id: 's2@x.com', text: 'x' }),
      );
      expect(outbox).toHaveLength(0);
    });
  },
);
