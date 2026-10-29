import {
  ANALYTICS_COMPARE_MAX,
  ANALYTICS_METRICS,
  type AnalyticsCompare,
  type AnalyticsMetric,
  type AnalyticsPeople,
} from '@scrum/shared';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NativeSelect } from '@/components/form';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import {
  AXIS,
  Empty,
  GRID,
  METRIC_META,
  PERSON_COLORS,
  Panel,
  pointLabel,
  tooltipStyle,
  useFormatMetric,
} from './parts';

/** Radar eksenleri: hepsi seçilen kişiler içindeki en yüksek değere göre 0–100'e çekilir. */
const RADAR_AXES = ['done', 'points', 'hours', 'onTimePct', 'bugsFixed', 'speed'] as const;

/** 2–5 kişiyi aynı ölçütlerle yan yana getirir. */
export function CompareView({
  data,
  people,
  selected,
  onSelected,
  metric,
  onMetric,
}: {
  data: AnalyticsCompare | undefined;
  people: AnalyticsPeople['people'];
  selected: string[];
  onSelected: (ids: string[]) => void;
  metric: AnalyticsMetric;
  onMetric: (m: AnalyticsMetric) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatMetric();
  const available = people.filter((p) => !selected.includes(p.user.id));
  const users = data?.users ?? [];
  const grain = data?.range.grain ?? 'week';

  const trend = (data?.buckets ?? []).map((b, i) => ({
    label: pointLabel(b, grain),
    ...Object.fromEntries(users.map((u) => [u.user.id, u.series[i]?.[metric] ?? null])),
  }));

  // En iyi değer: ölçütün yönüne göre; en az iki kişide değer varsa vurgulanır.
  const best = (m: AnalyticsMetric): number | null => {
    const { better } = METRIC_META[m];
    const values = users.map((u) => u.totals[m]).filter((v): v is number => v !== null);
    if (better === 'neutral' || values.length < 2) return null;
    return better === 'up' ? Math.max(...values) : Math.min(...values);
  };

  const raw = users.map((u) => ({
    id: u.user.id,
    done: u.totals.done,
    points: u.totals.points,
    hours: u.totals.hours,
    onTimePct: u.totals.onTimePct ?? 0,
    bugsFixed: u.totals.bugsFixed,
    avg: u.totals.avgDays,
  }));
  const minAvg = Math.min(...raw.map((r) => r.avg ?? Infinity));
  const radar = RADAR_AXES.map((axis) => {
    const row: Record<string, string | number> = { axis: t(`analytics.radar.${axis}`) };
    for (const r of raw) {
      if (axis === 'speed')
        row[r.id] = r.avg && Number.isFinite(minAvg) ? Math.round((minAvg / r.avg) * 100) : 0;
      else if (axis === 'onTimePct') row[r.id] = r.onTimePct;
      else {
        const max = Math.max(...raw.map((x) => x[axis]), 0);
        row[r.id] = max === 0 ? 0 : Math.round((r[axis] / max) * 100);
      }
    }
    return row;
  });

  return (
    <div className="flex flex-col gap-4" data-testid="compare-view">
      <Panel
        title={t('analytics.pickPeople')}
        hint={t('analytics.pickPeopleHint', { max: ANALYTICS_COMPARE_MAX })}
      >
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((id, i) => {
            const p = people.find((x) => x.user.id === id);
            return (
              <span
                key={id}
                className="bg-muted flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 pl-0.5 text-sm"
                style={{ boxShadow: `inset 0 0 0 2px ${PERSON_COLORS[i % PERSON_COLORS.length]}` }}
                data-testid="compare-chip"
              >
                {p && (
                  <UserAvatar
                    id={id}
                    name={p.user.name}
                    size={22}
                    avatarVersion={p.user.avatarVersion}
                  />
                )}
                {p?.user.name ?? id}
                <button
                  type="button"
                  aria-label={t('analytics.remove', { name: p?.user.name ?? '' })}
                  onClick={() => onSelected(selected.filter((x) => x !== id))}
                  className="hover:bg-accent focus-visible:ring-ring/60 -my-1 flex size-7 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            );
          })}
          {selected.length < ANALYTICS_COMPARE_MAX && available.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="an-add" className="sr-only">
                {t('analytics.addPerson')}
              </Label>
              <NativeSelect
                id="an-add"
                value=""
                onChange={(e) => e.target.value && onSelected([...selected, e.target.value])}
              >
                <option value="">{t('analytics.addPerson')}</option>
                {available.map((p) => (
                  <option key={p.user.id} value={p.user.id}>
                    {p.user.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>
      </Panel>

      {users.length < 2 ? (
        <Panel title={t('analytics.compare')}>
          <Empty text={t('analytics.pickAtLeastTwo')} />
        </Panel>
      ) : (
        <>
          <Panel
            title={t('analytics.trendOf', { metric: t(`analytics.metric.${metric}`) })}
            hint={t('analytics.compareTrendHint')}
            right={
              <NativeSelect
                aria-label={t('analytics.metricPick')}
                value={metric}
                onChange={(e) => onMetric(e.target.value as AnalyticsMetric)}
              >
                {ANALYTICS_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {t(`analytics.metric.${m}`)}
                  </option>
                ))}
              </NativeSelect>
            }
          >
            <div className="h-72" data-testid="chart-compare">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
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
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {users.map((u, i) => (
                    <Line
                      key={u.user.id}
                      type="monotone"
                      dataKey={u.user.id}
                      name={u.user.name}
                      stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Panel
              title={t('analytics.table')}
              hint={t('analytics.tableHint')}
              className="lg:col-span-3"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="compare-table">
                  <thead className="text-muted-foreground border-b text-xs">
                    <tr>
                      <th className="py-2 pr-3 font-medium">{t('analytics.col.metric')}</th>
                      {users.map((u, i) => (
                        <th key={u.user.id} className="px-3 py-2 text-right font-medium">
                          <span
                            className="mr-1.5 inline-block size-2 rounded-full"
                            style={{ backgroundColor: PERSON_COLORS[i % PERSON_COLORS.length] }}
                            aria-hidden
                          />
                          {u.user.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ANALYTICS_METRICS.map((m) => {
                      const top = best(m);
                      return (
                        <tr
                          key={m}
                          className="border-b last:border-0"
                          data-testid={`compare-row-${m}`}
                        >
                          <td className="py-2 pr-3 font-medium">{t(`analytics.metric.${m}`)}</td>
                          {users.map((u) => {
                            const v = u.totals[m];
                            return (
                              <td
                                key={u.user.id}
                                className={cn(
                                  'px-3 py-2 text-right tabular-nums',
                                  top !== null &&
                                    v === top &&
                                    'font-semibold text-emerald-700 dark:text-emerald-300',
                                )}
                              >
                                {fmt(m, v)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title={t('analytics.radarTitle')}
              hint={t('analytics.radarHint')}
              className="lg:col-span-2"
            >
              <div className="h-72" data-testid="chart-radar">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="70%">
                    <PolarGrid stroke={GRID} />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: AXIS, fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    {users.map((u, i) => (
                      <Radar
                        key={u.user.id}
                        name={u.user.name}
                        dataKey={u.user.id}
                        stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
                        fill={PERSON_COLORS[i % PERSON_COLORS.length]}
                        fillOpacity={0.12}
                      />
                    ))}
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
