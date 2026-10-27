import type { AnalyticsQuality, Created, HierarchyResponse, SpaceDetail } from '@scrum/shared';
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
const DAY = 86_400_000;

/** ADR-147: kalite ve destek — çözüm süresi, önem, firma, ilk yanıt ve atama doğruluğu. */
describe('Analiz: kalite ve destek (gerçek veritabanı)', { timeout: 60_000 }, () => {
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

  it('çözüm süresi, önem derecesi, firma, ilk yanıt ve atama doğruluğu hesaplanır', async () => {
    const mk = async (name: string, key: string) => {
      const created = await owner.post(api('/spaces'), { name, key, color: '#7C3AED' }).expect(201);
      return (created.body as Created).id;
    };
    const mob = await mk('Mobil', 'MOB');
    const web = await mk('Web', 'WEB');
    const detail = (await owner.get(api(`/spaces/${mob}`)).expect(200)).body as SpaceDetail;
    const done = detail.statuses.find((s) => s.category === 'DONE')!.id;
    const company = (
      await owner
        .post(api('/tickets/companies'), {
          name: 'Acme',
          parentId: null,
          defaultSpaceId: mob,
          notes: null,
          domains: ['acme.com'],
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api('/tickets/rules'), {
        companyId: null,
        keyword: 'fatura',
        spaceId: web,
        enabled: true,
      })
      .expect(201);

    // E-postadan gelen Bug'lar: m1 firma varsayılanı, m2 kural, m3 firmasız (Belirsiz).
    await ingest(mime('a@acme.com', 'Sepet hatası', 'q1@x.com', 'beyaz sayfa'));
    await ingest(mime('a@acme.com', 'Fatura sorunu', 'q2@x.com', 'fatura gelmedi'));
    await ingest(mime('z@bilinmeyen.org', 'Genel soru', 'q3@x.com', 'merhaba'));
    // Elle açılanlar.
    const bug = async (spaceId: string, title: string, severity: string) =>
      (
        (await owner.post(api(`/spaces/${spaceId}/bugs`), { title, severity }).expect(201))
          .body as {
          id: string;
        }
      ).id;
    const b4 = await bug(mob, 'Kritik elle', 'CRITICAL');
    await bug(mob, 'Önemli elle', 'MAJOR');
    const b6 = await bug(mob, 'Küçük çözülen', 'MINOR');

    const prisma = ctx.app.get(PrismaService);
    const base = Date.now();
    const at = (d: number) => new Date(base - d * DAY);
    const mail = async (subject: string) =>
      prisma.inboundEmail.findFirstOrThrow({ where: { subject, kind: 'NEW' } });
    const m1 = await mail('Sepet hatası');
    const m2 = await mail('Fatura sorunu');
    const m3 = await mail('Genel soru');

    // Zamanlar: b6 2 gün, m1 3 gün sürede çözüldü; b4 12 gündür açık.
    await prisma.workItem.update({
      where: { id: b6 },
      data: { createdAt: at(10), completedAt: at(8), statusId: done },
    });
    await prisma.workItem.update({
      where: { id: m1.workItemId },
      data: { createdAt: at(6), completedAt: at(3), statusId: done },
    });
    await prisma.workItem.update({ where: { id: b4 }, data: { createdAt: at(12) } });
    // m1: e-posta 6 gün önce geldi, ilk insan yanıtı 5 saat sonra.
    await prisma.inboundEmail.update({ where: { id: m1.id }, data: { receivedAt: at(6) } });
    await prisma.inboundEmail.create({
      data: {
        workspaceId: ws,
        workItemId: m1.workItemId,
        kind: 'OUTBOUND',
        messageId: 'out-q1@x.com',
        fromName: 'Destek',
        fromEmail: 'destek@egebis.com.tr',
        subject: 'Re: Sepet hatası',
        receivedAt: new Date(at(6).getTime() + 5 * 3_600_000),
      },
    });
    // Sonradan başka projeye taşınanlar: kural atamalı m2 ve Belirsiz'deki m3.
    for (const m of [m2, m3]) {
      await prisma.activityEvent.create({
        data: {
          workspaceId: ws,
          entityType: 'item',
          entityId: m.workItemId,
          action: 'item.moved',
          changes: { spaceId: { from: m.routedSpaceId ?? mob, to: mob } },
          createdAt: new Date(base + 1000),
        },
      });
    }

    const res = (await owner.get(api('/analytics/quality')).expect(200)).body as AnalyticsQuality;
    expect(res.totals).toMatchObject({
      opened: 6,
      resolved: 2,
      avgResolveDays: 2.5,
      openNow: 4,
    });
    expect(res.previous).toMatchObject({ opened: 0, resolved: 0, avgResolveDays: null });
    expect(res.series.reduce((n, p) => n + p.opened, 0)).toBe(6);
    expect(res.series.reduce((n, p) => n + p.resolved, 0)).toBe(2);

    const sev = (s: string) => res.bySeverity.find((x) => x.severity === s)!;
    expect(sev('CRITICAL')).toMatchObject({ opened: 1, openNow: 1, oldestOpenDays: 12 });
    // E-postadan gelen Bug'lar varsayılan MAJOR: m1+m2+m3 ve elle açılan 1.
    expect(sev('MAJOR')).toMatchObject({ opened: 4, resolved: 1, avgResolveDays: 3, openNow: 3 });
    expect(sev('MINOR')).toMatchObject({ opened: 1, resolved: 1, avgResolveDays: 2, openNow: 0 });

    const acme = res.byCompany.find((c) => c.id === company.id)!;
    expect(acme).toMatchObject({
      name: 'Acme',
      bugs: 2,
      resolved: 1,
      openNow: 1,
      avgResolveDays: 3,
      avgFirstResponseHours: 5,
    });
    expect(res.routing).toEqual([
      { method: 'rule', bugs: 1, moved: 1, movedPct: 100 },
      { method: 'company', bugs: 1, moved: 0, movedPct: 0 },
      { method: 'ai', bugs: 0, moved: 0, movedPct: null },
      { method: 'unrouted', bugs: 1, moved: 1, movedPct: 100 },
    ]);

    // Açık Kritik/Önemli: b4 (12 gün) en eski, hepsi açık Bug.
    expect(res.critical).toHaveLength(4);
    expect(res.critical[0]).toMatchObject({ title: 'Kritik elle', severity: 'CRITICAL', days: 12 });
    const mobRow = res.byProject.find((p) => p.space.key === 'MOB')!;
    expect(mobRow.opened).toBeGreaterThanOrEqual(4);
    expect(mobRow.bugSharePct).toBe(100); // MOB'da açılan işlerin hepsi Bug

    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    expect(tree.spaces.map((s) => s.name).sort()).toEqual(['Mobil', 'Web']);
    const scoped = (await owner.get(api(`/analytics/quality?spaceId=${web}`)).expect(200))
      .body as AnalyticsQuality;
    expect(scoped.totals.opened).toBe(1); // yalnızca kural atamalı m2 Web'de
  });

  it('yalnızca Owner/Admin görür; geçersiz tarih aralığı reddedilir', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/analytics/quality')).expect(403);
    await owner.get(api('/analytics/quality?from=2026-10-10&to=2026-10-01')).expect(400);
    const empty = (await owner.get(api('/analytics/quality')).expect(200)).body as AnalyticsQuality;
    expect(empty.totals).toMatchObject({
      opened: 0,
      resolved: 0,
      openNow: 0,
      avgResolveDays: null,
    });
  });
});
