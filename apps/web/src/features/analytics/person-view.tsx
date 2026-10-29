import type { AnalyticsMetric, AnalyticsPeople, AnalyticsPerson } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NativeSelect } from '@/components/form';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/user-avatar';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  AXIS,
  Empty,
  GRID,
  KpiCards,
  METRIC_META,
  Panel,
  pointLabel,
  pointValue,
  tooltipStyle,
  useFormatMetric,
} from './parts';

/** Kişi analizi: kutucuklar, eğri, projelere dağılım, sprint tablosu, tahmin–gerçekleşen. */
export function PersonView({
  data,
  people,
  onUser,
  metric,
  onMetric,
}: {
  data: AnalyticsPerson;
  /** Yalnızca yönetici kişi seçebilir; üyede null. */
  people: AnalyticsPeople['people'] | null;
  onUser: (userId: string) => void;
  metric: AnalyticsMetric;
  onMetric: (m: AnalyticsMetric) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatMetric();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const grain = data.range.grain;
  const chart = data.series.map((p) => ({
    label: pointLabel(p, grain),
    value: pointValue(p, metric),
  }));
  const projects = data.byProject.map((p) => ({
    name: p.space.name,
    done: p.done,
    points: p.points,
  }));
  const est = [
    { name: t('analytics.estimate'), value: data.totals.estimateHours },
    { name: t('analytics.actual'), value: data.totals.hours },
  ];
  const hasWork = data.totals.done > 0 || data.totals.hours > 0 || data.totals.reopened > 0;

  return (
    <div className="flex flex-col gap-4" data-testid="person-view">
      <div className="flex flex-wrap items-center gap-3">
        <UserAvatar
          id={data.user.id}
          name={data.user.name}
          size={36}
          avatarVersion={data.user.avatarVersion}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{data.user.name}</h2>
          <p className="text-muted-foreground text-xs">
            {formatShortDate(data.range.from)} – {formatShortDate(data.range.to)}
          </p>
        </div>
        {people && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="an-person">{t('analytics.person')}</Label>
            <NativeSelect
              id="an-person"
              value={data.user.id}
              onChange={(e) => onUser(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.user.id} value={p.user.id}>
                  {p.user.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <KpiCards totals={data.totals} previous={data.previous} active={metric} onPick={onMetric} />

      {!hasWork ? (
        <Panel title={t('analytics.trend')}>
          <Empty text={t('analytics.noWork')} />
        </Panel>
      ) : (
        <>
          <Panel
            title={t('analytics.trendOf', { metric: t(`analytics.metric.${metric}`) })}
            hint={t('analytics.trendHint')}
          >
            <div className="h-64" data-testid="chart-trend">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                  <YAxis
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => fmt(metric, typeof v === 'number' ? v : null)}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={t(`analytics.metric.${metric}`)}
                    stroke={METRIC_META[metric].color}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel
              title={t('analytics.byProject')}
              hint={t('analytics.byProjectHint')}
              className="lg:col-span-2"
            >
              {projects.length === 0 ? (
                <Empty text={t('analytics.noWork')} />
              ) : (
                <div
                  style={{ height: Math.max(projects.length * 44, 120) }}
                  data-testid="chart-projects"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={projects}
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
                        dataKey="done"
                        name={t('analytics.metric.done')}
                        fill={METRIC_META.done.color}
                        radius={[0, 4, 4, 0]}
                      />
                      <Bar
                        dataKey="points"
                        name={t('analytics.metric.points')}
                        fill={METRIC_META.points.color}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title={t('analytics.estimateVsActual')} hint={t('analytics.estimateHint')}>
              {data.totals.estimateHours === 0 && data.totals.hours === 0 ? (
                <Empty text={t('analytics.noHours')} />
              ) : (
                <>
                  <div className="h-36" data-testid="chart-estimate">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={est} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <XAxis
                          dataKey="name"
                          tick={{ fill: AXIS, fontSize: 11 }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                        <Bar
                          dataKey="value"
                          name={t('analytics.hoursShort')}
                          fill={METRIC_META.hours.color}
                          radius={[4, 4, 0, 0]}
                          label={{ position: 'top', fontSize: 11, fill: AXIS }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {data.totals.estimateHours > 0 && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('analytics.estimateRatio', {
                        percent: Math.round((data.totals.hours / data.totals.estimateHours) * 100),
                      })}
                    </p>
                  )}
                </>
              )}
            </Panel>
          </div>

          <Panel title={t('analytics.bySprint')} hint={t('analytics.bySprintHint')}>
            {data.bySprint.length === 0 ? (
              <Empty text={t('analytics.noWork')} />
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full min-w-[40rem] text-left text-sm"
                  data-testid="sprint-table"
                >
                  <thead className="text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="py-2 pr-3 font-medium">{t('analytics.col.sprint')}</th>
                      <th className="px-3 py-2 font-medium">{t('analytics.col.project')}</th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.metric.done')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.metric.points')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.metric.hours')}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {t('analytics.metric.onTimePct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bySprint.map((row) => {
                      const id = row.sprint?.id ?? 'none';
                      const expanded = open.has(id);
                      return (
                        <Fragment key={id}>
                          <tr
                            className="hover:bg-accent/40 cursor-pointer border-b"
                            data-testid="sprint-row"
                            onClick={() =>
                              setOpen((s) => {
                                const next = new Set(s);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              })
                            }
                          >
                            <td className="py-2 pr-3">
                              <span className="flex items-center gap-1.5 font-medium">
                                {expanded ? (
                                  <ChevronDown className="size-4" aria-hidden />
                                ) : (
                                  <ChevronRight className="size-4" aria-hidden />
                                )}
                                {row.sprint?.name ?? t('analytics.noSprint')}
                              </span>
                              {row.sprint && (
                                <span className="text-muted-foreground ml-5.5 text-xs">
                                  {formatShortDate(row.sprint.startDate)} –{' '}
                                  {formatShortDate(row.sprint.endDate)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{row.sprint?.project ?? '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.done}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.points}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.hours}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fmt('onTimePct', row.onTimePct)}
                            </td>
                          </tr>
                          {expanded &&
                            row.items.map((item) => (
                              <tr
                                key={item.id}
                                className={cn('bg-muted/30 border-b text-xs')}
                                data-testid="sprint-item"
                              >
                                <td className="py-1.5 pr-3 pl-7" colSpan={2}>
                                  <span className="text-muted-foreground mr-2 font-mono">
                                    {item.key}
                                  </span>
                                  <Link
                                    to="/items/$key"
                                    params={{ key: item.key }}
                                    className="hover:underline"
                                  >
                                    {item.title}
                                  </Link>
                                </td>
                                <td className="px-3 py-1.5 text-right">
                                  {t(`analytics.type.${item.type}`)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {item.points}
                                </td>
                                <td className="px-3 py-1.5 text-right" colSpan={2}>
                                  {formatShortDate(item.completedAt)}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
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
