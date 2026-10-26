import type { AnalyticsMetric, AnalyticsProject } from '@scrum/shared';
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
import { useHierarchy } from '@/features/spaces/queries';
import { formatShortDate } from '@/lib/format';
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

/** Proje analizi: kutucuklar, eğri, kişilere katkı, hız ve iş türü dağılımı. */
export function ProjectView({
  data,
  onSpace,
  onPerson,
  metric,
  onMetric,
}: {
  data: AnalyticsProject;
  onSpace: (spaceId: string) => void;
  onPerson: (userId: string) => void;
  metric: AnalyticsMetric;
  onMetric: (m: AnalyticsMetric) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatMetric();
  const hierarchy = useHierarchy();
  const grain = data.range.grain;
  const chart = data.series.map((p) => ({
    label: pointLabel(p, grain),
    value: pointValue(p, metric),
    bugsOpened: p.bugsOpened,
    bugsFixed: p.bugsFixed,
  }));
  const people = data.byPerson.map((p) => ({
    id: p.user.id,
    name: p.user.name,
    done: p.done,
    points: p.points,
  }));
  const hasWork = data.totals.done > 0 || data.totals.hours > 0;
  const types = [
    { name: t('analytics.type.TASK'), value: data.byType.task },
    { name: t('analytics.type.SUBTASK'), value: data.byType.subtask },
    { name: t('analytics.type.BUG'), value: data.byType.bug },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="project-view">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="size-4 shrink-0 rounded-full"
          style={{ backgroundColor: data.space.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{data.space.name}</h2>
          <p className="text-muted-foreground text-xs">
            {formatShortDate(data.range.from)} – {formatShortDate(data.range.to)}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="an-project">{t('analytics.project')}</Label>
          <NativeSelect
            id="an-project"
            value={data.space.id}
            onChange={(e) => onSpace(e.target.value)}
          >
            {hierarchy.data?.spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <KpiCards totals={data.totals} previous={data.previous} active={metric} onPick={onMetric} />

      {!hasWork ? (
        <Panel title={t('analytics.trend')}>
          <Empty text={t('analytics.noWork')} />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={t('analytics.trendOf', { metric: t(`analytics.metric.${metric}`) })}
              hint={t('analytics.trendHint')}
            >
              <div className="h-60" data-testid="chart-trend">
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
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title={t('analytics.bugFlow')} hint={t('analytics.bugFlowHint')}>
              <div className="h-60" data-testid="chart-bugflow">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <YAxis
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="bugsOpened"
                      name={t('analytics.bugsOpened')}
                      fill="#dc2626"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="bugsFixed"
                      name={t('analytics.metric.bugsFixed')}
                      fill="#16a34a"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              title={t('analytics.byPerson')}
              hint={t('analytics.byPersonHint')}
              className="lg:col-span-2"
            >
              {people.length === 0 ? (
                <Empty text={t('analytics.noWork')} />
              ) : (
                <div
                  style={{ height: Math.max(people.length * 44, 120) }}
                  data-testid="chart-people"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={people}
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
                        cursor="pointer"
                        onClick={(d: unknown) => {
                          const id =
                            (d as { id?: string }).id ??
                            (d as { payload?: { id?: string } }).payload?.id;
                          if (id) onPerson(id);
                        }}
                      />
                      <Bar
                        dataKey="points"
                        name={t('analytics.metric.points')}
                        fill={METRIC_META.points.color}
                        radius={[0, 4, 4, 0]}
                        cursor="pointer"
                        onClick={(d: unknown) => {
                          const id =
                            (d as { id?: string }).id ??
                            (d as { payload?: { id?: string } }).payload?.id;
                          if (id) onPerson(id);
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel title={t('analytics.velocity')} hint={t('analytics.velocityHint')}>
                {data.velocity.length === 0 ? (
                  <Empty text={t('analytics.noVelocity')} />
                ) : (
                  <div className="h-40" data-testid="chart-velocity">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.velocity}
                        margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                      >
                        <XAxis
                          dataKey="name"
                          tick={{ fill: AXIS, fontSize: 10 }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                        <Bar dataKey="committed" name={t('analytics.committed')} fill="#94a3b8" />
                        <Bar
                          dataKey="completed"
                          name={t('analytics.completedPoints')}
                          fill="#16a34a"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
              <Panel title={t('analytics.byType')}>
                <ul className="flex flex-col gap-1 text-sm" data-testid="type-list">
                  {types.map((x) => (
                    <li key={x.name} className="flex justify-between">
                      <span>{x.name}</span>
                      <span className="tabular-nums">{x.value}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
