import type { AnalyticsQuality, BugSeverity } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { AXIS, DeltaPct, Empty, GRID, Panel, pointLabel, tooltipStyle } from './parts';

const GREEN = '#16a34a';
const RED = '#dc2626';
const AMBER = '#d97706';
const SEVERITY_COLOR: Record<BugSeverity, string> = {
  CRITICAL: '#b91c1c',
  MAJOR: '#ea580c',
  MINOR: '#ca8a04',
  TRIVIAL: '#94a3b8',
};

const num = (v: number | null, digits = 1) =>
  v === null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: digits });

function Card({
  label,
  value,
  sub,
  delta,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
      {delta}
    </div>
  );
}

/** Kalite ve destek: Bug eğrisi, çözüm süresi, firma ve atama doğruluğu (ADR-147). */
export function QualityView({ data }: { data: AnalyticsQuality }) {
  const { t } = useTranslation();
  const grain = data.range.grain === 'sprint' ? 'week' : data.range.grain;
  const { totals, previous } = data;
  const days = (v: number | null) =>
    v === null ? '—' : t('analytics.unit.days', { value: num(v) });

  const series = data.series.map((p) => ({
    label: pointLabel(p, grain),
    opened: p.opened,
    resolved: p.resolved,
    avgResolveDays: p.avgResolveDays,
  }));
  const severity = data.bySeverity.map((s) => ({
    ...s,
    name: t(`severity.${s.severity}`),
  }));
  const hasBugs = totals.opened > 0 || totals.resolved > 0 || totals.openNow > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="quality-view">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="quality-kpis">
        <Card
          testId="kpi-bugs-opened"
          label={t('analytics.quality.opened')}
          value={String(totals.opened)}
          delta={<DeltaPct value={totals.opened} previous={previous.opened} better="down" />}
        />
        <Card
          testId="kpi-bugs-resolved"
          label={t('analytics.quality.resolved')}
          value={String(totals.resolved)}
          delta={<DeltaPct value={totals.resolved} previous={previous.resolved} better="up" />}
        />
        <Card
          testId="kpi-resolve-days"
          label={t('analytics.quality.resolveTime')}
          value={days(totals.avgResolveDays)}
          sub={
            totals.medianResolveDays === null
              ? undefined
              : t('analytics.quality.median', { value: num(totals.medianResolveDays) })
          }
          delta={
            <DeltaPct
              value={totals.avgResolveDays}
              previous={previous.avgResolveDays}
              better="down"
            />
          }
        />
        <Card
          testId="kpi-bugs-open"
          label={t('analytics.quality.openNow')}
          value={String(totals.openNow)}
          sub={t('analytics.quality.openNowSub')}
        />
        <Card
          testId="kpi-bug-share"
          label={t('analytics.quality.share')}
          value={totals.bugSharePct === null ? '—' : `%${totals.bugSharePct}`}
          sub={t('analytics.quality.shareSub')}
        />
      </div>

      {!hasBugs ? (
        <Panel title={t('analytics.quality.title')}>
          <Empty text={t('analytics.quality.none')} />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t('analytics.quality.flowTitle')} hint={t('analytics.quality.flowHint')}>
              <div className="h-60" data-testid="chart-bug-curve">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <YAxis
                      yAxisId="n"
                      allowDecimals={false}
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="d"
                      orientation="right"
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      yAxisId="n"
                      dataKey="opened"
                      name={t('analytics.quality.opened')}
                      fill={RED}
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      yAxisId="n"
                      dataKey="resolved"
                      name={t('analytics.quality.resolved')}
                      fill={GREEN}
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="d"
                      type="monotone"
                      dataKey="avgResolveDays"
                      name={t('analytics.quality.resolveTime')}
                      stroke={AMBER}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel
              title={t('analytics.quality.severityTitle')}
              hint={t('analytics.quality.severityHint')}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="severity-table">
                  <thead className="text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="py-2 pr-3 font-medium">
                        {t('analytics.quality.col.severity')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.opened')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.resolved')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.col.avg')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.openNow')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.col.oldest')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {severity.map((s) => (
                      <tr key={s.severity} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2 font-medium">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: SEVERITY_COLOR[s.severity] }}
                              aria-hidden
                            />
                            {s.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.opened}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.resolved}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {days(s.avgResolveDays)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.openNow}</td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            s.oldestOpenDays !== null &&
                              s.oldestOpenDays > 7 &&
                              (s.severity === 'CRITICAL' || s.severity === 'MAJOR') &&
                              'font-semibold text-red-700 dark:text-red-300',
                          )}
                        >
                          {s.oldestOpenDays === null
                            ? '—'
                            : t('analytics.unit.days', { value: s.oldestOpenDays })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={t('analytics.quality.projectTitle')}
              hint={t('analytics.quality.projectHint')}
            >
              {data.byProject.length === 0 ? (
                <Empty text={t('analytics.quality.none')} />
              ) : (
                <div
                  style={{ height: Math.max(data.byProject.length * 44, 120) }}
                  data-testid="chart-quality-projects"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.byProject.map((p) => ({
                        name: p.space.name,
                        opened: p.opened,
                        openNow: p.openNow,
                      }))}
                      layout="vertical"
                      margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                    >
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fill: AXIS, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="opened"
                        name={t('analytics.quality.opened')}
                        fill={RED}
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="openNow"
                        name={t('analytics.quality.openNow')}
                        fill={AMBER}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel
              title={t('analytics.quality.routingTitle')}
              hint={t('analytics.quality.routingHint')}
            >
              <table className="w-full text-left text-sm" data-testid="routing-table">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t('analytics.quality.col.method')}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.quality.col.bugs')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.quality.col.moved')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.quality.col.movedPct')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.routing.map((r) => (
                    <tr
                      key={r.method}
                      className="border-b last:border-0"
                      data-testid={`routing-${r.method}`}
                    >
                      <td className="py-2 pr-3 font-medium">
                        {t(`adminList.route.${r.method === 'unrouted' ? 'none' : r.method}`)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.bugs}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.moved}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums',
                          r.method !== 'unrouted' &&
                            r.movedPct !== null &&
                            r.movedPct >= 30 &&
                            'font-semibold text-red-700 dark:text-red-300',
                        )}
                      >
                        {r.movedPct === null ? '—' : `%${r.movedPct}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground mt-2 text-xs">
                {t('analytics.quality.routingNote')}
              </p>
            </Panel>
          </div>

          <Panel
            title={t('analytics.quality.companyTitle')}
            hint={t('analytics.quality.companyHint')}
          >
            {data.byCompany.length === 0 ? (
              <Empty text={t('analytics.quality.noCompany')} />
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full min-w-[40rem] text-left text-sm"
                  data-testid="company-table"
                >
                  <thead className="text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="py-2 pr-3 font-medium">
                        {t('analytics.quality.col.company')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.col.bugs')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.resolved')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.openNow')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.col.avg')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.quality.col.firstReply')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCompany.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-accent/40 border-b last:border-0"
                        data-testid="company-row"
                      >
                        <td className="py-2 pr-3">
                          <Link
                            to="/admin-list"
                            search={{ kind: 'bugs-company', value: c.id }}
                            className="font-medium hover:underline"
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.bugs}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.resolved}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.openNow}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {days(c.avgResolveDays)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.avgFirstResponseHours === null
                            ? '—'
                            : c.avgFirstResponseHours < 1
                              ? t('admin.minutes', {
                                  value: Math.max(1, Math.round(c.avgFirstResponseHours * 60)),
                                })
                              : t('analytics.unit.hours', { value: num(c.avgFirstResponseHours) })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title={t('analytics.quality.criticalTitle')}
            hint={t('analytics.quality.criticalHint')}
          >
            {data.critical.length === 0 ? (
              <Empty text={t('analytics.quality.noCritical')} />
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full min-w-[36rem] text-left text-sm"
                  data-testid="critical-table"
                >
                  <thead className="text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Bug</th>
                      <th className="px-3 py-2 font-medium">
                        {t('analytics.quality.col.severity')}
                      </th>
                      <th className="px-3 py-2 font-medium">{t('analytics.col.project')}</th>
                      <th className="px-3 py-2 font-medium">{t('analytics.flow.col.assignee')}</th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.flow.col.days')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.critical.map((b) => (
                      <tr
                        key={b.id}
                        className="hover:bg-accent/40 border-b last:border-0"
                        data-testid="critical-row"
                      >
                        <td className="py-2 pr-3">
                          <span className="text-muted-foreground mr-2 font-mono text-xs">
                            {b.key}
                          </span>
                          <Link
                            to="/items/$key"
                            params={{ key: b.key }}
                            className="font-medium hover:underline"
                          >
                            {b.title}
                          </Link>
                        </td>
                        <td className="px-3 py-2" style={{ color: SEVERITY_COLOR[b.severity] }}>
                          {t(`severity.${b.severity}`)}
                        </td>
                        <td className="px-3 py-2">{b.space.name}</td>
                        <td className="px-3 py-2">
                          {b.assignee ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right tabular-nums',
                            b.days > 7 && 'font-semibold text-red-700 dark:text-red-300',
                          )}
                        >
                          {b.days}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
