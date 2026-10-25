import type {
  AdminListResponse,
  AdminOverview,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
} from '@scrum/shared';
import { simpleParser } from 'mailparser';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
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

/** ADR-142: yönetici paneli yeni veriler ve tıklanınca açılan listeler; her kutucuğun sayısı listeyle tutmalı. */
describe(
  'Yönetici paneli: yeni veriler ve listeler (gerçek veritabanı)',
  { timeout: 60_000 },
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

    const overview = async () =>
      (await owner.get(api('/admin/overview')).expect(200)).body as AdminOverview;
    const list = async (kind: string, value?: string, page = 1) =>
      (
        await owner
          .get(
            api(
              `/admin/list?kind=${kind}${value ? `&value=${encodeURIComponent(value)}` : ''}&page=${page}`,
            ),
          )
          .expect(200)
      ).body as AdminListResponse;

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

    it('yeni veriler hesaplanır ve her kutucuğun sayısı açılan listeyle tutar', async () => {
      const created = await owner
        .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
        .expect(201);
      const spaceId = (created.body as Created).id;
      const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
      const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
      const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
      const done = detail.statuses.find((s) => s.category === 'DONE')!;
      const me = (await owner.get('/api/auth/me').expect(200)).body as { user: { id: string } };
      const item = async (body: Record<string, unknown>) =>
        (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

      // Firma + kural: Acme'den gelen Bug Mobil'e; tanımsız domain Belirsiz'e.
      const company = (
        await owner
          .post(api('/tickets/companies'), {
            name: 'Acme',
            parentId: null,
            defaultSpaceId: spaceId,
            notes: null,
            domains: ['acme.com'],
          })
          .expect(201)
      ).body as Created;
      await ingest(mime('a@acme.com', 'Acme hatası 1', 'l1@x.com', 'bir şey bozuk'));
      await ingest(mime('b@acme.com', 'Acme hatası 2', 'l2@x.com', 'başka şey bozuk'));
      await ingest(mime('c@bilinmeyen.org', 'Yabancı', 'l3@x.com', 'merhaba'));

      // Elle açılanlar + iş.
      await item({ type: 'BUG', title: 'Kritik elle', severity: 'CRITICAL' });
      const fixed = await item({ type: 'BUG', title: 'Çözülen', severity: 'MINOR' });
      await owner.patch(api(`/items/${fixed.id}`), { statusId: done.id }).expect(204);
      await item({ type: 'TASK', title: 'Geciken', dueDate: yesterday, assigneeIds: [me.user.id] });
      await item({ type: 'TASK', title: 'Atanmamış iş' });

      // Acme hatası 1'e insan yanıtı verildi (giden kutusu): yanıt süresi hesaplanır, bekleyen azalır.
      const prisma = ctx.app.get(PrismaService);
      const firstAcme = await prisma.inboundEmail.findFirstOrThrow({
        where: { subject: 'Acme hatası 1', kind: 'NEW' },
      });
      // Mail 3 saat önce geldi, yanıt 1 saat önce verildi: ilk yanıt süresi 2 saat.
      const mailAt = new Date(Date.now() - 3 * 3_600_000);
      await prisma.inboundEmail.update({
        where: { id: firstAcme.id },
        data: { receivedAt: mailAt },
      });
      await prisma.inboundEmail.create({
        data: {
          workspaceId: ws,
          workItemId: firstAcme.workItemId,
          kind: 'OUTBOUND',
          messageId: 'out1@x.com',
          fromName: 'Destek',
          fromEmail: 'destek@egebis.com.tr',
          subject: 'Re: Acme hatası 1',
          receivedAt: new Date(mailAt.getTime() + 2 * 3_600_000),
        },
      });

      const res = await overview();
      expect(res.bugs.bySource).toEqual({ email: 3, manual: 2 });
      expect(res.bugs.awaitingReply).toBe(2); // Acme hatası 2 ve Yabancı
      expect(res.bugs.avgFirstResponseHours).toBe(2);
      expect(res.bugs.routing).toEqual({ rule: 0, company: 2, ai: 0, unrouted: 1 });
      expect(res.bugs.byCompany).toEqual([
        { id: company.id, name: 'Acme', total: 2, open: 2, resolved: 0 },
      ]);
      expect(res.bugs.noCompany).toBe(1);
      expect(res.bugs.aging.reduce((n, a) => n + a.count, 0)).toBe(res.bugs.open);
      expect(res.bugs.oldestOpen).not.toBeNull();
      expect(res.totals.unassignedOpen).toBeGreaterThanOrEqual(1);
      expect(res.workload[0]).toMatchObject({ userId: me.user.id, open: 1, overdue: 1 });
      expect(res.velocity).toEqual([]);

      // Kutucuk sayısı = liste sayısı.
      const pairs: Array<[string, string | undefined, number]> = [
        ['open-work', undefined, res.totals.openItems],
        ['overdue', undefined, res.totals.overdueItems],
        ['completed-week', undefined, res.totals.completedThisWeek],
        ['unassigned-work', undefined, res.totals.unassignedOpen],
        ['bugs-all', undefined, res.bugs.total],
        ['bugs-open', undefined, res.bugs.open],
        ['bugs-new-today', undefined, res.bugs.newToday],
        ['bugs-new-week', undefined, res.bugs.newThisWeek],
        ['bugs-resolved-today', undefined, res.bugs.resolvedToday],
        ['bugs-resolved-week', undefined, res.bugs.resolvedThisWeek],
        ['bugs-unassigned', undefined, res.bugs.openUnassigned],
        ['bugs-inbox', undefined, res.bugs.inboxPending],
        ['bugs-awaiting', undefined, res.bugs.awaitingReply],
        ['bugs-email', undefined, res.bugs.bySource.email],
        ['bugs-manual', undefined, res.bugs.bySource.manual],
        [
          'bugs-severity',
          'CRITICAL',
          res.bugs.openBySeverity.find((s) => s.severity === 'CRITICAL')!.count,
        ],
        ['bugs-company', company.id, 2],
        ['bugs-company', 'none', res.bugs.noCompany],
        ['bugs-route', 'company', res.bugs.routing.company],
        ['bugs-route', 'none', res.bugs.routing.unrouted],
        ['bugs-age', 'D1', res.bugs.aging.find((a) => a.bucket === 'D1')!.count],
        ['person', me.user.id, 1],
        ['project', spaceId, res.projects.find((p) => p.key === 'MOB')!.openItems],
      ];
      for (const [kind, value, expected] of pairs) {
        const r = await list(kind, value);
        expect(r.total, `${kind} ${value ?? ''}`).toBe(expected);
      }

      // Satır içeriği: firma, atanan, Proje.
      const acme = await list('bugs-company', company.id);
      expect(acme.valueLabel).toBe('Acme');
      expect(acme.items[0]).toMatchObject({
        company: 'Acme',
        type: 'BUG',
        space: { name: 'Mobil' },
      });
      const mine = await list('person', me.user.id);
      expect(mine.valueLabel).toBeTruthy();
      expect(mine.items[0]).toMatchObject({ title: 'Geciken', assignees: [{ id: me.user.id }] });

      // Geçersiz değer boş liste verir, hata atmaz.
      expect((await list('bugs-severity', 'YOK')).total).toBe(0);
      expect((await list('bugs-age', 'X')).total).toBe(0);
      expect((await list('person', 'bozuk-id')).total).toBe(0);
      await owner.get(api('/admin/list?kind=bilinmeyen')).expect(400);
    });

    it('liste 25’erli sayfalanır; Member listeye erişemez', async () => {
      const created = await owner
        .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
        .expect(201);
      const spaceId = (created.body as Created).id;
      for (let i = 1; i <= 26; i += 1) {
        await owner
          .post(api(`/spaces/${spaceId}/bugs`), { title: `Hata ${i}`, severity: 'MAJOR' })
          .expect(201);
      }
      const p1 = await list('bugs-open');
      expect(p1).toMatchObject({ total: 26, pages: 2, pageSize: 25 });
      expect(p1.items).toHaveLength(25);
      const p2 = await list('bugs-open', undefined, 2);
      expect(p2.items).toHaveLength(1);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(api('/admin/list?kind=bugs-open')).expect(403);
    });
  },
);
