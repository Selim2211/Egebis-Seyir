import type { AnalyticsForecast, AnalyticsSprintState } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Empty, Panel } from './parts';
import { RiskRow } from './risk';

const STATE_STYLE: Record<AnalyticsSprintState, string> = {
  ahead: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  on_track: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  at_risk: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  behind: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
};
const BAR_STYLE: Record<AnalyticsSprintState, string> = {
  ahead: 'bg-emerald-500',
  on_track: 'bg-emerald-500',
  at_risk: 'bg-amber-500',
  behind: 'bg-red-500',
};

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** Öngörü ve risk: uyarılar, aktif sprintlerin ve açık Epic'lerin tahmini bitişi (ADR-148). */
export function ForecastView({ data }: { data: AnalyticsForecast }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4" data-testid="forecast-view">
      <p className="text-muted-foreground max-w-3xl text-xs">{t('analytics.forecast.note')}</p>

      <Panel title={t('analytics.forecast.risksTitle')} hint={t('analytics.forecast.risksHint')}>
        {data.risks.length === 0 ? (
          <Empty text={t('analytics.forecast.noRisks')} />
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" data-testid="risk-list">
            {data.risks.map((r) => (
              <RiskRow key={r.id} risk={r} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title={t('analytics.forecast.sprintsTitle')}
        hint={t('analytics.forecast.sprintsHint')}
      >
        {data.sprints.length === 0 ? (
          <Empty text={t('analytics.forecast.noSprints')} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="forecast-sprints">
            {data.sprints.map((s) => {
              const donePct = s.totalPoints > 0 ? (s.donePoints / s.totalPoints) * 100 : 0;
              const projPct = s.totalPoints > 0 ? (s.projectedDone / s.totalPoints) * 100 : 0;
              return (
                <div
                  key={s.id}
                  className="glass glass-strong flex flex-col gap-2 p-3"
                  data-testid="forecast-sprint"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.project.color }}
                      aria-hidden
                    />
                    <Link
                      to="/analytics"
                      search={{ av: 'sprint', asr: s.id }}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {s.name} · {s.project.name}
                    </Link>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        STATE_STYLE[s.state],
                      )}
                      data-testid={`sprint-state-${s.state}`}
                    >
                      {t(`analytics.forecast.state.${s.state}`)}
                    </span>
                  </div>
                  <div className="bg-muted relative h-3 overflow-hidden rounded-full">
                    <div
                      className="bg-primary/25 absolute top-0 h-full rounded-full"
                      style={{ width: `${Math.min(100, projPct)}%` }}
                      title={t('analytics.forecast.projected')}
                    />
                    <div
                      className={cn('absolute top-0 h-full rounded-full', BAR_STYLE[s.state])}
                      style={{ width: `${Math.min(100, donePct)}%` }}
                    />
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      {t('analytics.forecast.donePoints', {
                        done: num(s.donePoints),
                        total: num(s.totalPoints),
                      })}
                    </span>
                    <span>{t('analytics.forecast.daysLeft', { count: s.daysLeft })}</span>
                    <span>{t('analytics.forecast.rate', { value: num(s.ratePerDay) })}</span>
                  </div>
                  <p className="text-sm">
                    {s.projectedPct === null
                      ? t('analytics.forecast.noEstimate')
                      : t('analytics.forecast.projection', {
                          pct: s.projectedPct,
                          finish: s.projectedFinish ? formatShortDate(s.projectedFinish) : '—',
                        })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title={t('analytics.forecast.epicsTitle')} hint={t('analytics.forecast.epicsHint')}>
        {data.epics.length === 0 ? (
          <Empty text={t('analytics.forecast.noEpics')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm" data-testid="epic-table">
              <thead className="text-muted-foreground border-b text-xs">
                <tr>
                  <th className="py-2 pr-3 font-medium">Epic</th>
                  <th className="px-3 py-2 font-medium">{t('analytics.col.project')}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.forecast.col.remaining')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.forecast.col.rate')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.forecast.col.weeks')}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t('analytics.forecast.col.finish')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.epics.map((e) => (
                  <tr
                    key={e.id}
                    className="hover:bg-accent/40 border-b last:border-0"
                    data-testid="epic-row"
                  >
                    <td className="py-2 pr-3">
                      <span className="text-muted-foreground mr-2 font-mono text-xs">{e.key}</span>
                      <Link
                        to="/items/$key"
                        params={{ key: e.key }}
                        className="font-medium hover:underline"
                      >
                        {e.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{e.project.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {num(e.remainingPoints)}
                      <span className="text-muted-foreground"> / {num(e.totalPoints)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(e.ratePerWeek)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.weeksLeft === null ? '—' : num(e.weeksLeft)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.projectedFinish ? formatShortDate(e.projectedFinish) : '—'}
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
