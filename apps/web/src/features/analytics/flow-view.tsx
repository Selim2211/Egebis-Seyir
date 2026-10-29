import type { AnalyticsFlow } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AXIS,
  DeltaPct,
  Empty,
  GRID,
  Panel,
  pointLabel,
  tooltipStyle,
  useFormatMetric,
} from './parts';

const BLUE = '#2563eb';
const AMBER = '#d97706';
const RED = '#dc2626';

function Card({
  label,
  value,
  sub,
  delta,
  testId,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
  testId: string;
  tone?: 'warn';
}) {
  return (
    <div
      className={cn(
        'glass glass-hover flex min-w-0 flex-col gap-1 p-3',
        tone === 'warn' &&
          'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10',
      )}
    >
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
      {delta}
    </div>
  );
}

/** Akış ve darboğaz: bitirme süresi, durumlarda bekleme, WIP ve yaşlanan işler (ADR-144). */
export function FlowView({ data }: { data: AnalyticsFlow }) {
  const { t } = useTranslation();
  const fmt = useFormatMetric();
  const grain = data.range.grain;
  const days = (v: number | null | undefined) =>
    v === null || v === undefined ? '—' : t('analytics.unit.days', { value: fmt('done', v) });
  const { totals, previous } = data;

  const trend = data.series.map((p) => ({
    label: pointLabel(p, grain),
    cycle: p.cycleDays,
    lead: p.leadDays,
  }));
  const wip = data.wip.series.map((p) => ({ label: formatShortDate(p.day), count: p.count }));
  const stale14 = data.aging.buckets
    .filter((b) => b.bucket === 'D30' || b.bucket === 'D30P')
    .reduce((n, b) => n + b.count, 0);
  const noHistory = totals.done > 0 && totals.withHistory === 0;
  const partial = totals.done > 0 && totals.withHistory > 0 && totals.withHistory < totals.done;

  return (
    <div className="flex flex-col gap-4" data-testid="flow-view">
      {(noHistory || partial) && (
        <p
          className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          role="status"
          data-testid="flow-coverage"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {noHistory
            ? t('analytics.flow.noHistory', { done: totals.done })
            : t('analytics.flow.partialHistory', { with: totals.withHistory, done: totals.done })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="flow-kpis">
        <Card
          testId="kpi-cycle"
          label={t('analytics.flow.cycle')}
          value={days(totals.cycleDays?.avg)}
          sub={
            totals.cycleDays
              ? t('analytics.flow.cycleSub', {
                  median: totals.cycleDays.median,
                  p85: totals.cycleDays.p85,
                })
              : t('analytics.flow.cycleNone')
          }
          delta={
            <DeltaPct
              value={totals.cycleDays?.avg ?? null}
              previous={previous.cycleDays?.avg ?? null}
              better="down"
            />
          }
        />
        <Card
          testId="kpi-lead"
          label={t('analytics.flow.lead')}
          value={days(totals.leadDays?.avg)}
          sub={
            totals.leadDays
              ? t('analytics.flow.cycleSub', {
                  median: totals.leadDays.median,
                  p85: totals.leadDays.p85,
                })
              : undefined
          }
          delta={
            <DeltaPct
              value={totals.leadDays?.avg ?? null}
              previous={previous.leadDays?.avg ?? null}
              better="down"
            />
          }
        />
        <Card
          testId="kpi-wip"
          label={t('analytics.flow.wip')}
          value={String(data.wip.current)}
          sub={
            data.wip.average === null
              ? t('analytics.flow.wipNoAvg')
              : t('analytics.flow.wipAvg', { value: fmt('done', data.wip.average) })
          }
        />
        <Card
          testId="kpi-stale"
          label={t('analytics.flow.stale')}
          value={String(stale14)}
          sub={t('analytics.flow.staleSub')}
          tone={stale14 > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={t('analytics.flow.trendTitle')} hint={t('analytics.flow.trendHint')}>
          <div className="h-60" data-testid="chart-flow-trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="cycle"
                  name={t('analytics.flow.cycle')}
                  stroke={BLUE}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="lead"
                  name={t('analytics.flow.lead')}
                  stroke={AMBER}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={t('analytics.flow.dwellTitle')} hint={t('analytics.flow.dwellHint')}>
          {data.dwell.length === 0 ? (
            <Empty text={t('analytics.flow.noDwell')} />
          ) : (
            <div
              style={{ height: Math.max(data.dwell.length * 40, 120) }}
              data-testid="chart-dwell"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.dwell}
                  layout="vertical"
                  margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={110}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'var(--muted)' }}
                    formatter={(v) => t('analytics.unit.days', { value: v })}
                  />
                  <Bar
                    dataKey="avgDays"
                    name={t('analytics.flow.avgWait')}
                    radius={[0, 4, 4, 0]}
                    label={{ position: 'right', fontSize: 11, fill: AXIS }}
                  >
                    {data.dwell.map((d, i) => (
                      <Cell key={d.status} fill={i === 0 && data.dwell.length > 1 ? RED : BLUE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title={t('analytics.flow.wipTitle')}
          hint={t('analytics.flow.wipHint', {
            tracked: data.wip.trackedItems,
            total: data.wip.totalItems,
          })}
          className="lg:col-span-2"
        >
          {data.wip.trackedItems === 0 ? (
            <Empty text={t('analytics.flow.noWipHistory')} />
          ) : (
            <div className="h-56" data-testid="chart-wip">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={wip} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="stepAfter"
                    dataKey="count"
                    name={t('analytics.flow.wip')}
                    stroke={BLUE}
                    fill={BLUE}
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title={t('analytics.flow.agingTitle')} hint={t('analytics.flow.agingHint')}>
          <div className="h-56" data-testid="chart-aging-flow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.aging.buckets.map((b) => ({
                  name: t(`analytics.flow.age.${b.bucket}`),
                  count: b.count,
                }))}
                margin={{ top: 14, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                <Bar
                  dataKey="count"
                  name={t('analytics.flow.items')}
                  radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fontSize: 11, fill: AXIS }}
                >
                  {['#16a34a', '#ca8a04', '#ea580c', RED].map((c) => (
                    <Cell key={c} fill={c} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title={t('analytics.flow.staleTitle')} hint={t('analytics.flow.staleHint')}>
        {data.aging.stale.length === 0 ? (
          <Empty text={t('analytics.flow.noStale')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-testid="stale-table">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('analytics.flow.col.item')}</th>
                  <th className="px-3 py-2 font-medium">{t('analytics.col.project')}</th>
                  <th className="px-3 py-2 font-medium">{t('analytics.flow.col.status')}</th>
                  <th className="px-3 py-2 font-medium">{t('analytics.flow.col.assignee')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.flow.col.days')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.aging.stale.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-accent/40 border-b last:border-0"
                    data-testid="stale-row"
                  >
                    <td className="py-2 pr-3">
                      <span className="text-muted-foreground mr-2 font-mono text-xs">{s.key}</span>
                      <Link
                        to="/items/$key"
                        params={{ key: s.key }}
                        className="font-medium hover:underline"
                      >
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: s.space.color }}
                          aria-hidden
                        />
                        {s.space.name}
                      </span>
                    </td>
                    <td className="px-3 py-2">{s.status}</td>
                    <td className="px-3 py-2">
                      {s.assignee ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        s.days > 14 && 'font-semibold text-red-700 dark:text-red-300',
                      )}
                    >
                      {s.days}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
