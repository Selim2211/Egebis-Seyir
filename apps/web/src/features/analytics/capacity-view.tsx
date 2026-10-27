import type { AnalyticsCapacity } from '@scrum/shared';
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
import { NativeSelect } from '@/components/form';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/user-avatar';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addDays, AXIS, Empty, GRID, Panel, tooltipStyle } from './parts';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const BLUE = '#2563eb';
const GRAY = '#94a3b8';

const STATUS_STYLE = {
  over: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  idle: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
} as const;

function Card({
  label,
  value,
  sub,
  testId,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  testId: string;
  tone?: 'warn' | 'bad';
}) {
  return (
    <div
      className={cn(
        'bg-card flex flex-col gap-1 rounded-xl border p-3',
        tone === 'warn' &&
          'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10',
        tone === 'bad' &&
          'border-red-300/70 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10',
      )}
    >
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const pctText = (v: number | null) => (v === null ? '—' : `%${v}`);

/** Takvim ısı haritası: sütun = hafta, satır = haftanın günü; renk = o gün kaydedilen saat. */
function Heatmap({ days, to }: { days: Array<{ day: string; hours: number }>; to: string }) {
  const { t } = useTranslation();
  const byDay = new Map(days.map((d) => [d.day, d.hours]));
  // Son 26 hafta (en çok 183 gün) — Pazartesi hizalı.
  const dow = (new Date(`${to}T12:00:00Z`).getUTCDay() + 6) % 7;
  const lastMonday = addDays(to, -dow);
  const weeks = Array.from({ length: 26 }, (_, i) => addDays(lastMonday, -7 * (25 - i)));
  const max = Math.max(8, ...days.map((d) => d.hours));
  const shade = (h: number | undefined) => {
    if (!h) return 'bg-muted';
    const r = h / max;
    return r > 0.75
      ? 'bg-blue-700'
      : r > 0.5
        ? 'bg-blue-500'
        : r > 0.25
          ? 'bg-blue-400'
          : 'bg-blue-300 dark:bg-blue-300/70';
  };
  return (
    <div className="overflow-x-auto" data-testid="heatmap">
      <div className="flex gap-1">
        <div className="text-muted-foreground flex flex-col justify-between py-0.5 pr-1 text-[10px]">
          {WEEKDAYS.map((d) => (
            <span key={d} className="h-3.5 leading-3.5">
              {d % 2 === 0 ? t(`analytics.capacity.weekday.${d}`) : ''}
            </span>
          ))}
        </div>
        {weeks.map((monday) => (
          <div key={monday} className="flex flex-col gap-1">
            {WEEKDAYS.map((d) => {
              const day = addDays(monday, d);
              const h = byDay.get(day);
              return (
                <span
                  key={day}
                  title={`${formatShortDate(day)} · ${t('analytics.unit.hours', { value: h ?? 0 })}`}
                  className={cn('size-3.5 rounded-sm', day > to ? 'opacity-0' : shade(h))}
                  data-testid={h ? 'heat-cell-active' : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** İş yükü ve kapasite: kişi tablosu, ekip doluluğu ve ısı haritası (ADR-146). */
export function CapacityView({
  data,
  weeklyHours,
  onWeeklyHours,
  focus,
  onFocus,
}: {
  data: AnalyticsCapacity;
  weeklyHours: number;
  onWeeklyHours: (hours: number) => void;
  focus: string | undefined;
  onFocus: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const { team, people } = data;
  const active = people.find((p) => p.user.id === focus) ?? people[0];
  const weekly = data.weekly.map((w) => ({
    label: formatShortDate(w.weekStart),
    hours: w.hours,
    capacity: w.capacityHours,
  }));
  // Haftanın günlerine göre ekip ortalaması: kimin hangi gün daha çok kayıt girdiği.
  const weekdayTotals = WEEKDAYS.map((d) => ({
    name: t(`analytics.capacity.weekday.${d}`),
    hours: Math.round(people.reduce((n, p) => n + p.byWeekday[d]!, 0) * 10) / 10,
  }));
  const maxRemaining = Math.max(
    data.weeklyHours * 2,
    ...people.map((p) => p.open.remainingHours),
    1,
  );

  return (
    <div className="flex flex-col gap-4" data-testid="capacity-view">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="an-weekly">{t('analytics.capacity.weekly')}</Label>
          <NativeSelect
            id="an-weekly"
            value={String(weeklyHours)}
            onChange={(e) => onWeeklyHours(Number(e.target.value))}
          >
            {[20, 30, 36, 40, 45].map((h) => (
              <option key={h} value={h}>
                {t('analytics.capacity.hoursWeek', { count: h })}
              </option>
            ))}
          </NativeSelect>
        </div>
        <p className="text-muted-foreground max-w-xl pb-1 text-xs">
          {t('analytics.capacity.note')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="capacity-kpis">
        <Card
          testId="kpi-util"
          label={t('analytics.capacity.util')}
          value={pctText(team.utilizationPct)}
          sub={t('analytics.capacity.utilSub', {
            logged: num(team.loggedHours),
            capacity: num(team.capacityHours),
          })}
        />
        <Card
          testId="kpi-logging"
          label={t('analytics.capacity.logging')}
          value={pctText(team.avgLoggingPct)}
          sub={t('analytics.capacity.loggingSub')}
        />
        <Card
          testId="kpi-remaining"
          label={t('analytics.capacity.remaining')}
          value={t('analytics.unit.hours', { value: num(team.remainingHours) })}
          sub={t('analytics.capacity.remainingSub', { count: team.openItems })}
        />
        <Card
          testId="kpi-over"
          label={t('analytics.capacity.over')}
          value={String(team.overloaded)}
          sub={t('analytics.capacity.overSub')}
          tone={team.overloaded > 0 ? 'bad' : undefined}
        />
        <Card
          testId="kpi-idle"
          label={t('analytics.capacity.idle')}
          value={String(team.idle)}
          sub={t('analytics.capacity.idleSub')}
          tone={team.idle > 0 ? 'warn' : undefined}
        />
      </div>

      <Panel title={t('analytics.capacity.table')} hint={t('analytics.capacity.tableHint')}>
        {people.length === 0 ? (
          <Empty text={t('analytics.noWork')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm" data-testid="capacity-table">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('analytics.person')}</th>
                  <th className="px-3 py-2 font-medium">{t('analytics.capacity.status')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.capacity.openItems')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.capacity.overdue')}
                  </th>
                  <th className="px-3 py-2 font-medium">{t('analytics.capacity.remainingEst')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.capacity.loggedHours')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.capacity.utilShort')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.capacity.loggingShort')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr
                    key={p.user.id}
                    onClick={() => onFocus(p.user.id)}
                    className={cn(
                      'hover:bg-accent/40 cursor-pointer border-b last:border-0',
                      active?.user.id === p.user.id && 'bg-primary/5',
                    )}
                    data-testid="capacity-row"
                  >
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2 font-medium">
                        <UserAvatar
                          id={p.user.id}
                          name={p.user.name}
                          size={22}
                          avatarVersion={p.user.avatarVersion}
                        />
                        {p.user.name}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLE[p.status],
                        )}
                        data-testid={`status-${p.status}`}
                      >
                        {t(`analytics.capacity.statuses.${p.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.open.items}
                      <span className="text-muted-foreground">
                        {' '}
                        · {num(p.open.points)} {t('analytics.metric.points').toLowerCase()}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        p.open.overdue > 0 && 'font-semibold text-red-700 dark:text-red-300',
                      )}
                    >
                      {p.open.overdue}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 w-28 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              p.status === 'over' ? 'bg-red-500' : 'bg-blue-500',
                            )}
                            style={{
                              width: `${Math.min(100, (p.open.remainingHours / maxRemaining) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">
                          {t('analytics.unit.hours', { value: num(p.open.remainingHours) })}
                        </span>
                        {p.open.unestimated > 0 && (
                          <span
                            className="text-muted-foreground text-xs"
                            title={t('analytics.capacity.unestimated', {
                              count: p.open.unestimated,
                            })}
                          >
                            +{p.open.unestimated}?
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(p.logged.hours)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctText(p.logged.utilizationPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctText(p.logged.loggingPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t('analytics.capacity.weeklyChart')}
          hint={t('analytics.capacity.weeklyChartHint')}
        >
          <div className="h-60" data-testid="chart-weekly-capacity">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weekly} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="hours"
                  name={t('analytics.capacity.loggedHours')}
                  fill={BLUE}
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="capacity"
                  name={t('analytics.capacity.capacityLine')}
                  stroke={GRAY}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title={t('analytics.capacity.weekdayChart')}
          hint={t('analytics.capacity.weekdayChartHint')}
        >
          <div className="h-60" data-testid="chart-weekday">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayTotals} margin={{ top: 14, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                <Bar
                  dataKey="hours"
                  name={t('analytics.capacity.loggedHours')}
                  fill="#0891b2"
                  radius={[3, 3, 0, 0]}
                  label={{ position: 'top', fontSize: 11, fill: AXIS }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {active && (
        <Panel
          title={t('analytics.capacity.heatmapTitle', { name: active.user.name })}
          hint={t('analytics.capacity.heatmapHint')}
        >
          {active.days.length === 0 ? (
            <Empty text={t('analytics.capacity.noEntries')} />
          ) : (
            <Heatmap days={active.days} to={data.range.to} />
          )}
        </Panel>
      )}
    </div>
  );
}
