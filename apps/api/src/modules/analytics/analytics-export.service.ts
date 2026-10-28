import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  type AnalyticsExportQuery,
  type AnalyticsMetrics,
  type AnalyticsRisk,
} from '@scrum/shared';
import ExcelJS from 'exceljs';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { AnalyticsCapacityService } from './analytics-capacity.service';
import { AnalyticsFlowService } from './analytics-flow.service';
import { AnalyticsForecastService } from './analytics-forecast.service';
import { AnalyticsQualityService } from './analytics-quality.service';
import { AnalyticsSprintService } from './analytics-sprint.service';
import { AnalyticsService } from './analytics.service';

type Cell = string | number | null;

/** Ölçüt sütunları (kişi/Proje/karşılaştırma tablolarında ortak). */
const METRIC_COLUMNS = [
  'Biten iş',
  'Puan',
  'Harcanan saat',
  'Ort. bitirme süresi (gün)',
  'Termine uyum (%)',
  'Çözülen Bug',
  'Yeniden açılan',
  'Tahmini saat',
];
const metricCells = (m: AnalyticsMetrics): Cell[] => [
  m.done,
  m.points,
  m.hours,
  m.avgDays,
  m.onTimePct,
  m.bugsFixed,
  m.reopened,
  m.estimateHours,
];
const SEVERITY_TR: Record<string, string> = {
  CRITICAL: 'Kritik',
  MAJOR: 'Önemli',
  MINOR: 'Küçük',
  TRIVIAL: 'Önemsiz',
};
const ROUTE_TR: Record<string, string> = {
  rule: 'Kural',
  company: 'Firma varsayılanı',
  ai: 'Yapay zeka',
  unrouted: 'Belirsiz',
};
const STATE_TR: Record<string, string> = {
  ahead: 'Önde',
  on_track: 'Yolunda',
  at_risk: 'Risk altında',
  behind: 'Geride',
};
const RISK_TR: Record<AnalyticsRisk['kind'], string> = {
  sprint_behind: 'Sprint geride',
  critical_waiting: 'Bekleyen Kritik/Önemli Bug',
  person_slowing: 'Kişide yavaşlama',
  project_slowing: 'Projede yavaşlama',
  stuck_items: 'Takılı iş',
  unassigned_bugs: 'Atanmamış Bug',
};
const LEVEL_TR = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as const;

