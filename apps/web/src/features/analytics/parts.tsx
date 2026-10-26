import {
  ANALYTICS_GRAINS,
  ANALYTICS_METRICS,
  type AnalyticsGrain,
  type AnalyticsMetric,
  type AnalyticsMetrics,
  type AnalyticsPoint,
} from '@scrum/shared';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { Label } from '@/components/ui/label';
import { useHierarchy } from '@/features/spaces/queries';
import { formatShortDate, todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AnalyticsFilters } from './queries';

/** Ölçütün yönü: artış iyi mi, kötü mü, nötr mü? */
export const METRIC_META: Record<
  AnalyticsMetric,
  {
    better: 'up' | 'down' | 'neutral';
    unit: 'count' | 'points' | 'hours' | 'days' | 'percent';
    color: string;
  }
> = {
  done: { better: 'up', unit: 'count', color: '#2563eb' },
  points: { better: 'up', unit: 'points', color: '#7c3aed' },
  hours: { better: 'neutral', unit: 'hours', color: '#0891b2' },
  avgDays: { better: 'down', unit: 'days', color: '#d97706' },
  onTimePct: { better: 'up', unit: 'percent', color: '#16a34a' },
  bugsFixed: { better: 'up', unit: 'count', color: '#dc2626' },
  reopened: { better: 'down', unit: 'count', color: '#be123c' },
};

/** Kişi karşılaştırmasında çizgi renkleri (en çok 5 kişi). */
export const PERSON_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed'] as const;

export const AXIS = 'var(--muted-foreground)';
export const GRID = 'var(--border)';
export const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
};

export function useFormatMetric() {
  const { t } = useTranslation();
  return (metric: AnalyticsMetric, value: number | null): string => {
    if (value === null) return '—';
    const n = value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    switch (METRIC_META[metric].unit) {
      case 'hours':
        return t('analytics.unit.hours', { value: n });
      case 'days':
        return t('analytics.unit.days', { value: n });
      case 'percent':
        return `%${n}`;
      default:
        return n;
    }
  };
}

/** Grafik ekseninde nokta etiketi: hafta/ay başlangıç günü ya da sprint adı. */
export function pointLabel(p: { key: string; label: string }, grain: AnalyticsGrain): string {
  if (grain === 'sprint') return p.key === 'none' ? '—' : p.label;
  if (grain === 'month') {
    return new Date(`${p.key}T12:00:00`).toLocaleDateString('tr-TR', {
      month: 'short',
      year: '2-digit',
    });
  }
  return formatShortDate(p.key);
}

/** Bir ölçütün değeri (kutucuk ve grafikler için). */
export const metricValue = (m: AnalyticsMetrics, metric: AnalyticsMetric): number | null =>
  m[metric];
export const pointValue = (p: AnalyticsPoint, metric: AnalyticsMetric): number | null => p[metric];

function Delta({
  metric,
  value,
  previous,
}: {
  metric: AnalyticsMetric;
  value: number | null;
  previous: number | null;
}) {
  const { t } = useTranslation();
  if (value === null || previous === null || (value === 0 && previous === 0)) {
    return <span className="text-muted-foreground text-xs">{t('analytics.noPrevious')}</span>;
  }
  if (previous === 0) {
    return <span className="text-muted-foreground text-xs">{t('analytics.newPeriod')}</span>;
  }
  const pct = Math.round(((value - previous) / Math.abs(previous)) * 100);
  const dir = pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down';
  const { better } = METRIC_META[metric];
  const good = better === 'neutral' || dir === 'flat' ? null : better === dir;
  const Icon = dir === 'flat' ? ArrowRight : dir === 'up' ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs font-medium tabular-nums',
        good === null && 'text-muted-foreground',
        good === true && 'text-emerald-700 dark:text-emerald-300',
        good === false && 'text-red-700 dark:text-red-300',
      )}
      data-testid={`delta-${metric}`}
    >
      <Icon className="size-3" aria-hidden />%{Math.abs(pct)}
      <span className="text-muted-foreground font-normal">{t('analytics.vsPrevious')}</span>
    </span>
  );
}

