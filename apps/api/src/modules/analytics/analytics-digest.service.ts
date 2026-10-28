import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  WORKSPACE_PERMISSIONS as W,
  type AnalyticsDigest,
  type AnalyticsDigestTest,
  type AnalyticsRisk,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { escapeHtml, type MailMessage } from '../../infra/mail/templates';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { AppSettingsService } from '../../infra/settings/app-settings.service';
import { AnalyticsCapacityService } from './analytics-capacity.service';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsForecastService } from './analytics-forecast.service';
import { AnalyticsQualityService } from './analytics-quality.service';
import { addDays, dayKey, weekStart } from './analytics-util';

const DIGEST_JOB = 'analytics.digest';
/** Gönderim saati (Europe/Istanbul, Pazartesi). */
const SEND_HOUR = 9;

const num = (v: number | null, digits = 1) =>
  v === null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: digits });

/** Uyarı satırı: arayüzdekiyle aynı dil; kişiyi etiketlemez, değişimi söyler. */
function riskLine(r: AnalyticsRisk): string {
  switch (r.kind) {
    case 'sprint_behind':
      return `${r.subject} planın gerisinde: bu hızla sprintin yaklaşık %${r.value}'i bitecek.`;
    case 'critical_waiting':
      return `"${r.subject}" ${r.value} gündür açık (Kritik/Önemli Bug).`;
    case 'person_slowing':
      return `${r.subject}: son 14 günde ${r.value} iş bitti (önceki 14 günde ${r.previous ?? 0}).`;
    case 'project_slowing':
      return `${r.subject} projesinde son 14 günde ${r.value} iş bitti (önceki 14 günde ${r.previous ?? 0}).`;
    case 'stuck_items':
      return `${r.value} iş "Yapılıyor"da 14 günden uzun süredir hareketsiz.`;
    case 'unassigned_bugs':
      return `${r.value} Bug 3 günden uzun süredir kimseye atanmamış.`;
  }
}

/**
 * Haftalık özet e-postası (ADR-149). Her Pazartesi 09:00'dan sonra (Europe/Istanbul) ilk çalışmada, ayarı açık
 * her çalışma alanının Owner/Admin'lerine geçen haftanın (Pzt–Paz) özeti gider; aynı hafta için bir kez.
 * Zamanlayıcı 15 dakikada bir bakar; sunucu o saatte kapalıysa gün içinde ilk açılışta gönderilir.
 */