/**
 * Analiz ekranlarının Excel dışa aktarması (ADR-149). Her sekme kendi sayfalarıyla iner; değerler ekrandakiyle
 * aynı servislerden gelir. Kişi dışındaki sekmeler yalnızca Owner/Admin'e açıktır.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly flow: AnalyticsFlowService,
    private readonly sprints: AnalyticsSprintService,
    private readonly capacity: AnalyticsCapacityService,
    private readonly quality: AnalyticsQualityService,
    private readonly forecast: AnalyticsForecastService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private sheet(wb: ExcelJS.Workbook, name: string, columns: string[], rows: Cell[][]) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.addRow(columns).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of rows) ws.addRow(r);
    ws.columns.forEach((col, i) => {
      const longest = Math.max(
        columns[i]?.length ?? 0,
        ...rows.map((r) => String(r[i] ?? '').length),
      );
      col.width = Math.min(60, Math.max(10, longest + 2));
    });
  }

  async build(q: AnalyticsExportQuery): Promise<{ filename: string; buffer: Buffer }> {
    const tier = this.cls.get('workspaceRole');
    if (q.view !== 'person' && tier !== 'OWNER' && tier !== 'ADMIN') throw new ForbiddenException();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Egebis Seyir';
    const filters = { from: q.from, to: q.to, grain: q.grain, spaceId: q.spaceId };
    let range = '';

    switch (q.view) {
      case 'person': {
        const userId = q.userId ?? this.cls.get('userId');
        if (!userId) throw new BadRequestException('Kişi seçilmeli');
        const d = await this.analytics.person(userId, filters);
        range = `${d.range.from}_${d.range.to}`;
        this.sheet(
          wb,
          'Özet',
          ['Ölçüt', 'Bu dönem', 'Önceki dönem'],
          [
            ['Kişi', d.user.name, null],
            ...METRIC_COLUMNS.map((c, i) => [
              c,
              metricCells(d.totals)[i]!,
              metricCells(d.previous)[i]!,
            ]),
          ],
        );
        this.sheet(
          wb,
          'Zaman serisi',
          ['Dönem', ...METRIC_COLUMNS],
          d.series.map((p) => [p.label, ...metricCells(p)]),
        );
        this.sheet(
          wb,
          'Projeler',
          ['Proje', ...METRIC_COLUMNS],
          d.byProject.map((p) => [p.space.name, ...metricCells(p)]),
        );
        this.sheet(
          wb,
          'Sprintler',
          ['Sprint', 'Proje', ...METRIC_COLUMNS],
          d.bySprint.map((s) => [
            s.sprint?.name ?? 'Sprint dışı',
            s.sprint?.project ?? null,
            ...metricCells(s),
          ]),
        );
        this.sheet(
          wb,
          'İşler',
          ['Sprint', 'İş', 'Başlık', 'Tür', 'Puan', 'Tamamlanma'],
          d.bySprint.flatMap((s) =>
            s.items.map((i) => [
              s.sprint?.name ?? 'Sprint dışı',
              i.key,
              i.title,
              i.type,
              i.points,
              i.completedAt,
            ]),
          ),
        );
        break;
      }
      case 'project': {
        if (!q.projectId) throw new BadRequestException('Proje seçilmeli');
        const d = await this.analytics.project(q.projectId, { ...filters, spaceId: undefined });
        range = `${d.range.from}_${d.range.to}`;
        this.sheet(
          wb,
          'Özet',
          ['Ölçüt', 'Bu dönem', 'Önceki dönem'],
          [
            ['Proje', d.space.name, null],
            ...METRIC_COLUMNS.map((c, i) => [
              c,
              metricCells(d.totals)[i]!,
              metricCells(d.previous)[i]!,
            ]),
          ],
        );
        this.sheet(
          wb,
          'Zaman serisi',
          ['Dönem', ...METRIC_COLUMNS, 'Açılan Bug'],
          d.series.map((p) => [p.label, ...metricCells(p), p.bugsOpened]),
        );
        this.sheet(
          wb,
          'Kişiler',
          ['Kişi', ...METRIC_COLUMNS],
          d.byPerson.map((p) => [p.user.name, ...metricCells(p)]),
        );
        this.sheet(
          wb,
          'Sprint hızı',
          ['Sprint', 'Taahhüt', 'Biten', 'Tamamlanma'],
          d.velocity.map((v) => [v.name, v.committed, v.completed, v.completedAt]),
        );
        break;
      }
      case 'flow': {
        const d = await this.flow.flow(filters);
        range = `${d.range.from}_${d.range.to}`;
        const stat = (s: { avg: number; median: number; p85: number } | null) =>
          s ? [s.avg, s.median, s.p85] : [null, null, null];
        this.sheet(
          wb,
          'Özet',
          ['Ölçüt', 'Ortalama', 'Medyan', '%85'],
          [
            ['Bitirme süresi (gün)', ...stat(d.totals.cycleDays)],
            ['Toplam süre (gün)', ...stat(d.totals.leadDays)],
            ['Önceki dönem bitirme süresi (gün)', ...stat(d.previous.cycleDays)],
            ['Önceki dönem toplam süre (gün)', ...stat(d.previous.leadDays)],
            ['Biten iş', d.totals.done, null, null],
            ['Geçmişi kayıtlı biten iş', d.totals.withHistory, null, null],
            ['Şu an yapılan iş (WIP)', d.wip.current, null, null],
          ],
        );
        this.sheet(
          wb,
          'Zaman serisi',
          ['Dönem', 'Biten iş', 'Bitirme süresi (gün)', 'Toplam süre (gün)'],
          d.series.map((p) => [p.label, p.done, p.cycleDays, p.leadDays]),
        );
        this.sheet(
          wb,
          'Durumlarda bekleme',
          ['Durum', 'Kategori', 'Ort. gün', 'İş sayısı'],
          d.dwell.map((x) => [x.status, x.category, x.avgDays, x.items]),
        );
        this.sheet(
          wb,
          'WIP',
          ['Gün', 'WIP'],
          d.wip.series.map((p) => [p.day, p.count]),
        );
        this.sheet(
          wb,
          'Hareketsiz işler',
          ['İş', 'Başlık', 'Proje', 'Durum', 'Atanan', 'Gün'],
          d.aging.stale.map((s) => [s.key, s.title, s.space.name, s.status, s.assignee, s.days]),
        );
        break;
      }
      case 'sprint': {
        const d = await this.sprints.sprints(filters);
        range = `${d.range.from}_${d.range.to}`;
        this.sheet(
          wb,
          'Sprintler',
          [
            'Sprint',
            'Proje',
            'Durum',
            'Başlangıç',
            'Bitiş',
            'Taahhüt',
            'Biten',
            'Taahhüt tutturma (%)',
            'Eklenen',
            'Çıkarılan',
            'Kapsam değişimi (%)',
            'Devir (iş)',
            'Devir (puan)',
            'Devir (%)',
            'Devralınan (iş)',
            'Devralınan (puan)',
          ],
          d.sprints.map((s) => [
            s.name,
            s.project.name,
            s.status === 'ACTIVE' ? 'Aktif' : 'Tamamlandı',
            s.startDate,
            s.endDate,
            s.committed,
            s.completed,
            s.commitmentPct,
            s.scopeAdded,
            s.scopeRemoved,
            s.scopeChangePct,
            s.carryOverItems,
            s.carryOverPoints,
            s.carryOverPct,
            s.carriedInItems,
            s.carriedInPoints,
          ]),
        );
        this.sheet(
          wb,
          'Özet',
          ['Ölçüt', 'Değer'],
          [
            ['Tamamlanan sprint', d.summary.completedCount],
            ['Ortalama hız (puan)', d.summary.avgVelocity],
            ['Ort. taahhüt tutturma (%)', d.summary.avgCommitmentPct],
            ['Ort. kapsam değişimi (%)', d.summary.avgScopeChangePct],
            ['Ort. devir (%)', d.summary.avgCarryOverPct],
          ],
        );
        break;
      }
      case 'capacity': {
        const d = await this.capacity.capacity({ ...filters, weeklyHours: q.weeklyHours });
        range = `${d.range.from}_${d.range.to}`;
        this.sheet(
          wb,
          'Kişiler',
          [
            'Kişi',
            'Durum',
            'Açık iş',
            'Açık puan',
            'Geciken',
            'Kalan tahmin (saat)',
            'Tahminsiz açık iş',
            'Kayıtlı saat',
            'Doluluk (%)',
            'Kayıt günü',
            'Kayıt günü (%)',
            'Kayıtlı günde ort. saat',
            'Pzt',
            'Sal',
            'Çar',
            'Per',
            'Cum',
            'Cmt',
            'Paz',
          ],
          d.people.map((p) => [
            p.user.name,
            { over: 'Aşırı yüklü', ok: 'Normal', idle: 'Boşta' }[p.status],
            p.open.items,
            p.open.points,
            p.open.overdue,
            p.open.remainingHours,
            p.open.unestimated,
            p.logged.hours,
            p.logged.utilizationPct,
            p.logged.loggingDays,
            p.logged.loggingPct,
            p.logged.avgPerLoggedDay,
            ...p.byWeekday,
          ]),
        );
        this.sheet(
          wb,
          'Haftalık ekip',
          ['Hafta başı', 'Kayıtlı saat', 'Kapasite (saat)'],
          d.weekly.map((w) => [w.weekStart, w.hours, w.capacityHours]),
        );
        this.sheet(
          wb,
          'Özet',
          ['Ölçüt', 'Değer'],
          [
            ['Haftalık çalışma saati', d.weeklyHours],
            ['Hafta içi gün', d.workdays],
            ['Kapasite (saat)', d.team.capacityHours],
            ['Kayıtlı saat', d.team.loggedHours],
            ['Doluluk (%)', d.team.utilizationPct],
            ['Ort. kayıt günü (%)', d.team.avgLoggingPct],
            ['Kalan tahmin (saat)', d.team.remainingHours],
            ['Aşırı yüklü', d.team.overloaded],
            ['Boşta', d.team.idle],
          ],
        );
        break;
      }
      case 'quality': {
        const d = await this.quality.quality(filters);
        range = `${d.range.from}_${d.range.to}`;
        this.sheet(
          wb,
          'Özet',
          ['Ölçüt', 'Bu dönem', 'Önceki dönem'],
          [
            ['Açılan Bug', d.totals.opened, d.previous.opened],
            ['Çözülen Bug', d.totals.resolved, d.previous.resolved],
            ['Ort. çözüm (gün)', d.totals.avgResolveDays, d.previous.avgResolveDays],
            ['Medyan çözüm (gün)', d.totals.medianResolveDays, null],
            ['Şu an açık', d.totals.openNow, null],
            ['Bug payı (%)', d.totals.bugSharePct, null],
          ],
        );
        this.sheet(
          wb,
          'Zaman serisi',
          ['Dönem', 'Açılan', 'Çözülen', 'Ort. çözüm (gün)'],
          d.series.map((p) => [p.label, p.opened, p.resolved, p.avgResolveDays]),
        );
        this.sheet(
          wb,
          'Önem derecesi',
          ['Önem', 'Açılan', 'Çözülen', 'Ort. çözüm (gün)', 'Şu an açık', 'En eski açık (gün)'],
          d.bySeverity.map((s) => [
            SEVERITY_TR[s.severity]!,
            s.opened,
            s.resolved,
            s.avgResolveDays,
            s.openNow,
            s.oldestOpenDays,
          ]),
        );
        this.sheet(
          wb,
          'Projeler',
          ['Proje', 'Açılan', 'Çözülen', 'Şu an açık', 'Ort. çözüm (gün)', 'Bug payı (%)'],
          d.byProject.map((p) => [
            p.space.name,
            p.opened,
            p.resolved,
            p.openNow,
            p.avgResolveDays,
            p.bugSharePct,
          ]),
        );
        this.sheet(
          wb,
          'Firmalar',
          ['Firma', 'Bug', 'Çözülen', 'Şu an açık', 'Ort. çözüm (gün)', 'İlk yanıt (saat)'],
          d.byCompany.map((c) => [
            c.name,
            c.bugs,
            c.resolved,
            c.openNow,
            c.avgResolveDays,
            c.avgFirstResponseHours,
          ]),
        );
        this.sheet(
          wb,
          'Atama doğruluğu',
          ['Yöntem', 'Bug', 'Taşınan', 'Taşınma (%)'],
          d.routing.map((r) => [ROUTE_TR[r.method]!, r.bugs, r.moved, r.movedPct]),
        );
        this.sheet(
          wb,
          'Bekleyen Bug’lar',
          ['İş', 'Başlık', 'Önem', 'Proje', 'Atanan', 'Gün'],
          d.critical.map((b) => [
            b.key,
            b.title,
            SEVERITY_TR[b.severity]!,
            b.space.name,
            b.assignee,
            b.days,
          ]),
        );
        break;
      }
      case 'forecast': {
        const d = await this.forecast.forecast();
        range = d.generatedAt.slice(0, 10);
        this.sheet(
          wb,
          'Uyarılar',
          ['Seviye', 'Tür', 'Konu', 'Değer', 'Önceki'],
          d.risks.map((r) => [LEVEL_TR[r.level], RISK_TR[r.kind], r.subject, r.value, r.previous]),
        );
        this.sheet(
          wb,
          'Aktif sprintler',
          [
            'Sprint',
            'Proje',
            'Durum',
            'Toplam puan',
            'Biten',
            'Kalan',
            'Günlük hız',
            'Bitişe kalan gün',
            'Tahmini düzey (%)',
            'Tahmini bitiş',
          ],
          d.sprints.map((s) => [
            s.name,
            s.project.name,
            STATE_TR[s.state]!,
            s.totalPoints,
            s.donePoints,
            s.remainingPoints,
            s.ratePerDay,
            s.daysLeft,
            s.projectedPct,
            s.projectedFinish,
          ]),
        );
        this.sheet(
          wb,
          'Epic’ler',
          [
            'Epic',
            'Başlık',
            'Proje',
            'Toplam puan',
            'Biten',
            'Kalan',
            'Açık iş',
            'Proje hızı (puan/hafta)',
            'Tahmini hafta',
            'Tahmini bitiş',
          ],
          d.epics.map((e) => [
            e.key,
            e.title,
            e.project.name,
            e.totalPoints,
            e.donePoints,
            e.remainingPoints,
            e.openItems,
            e.ratePerWeek,
            e.weeksLeft,
            e.projectedFinish,
          ]),
        );
        break;
      }
      case 'compare': {
        const d = await this.analytics.compare({ ...filters, userIds: q.userIds });
        range = `${d.range.from}_${d.range.to}`;
        this.sheet(
          wb,
          'Karşılaştırma',
          ['Ölçüt', ...d.users.map((u) => u.user.name)],
          METRIC_COLUMNS.map((c, i) => [c, ...d.users.map((u) => metricCells(u.totals)[i]!)]),
        );
        this.sheet(
          wb,
          'Zaman serisi (puan)',
          ['Dönem', ...d.users.map((u) => u.user.name)],
          d.buckets.map((b, i) => [b.label, ...d.users.map((u) => u.series[i]?.points ?? 0)]),
        );
        break;
      }
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { filename: `analiz-${q.view}-${range}.xlsx`, buffer };
  }
}
