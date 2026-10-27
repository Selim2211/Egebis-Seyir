import { ANALYTICS_GRAINS, ANALYTICS_METRICS } from '@scrum/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { AnalyticsPage, type AnalyticsSearch } from '@/features/analytics/analytics-page';

const SearchSchema = z.object({
  av: z
    .enum(['person', 'project', 'flow', 'sprint', 'capacity', 'compare'])
    .optional()
    .catch(undefined),
  ap: z.string().optional(),
  aj: z.string().optional(),
  af: z.string().optional(),
  at: z.string().optional(),
  ag: z.enum(ANALYTICS_GRAINS).optional().catch(undefined),
  am: z.enum(ANALYTICS_METRICS).optional().catch(undefined),
  ac: z.string().optional(),
  asp: z.string().optional(),
  asr: z.string().optional(),
  awh: z.number().int().min(1).max(80).optional().catch(undefined),
  acf: z.string().optional(),
});

/** Kişi ve Proje analizi (ADR-143). Filtreler adres çubuğunda durur, sayfa yenilense de korunur. */
export const Route = createFileRoute('/_app/analytics')({
  validateSearch: SearchSchema,
  component: AnalyticsRoute,
});

function AnalyticsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const onSearch = (patch: AnalyticsSearch) =>
    void navigate({
      to: '/analytics',
      replace: true,
      search: (prev: AnalyticsSearch) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, value]) => value !== undefined),
        ),
    });
  return <AnalyticsPage search={search} onSearch={onSearch} />;
}