@Injectable()
export class AnalyticsDigestService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly queue: QueueService,
    private readonly mail: MailService,
    private readonly appSettings: AppSettingsService,
    private readonly quality: AnalyticsQualityService,
    private readonly flow: AnalyticsFlowService,
    private readonly capacity: AnalyticsCapacityService,
    private readonly forecast: AnalyticsForecastService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.schedule(DIGEST_JOB, '*/15 * * * *', async () => {
      await this.tick();
    });
  }

  private recipients(workspaceId: string) {
    return this.prisma.membership.findMany({
      where: { workspaceId, role: { permissions: { has: W.WORKSPACE_SETTINGS } } },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  /** Bir sonraki Pazartesi 09:00 (Istanbul); bu hafta henüz gönderilmediyse ve saat geçtiyse "şimdi". */
  private nextSend(now: Date, lastWeek: string | null): Date {
    const monday = weekStart(dayKey(now));
    const at = (day: string) =>
      new Date(`${day}T${String(SEND_HOUR).padStart(2, '0')}:00:00+03:00`);
    const slot = at(monday);
    if (now >= slot) {
      const sentThisWeek = lastWeek !== null && lastWeek >= monday;
      return sentThisWeek ? at(addDays(monday, 7)) : now;
    }
    return slot;
  }

  async get(workspaceId: string, now = new Date()): Promise<AnalyticsDigest> {
    const row = await this.prisma.analyticsSettings.findUnique({ where: { workspaceId } });
    const enabled = row?.digestEnabled ?? false;
    const lastWeek = row?.digestLastWeek ? row.digestLastWeek.toISOString().slice(0, 10) : null;
    return {
      enabled,
      lastSentAt: row?.digestLastSentAt?.toISOString() ?? null,
      nextSendAt: enabled ? this.nextSend(now, lastWeek).toISOString() : null,
      recipients: (await this.recipients(workspaceId)).length,
    };
  }

  async set(workspaceId: string, enabled: boolean): Promise<AnalyticsDigest> {
    await this.prisma.analyticsSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, digestEnabled: enabled },
      update: { digestEnabled: enabled },
    });
    return this.get(workspaceId);
  }

  /** Bu çalışma alanı için geçen haftanın özetini kurar (kişi bağlamı: Owner yetkisiyle, yalnızca okuma). */
  async compose(workspaceId: string, now = new Date()): Promise<Omit<MailMessage, 'to'>> {
    const monday = weekStart(dayKey(now));
    const from = addDays(monday, -7);
    const to = addDays(monday, -1);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true },
    });
    const owner = (await this.recipients(workspaceId))[0]?.user.id ?? '';
    const data = await this.cls.run(async () => {
      this.cls.set('workspaceId', workspaceId);
      this.cls.set('userId', owner);
      this.cls.set('workspaceRole', 'OWNER');
      const q = { from, to, grain: 'week' as const };
      return {
        quality: await this.quality.quality(q, now),
        flow: await this.flow.flow(q, now),
        capacity: await this.capacity.capacity({ ...q, weeklyHours: 40 }, now),
        forecast: await this.forecast.forecast(now),
      };
    });
    const url = `${await this.appSettings.publicUrl()}/analytics`;
    const { quality: ql, flow, capacity, forecast } = data;

    const lines = [
      `Geçen hafta (${from} – ${to})`,
      `• Biten iş: ${flow.totals.done} (önceki hafta: ${flow.previous.done})`,
      `• Açılan Bug: ${ql.totals.opened} · Çözülen Bug: ${ql.totals.resolved} · Ort. çözüm: ${
        ql.totals.avgResolveDays === null ? '—' : `${num(ql.totals.avgResolveDays)} gün`
      } · Şu an açık: ${ql.totals.openNow}`,
      `• Ekip doluluğu: ${capacity.team.utilizationPct === null ? '—' : `%${capacity.team.utilizationPct}`} · Zaman kaydı oranı: ${
        capacity.team.avgLoggingPct === null ? '—' : `%${capacity.team.avgLoggingPct}`
      }`,
    ];
    const risks = forecast.risks.slice(0, 5).map(riskLine);
    const stateText = {
      ahead: 'Önde',
      on_track: 'Yolunda',
      at_risk: 'Risk altında',
      behind: 'Geride',
    };
    const sprints = forecast.sprints.map(
      (s) =>
        `${s.name} · ${s.project.name}: ${stateText[s.state]} (tahmini bitiş düzeyi %${s.projectedPct ?? 0})`,
    );
    const sections: Array<{ title: string; items: string[] }> = [
      { title: lines[0]!, items: lines.slice(1).map((l) => l.replace(/^• /, '')) },
      ...(risks.length > 0
        ? [{ title: `Dikkat edilmesi gerekenler (${forecast.risks.length})`, items: risks }]
        : []),
      ...(sprints.length > 0 ? [{ title: 'Aktif sprintler', items: sprints }] : []),
    ];
    const subject = `Haftalık özet — ${workspace.name} · ${from} – ${to}`;
    const text = [
      subject,
      '',
      ...sections.flatMap((s) => [s.title, ...s.items.map((i) => `• ${i}`), '']),
      `Ayrıntı: ${url}`,
      'Bu özeti Analiz sayfasından kapatabilirsin.',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;max-width:640px">
<h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
${sections
  .map(
    (s) =>
      `<h3 style="margin:16px 0 6px;font-size:15px">${escapeHtml(s.title)}</h3><ul style="margin:0;padding-left:20px">${s.items
        .map((i) => `<li style="margin:3px 0">${escapeHtml(i)}</li>`)
        .join('')}</ul>`,
  )
  .join('\n')}
<p style="margin-top:18px"><a href="${escapeHtml(url)}">Analiz sayfasını aç</a></p>
<p style="color:#6b7280;font-size:12px">Bu özeti Analiz sayfasından kapatabilirsin.</p>
</div>`;
    return { subject, text, html };
  }

  /** "Kendime test gönder": özet yalnızca isteği yapana gider; gönderim hatası olduğu gibi döner. */
  async sendTest(workspaceId: string, userId: string): Promise<AnalyticsDigestTest> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const message = await this.compose(workspaceId);
    const outcome = await this.mail.sendTest({ ...message, to: user.email });
    if (!outcome.ok) throw new BadRequestException({ code: outcome.code, detail: outcome.detail });
    return { to: user.email };
  }

  /** Zamanlayıcı: Pazartesi 09:00'dan sonra, bu hafta özeti gönderilmemiş açık çalışma alanlarına gönderir. */
  async tick(now = new Date()): Promise<number> {
    const today = dayKey(now);
    const monday = weekStart(today);
    const hour = Number(
      now.toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }),
    );
    if (today !== monday || hour < SEND_HOUR) return 0;

    const rows = await this.prisma.analyticsSettings.findMany({ where: { digestEnabled: true } });
    let sent = 0;
    for (const row of rows) {
      const lastWeek = row.digestLastWeek ? row.digestLastWeek.toISOString().slice(0, 10) : null;
      if (lastWeek !== null && lastWeek >= monday) continue;
      try {
        const message = await this.compose(row.workspaceId, now);
        for (const { user } of await this.recipients(row.workspaceId)) {
          await this.mail.send({ ...message, to: user.email });
          sent += 1;
        }
        await this.prisma.analyticsSettings.update({
          where: { workspaceId: row.workspaceId },
          data: { digestLastWeek: new Date(`${monday}T00:00:00Z`), digestLastSentAt: now },
        });
      } catch (error) {
        this.logger.warn(
          `Haftalık özet gönderilemedi (${row.workspaceId}): ${(error as Error).message}`,
        );
      }
    }
    return sent;
  }
}
