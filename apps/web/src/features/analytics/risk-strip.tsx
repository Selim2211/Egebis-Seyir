import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { forecastQuery } from './queries';
import { RiskRow } from './risk';

/** Yönetici panelinin üstünde: en önemli 4 uyarı ve Analiz → Öngörü bağlantısı (ADR-148). */
export function RiskStrip() {
  const { t } = useTranslation();
  const { id: ws } = useCurrentWorkspace();
  const forecast = useQuery({ ...forecastQuery(ws), staleTime: 5 * 60_000 });
  const risks = forecast.data?.risks ?? [];
  if (risks.length === 0) return null;
  return (
    <section
      className="flex flex-col gap-2"
      aria-label={t('analytics.forecast.stripTitle')}
      data-testid="risk-strip"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          {t('analytics.forecast.stripTitle')}
          <span className="text-muted-foreground ml-2 font-normal normal-case">
            {t('analytics.forecast.count', { count: risks.length })}
          </span>
        </h2>
        <Link
          to="/analytics"
          search={{ av: 'forecast' }}
          className="text-primary flex items-center gap-1 text-xs font-medium hover:underline"
        >
          {t('analytics.forecast.all')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {risks.slice(0, 4).map((r) => (
          <RiskRow key={r.id} risk={r} />
        ))}
      </div>
    </section>
  );
}
