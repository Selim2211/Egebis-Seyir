import type { AnalyticsRisk } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export const RISK_STYLE = {
  high: 'border-red-300/70 bg-red-50/70 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
  medium:
    'border-amber-300/70 bg-amber-50/70 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  low: 'border-border bg-muted/50 text-foreground',
} as const;

const ICON = { high: AlertOctagon, medium: AlertTriangle, low: Info } as const;

/** Uyarı metni: tür + sayılardan, kişileri etiketlemeden değişimi söyler. */
export function useRiskText() {
  const { t } = useTranslation();
  return (r: AnalyticsRisk): string => {
    const p = { subject: r.subject, value: r.value, previous: r.previous ?? 0 };
    switch (r.kind) {
      case 'sprint_behind':
        return t('analytics.forecast.risk.sprint_behind', p);
      case 'critical_waiting':
        return t('analytics.forecast.risk.critical_waiting', p);
      case 'person_slowing':
        return t('analytics.forecast.risk.person_slowing', p);
      case 'project_slowing':
        return t('analytics.forecast.risk.project_slowing', p);
      case 'stuck_items':
        return t('analytics.forecast.risk.stuck_items', p);
      case 'unassigned_bugs':
        return t('analytics.forecast.risk.unassigned_bugs', p);
    }
  };
}

/** Uyarının açacağı sayfa. */
export function RiskLink({
  risk,
  className,
  children,
}: {
  risk: AnalyticsRisk;
  className?: string;
  children: ReactNode;
}) {
  const link = risk.link;
  if (link?.kind === 'item')
    return (
      <Link to="/items/$key" params={{ key: link.id }} className={className}>
        {children}
      </Link>
    );
  if (link?.kind === 'person')
    return (
      <Link to="/analytics" search={{ av: 'person', ap: link.id }} className={className}>
        {children}
      </Link>
    );
  if (link?.kind === 'project')
    return (
      <Link to="/analytics" search={{ av: 'project', aj: link.id }} className={className}>
        {children}
      </Link>
    );
  if (link?.kind === 'sprint')
    return (
      <Link to="/analytics" search={{ av: 'sprint', asr: link.id }} className={className}>
        {children}
      </Link>
    );
  if (risk.kind === 'stuck_items')
    return (
      <Link to="/analytics" search={{ av: 'flow' }} className={className}>
        {children}
      </Link>
    );
  if (risk.kind === 'unassigned_bugs')
    return (
      <Link to="/admin-list" search={{ kind: 'bugs-unassigned' }} className={className}>
        {children}
      </Link>
    );
  return <span className={className}>{children}</span>;
}

/** Tek uyarı satırı. */
export function RiskRow({ risk }: { risk: AnalyticsRisk }) {
  const text = useRiskText()(risk);
  const { t } = useTranslation();
  const Icon = ICON[risk.level];
  return (
    <RiskLink
      risk={risk}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:brightness-95',
        RISK_STYLE[risk.level],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1" data-testid="risk-text">
        {text}
      </span>
      <span className="text-xs font-medium whitespace-nowrap opacity-80">
        {t(`analytics.forecast.level.${risk.level}`)}
      </span>
    </RiskLink>
  );
}
