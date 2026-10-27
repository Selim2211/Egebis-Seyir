import type { AnalyticsSprints, SprintBurndown } from '@scrum/shared';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
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
import { AXIS, Empty, GRID, Panel, tooltipStyle } from './parts';

const BLUE = '#2563eb';
const GREEN = '#16a34a';
const AMBER = '#d97706';
const RED = '#dc2626';
const GRAY = '#94a3b8';

function Card({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  testId: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-xl border p-3">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}

const pctText = (v: number | null) => (v === null ? '—' : `%${v}`);
const toneOf = (v: number | null) =>
  v === null
    ? ''
    : v >= 90
      ? 'text-emerald-700 dark:text-emerald-300'
      : v >= 70
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-red-700 dark:text-red-300';

/** Sprint derinliği: taahhüt ve biten, kapsam değişimi, devir ve seçili sprintin burndown/burn-up'ı (ADR-145). */
export function SprintView({
  data,
  selected,
  onSelect,
  burndown,
}: {
  data: AnalyticsSprints;
  selected: string | undefined;
  onSelect: (id: string) => void;
  burndown: SprintBurndown | undefined;
}) {
  const { t } = useTranslation();
  const { summary, sprints } = data;
  const chart = sprints.map((s) => ({
    name: `${s.name} · ${s.project.name.slice(0, 10)}`,
    committed: s.committed,
    completed: s.completed,
    scopeAdded: s.scopeAdded,
    scopeRemoved: -s.scopeRemoved,
    carryOver: s.carryOverPoints,
  }));
  const active = sprints.find((s) => s.id === selected) ?? sprints[sprints.length - 1];
  const points = (burndown?.points ?? []).map((p) => ({
    label: formatShortDate(p.date),
    ideal: p.ideal,
    remaining: p.remaining,
    total: p.total,
    done: p.done,
    scope: p.scopeChange,
  }));

  return (
    <div className="flex flex-col gap-4" data-testid="sprint-view">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="sprint-kpis">
        <Card
          testId="kpi-velocity"
          label={t('analytics.sprint.velocity')}
          value={summary.avgVelocity === null ? '—' : String(summary.avgVelocity)}
          sub={t('analytics.sprint.velocitySub', { count: summary.completedCount })}
        />
        <Card
          testId="kpi-commitment"
          label={t('analytics.sprint.commitment')}
          value={pctText(summary.avgCommitmentPct)}
          sub={t('analytics.sprint.commitmentSub')}
        />
        <Card
          testId="kpi-scope"
          label={t('analytics.sprint.scope')}
          value={pctText(summary.avgScopeChangePct)}
          sub={t('analytics.sprint.scopeSub')}
        />
        <Card
          testId="kpi-carry"
          label={t('analytics.sprint.carry')}
          value={pctText(summary.avgCarryOverPct)}
          sub={t('analytics.sprint.carrySub')}
        />
        <Card
          testId="kpi-sprint-count"
          label={t('analytics.sprint.count')}
          value={String(sprints.length)}
          sub={t('analytics.sprint.countSub')}
        />
      </div>

      {sprints.length === 0 ? (
        <Panel title={t('analytics.sprint.title')}>
          <Empty text={t('analytics.sprint.none')} />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={t('analytics.sprint.commitChart')}
              hint={t('analytics.sprint.commitChartHint')}
            >
              <div className="h-60" data-testid="chart-commit">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="committed"
                      name={t('analytics.committed')}
                      fill={GRAY}
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="completed"
                      name={t('analytics.completedPoints')}
                      fill={GREEN}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel
              title={t('analytics.sprint.scopeChart')}
              hint={t('analytics.sprint.scopeChartHint')}
            >
              <div className="h-60" data-testid="chart-scope">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chart}
                    margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    stackOffset="sign"
                  >
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="scopeAdded"
                      stackId="s"
                      name={t('analytics.sprint.added')}
                      fill={AMBER}
                    />
                    <Bar
                      dataKey="scopeRemoved"
                      stackId="s"
                      name={t('analytics.sprint.removed')}
                      fill={BLUE}
                    />
                    <Bar
                      dataKey="carryOver"
                      name={t('analytics.sprint.carryPoints')}
                      fill={RED}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <Panel title={t('analytics.sprint.tableTitle')} hint={t('analytics.sprint.tableHint')}>
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[56rem] text-left text-sm"
                data-testid="sprint-summary-table"
              >
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t('analytics.col.sprint')}</th>
                    <th className="px-3 py-2 font-medium">{t('analytics.col.project')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('analytics.committed')}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.completedPoints')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.sprint.commitment')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.sprint.added')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.sprint.carryPoints')}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t('analytics.sprint.carriedIn')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...sprints].reverse().map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => onSelect(s.id)}
                      className={cn(
                        'hover:bg-accent/40 cursor-pointer border-b last:border-0',
                        active?.id === s.id && 'bg-primary/5',
                      )}
                      data-testid="sprint-summary-row"
                      aria-selected={active?.id === s.id}
                    >
                      <td className="py-2 pr-3">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {formatShortDate(s.startDate)} – {formatShortDate(s.endDate)}
                          {s.status === 'ACTIVE' && ` · ${t('analytics.sprint.active')}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">{s.project.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.committed}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.completed}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-medium tabular-nums',
                          toneOf(s.commitmentPct),
                        )}
                      >
                        {pctText(s.commitmentPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        +{s.scopeAdded}
                        {s.scopeRemoved > 0 && ` / −${s.scopeRemoved}`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.carryOverPoints} ({s.carryOverItems})
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.carriedInPoints} ({s.carriedInItems})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {active && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title={t('analytics.sprint.burndown', { name: active.name })}
                hint={t('analytics.sprint.burndownHint')}
              >
                {points.length === 0 ? (
                  <Empty text={t('analytics.sprint.noBurn')} />
                ) : (
                  <div className="h-60" data-testid="chart-burndown">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={points}
                        margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: AXIS, fontSize: 11 }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="scope"
                          name={t('analytics.sprint.scopeChange')}
                          fill={AMBER}
                          opacity={0.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="ideal"
                          name={t('analytics.sprint.ideal')}
                          stroke={GRAY}
                          strokeDasharray="5 4"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="remaining"
                          name={t('analytics.sprint.remaining')}
                          stroke={BLUE}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>

              <Panel
                title={t('analytics.sprint.burnup', { name: active.name })}
                hint={t('analytics.sprint.burnupHint')}
              >
                {points.length === 0 ? (
                  <Empty text={t('analytics.sprint.noBurn')} />
                ) : (
                  <div className="h-60" data-testid="chart-burnup">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: AXIS, fontSize: 11 }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line
                          type="stepAfter"
                          dataKey="total"
                          name={t('analytics.sprint.total')}
                          stroke={GRAY}
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="done"
                          name={t('analytics.completedPoints')}
                          stroke={GREEN}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