/** Yedi ölçütün kutucukları; her birinde önceki döneme göre değişim. */
export function KpiCards({
  totals,
  previous,
  active,
  onPick,
}: {
  totals: AnalyticsMetrics;
  previous: AnalyticsMetrics;
  active?: AnalyticsMetric;
  onPick?: (m: AnalyticsMetric) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatMetric();
  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7"
      data-testid="analytics-kpis"
    >
      {ANALYTICS_METRICS.map((m) => {
        const body = (
          <>
            <span className="text-muted-foreground text-xs font-medium">
              {t(`analytics.metric.${m}`)}
            </span>
            <span
              className="text-2xl font-semibold tracking-tight tabular-nums"
              data-testid={`kpi-${m}`}
            >
              {fmt(m, metricValue(totals, m))}
            </span>
            <Delta metric={m} value={metricValue(totals, m)} previous={metricValue(previous, m)} />
          </>
        );
        const cls = cn(
          'bg-card flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors',
          onPick && 'hover:border-primary/60 cursor-pointer',
          active === m && 'border-primary ring-primary/30 ring-1',
        );
        return onPick ? (
          <button
            key={m}
            type="button"
            className={cls}
            onClick={() => onPick(m)}
            aria-pressed={active === m}
          >
            {body}
          </button>
        ) : (
          <div key={m} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function Panel({
  title,
  hint,
  children,
  className,
  right,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={cn('bg-card rounded-xl border p-4', className)}>
      <header className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

export const Empty = ({ text }: { text: string }) => (
  <p className="text-muted-foreground py-10 text-center text-sm">{text}</p>
);

export const addDays = (day: string, n: number) =>
  new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const PRESETS = [30, 90, 180, 365] as const;

/** Tarih aralığı, zaman dilimi ve Proje süzgeci. */
export function FilterBar({
  filters,
  onChange,
  showProject,
}: {
  filters: AnalyticsFilters;
  onChange: (patch: Partial<AnalyticsFilters>) => void;
  showProject: boolean;
}) {
  const { t } = useTranslation();
  const hierarchy = useHierarchy();
  const today = todayDay();
  const spanDays =
    Math.round(
      (new Date(`${filters.to}T12:00:00Z`).getTime() -
        new Date(`${filters.from}T12:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;
  const activePreset = filters.to === today ? PRESETS.find((p) => p === spanDays) : undefined;
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="analytics-filters">
      <div className="flex flex-col gap-1.5">
        <Label>{t('analytics.range')}</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange({ from: addDays(today, -(p - 1)), to: today })}
              aria-pressed={activePreset === p}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                activePreset === p
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'hover:bg-accent',
              )}
            >
              {t('analytics.lastDays', { count: p })}
            </button>
          ))}
          <input
            type="date"
            aria-label={t('analytics.from')}
            value={filters.from}
            max={filters.to}
            onChange={(e) => e.target.value && onChange({ from: e.target.value })}
            className="bg-background h-8 rounded-md border px-2 text-xs"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <input
            type="date"
            aria-label={t('analytics.to')}
            value={filters.to}
            min={filters.from}
            max={today}
            onChange={(e) => e.target.value && onChange({ to: e.target.value })}
            className="bg-background h-8 rounded-md border px-2 text-xs"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="an-grain">{t('analytics.grain')}</Label>
        <NativeSelect
          id="an-grain"
          value={filters.grain}
          onChange={(e) => onChange({ grain: e.target.value as AnalyticsGrain })}
        >
          {ANALYTICS_GRAINS.map((g) => (
            <option key={g} value={g}>
              {t(`analytics.grains.${g}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {showProject && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="an-space">{t('analytics.project')}</Label>
          <NativeSelect
            id="an-space"
            value={filters.spaceId ?? ''}
            onChange={(e) => onChange({ spaceId: e.target.value || undefined })}
          >
            <option value="">{t('analytics.allProjects')}</option>
            {hierarchy.data?.spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </div>
  );
}
