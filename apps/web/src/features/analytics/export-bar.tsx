import {
  AnalyticsDigestSchema,
  AnalyticsDigestTestSchema,
  type AnalyticsExportView,
} from '@scrum/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Mail, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import type { AnalyticsFilters } from './queries';

const digestKey = (ws: string) => ['workspaces', ws, 'analytics', 'digest'];

/** Haftalık özet e-postası: aç/kapa ve "kendime test gönder" (ADR-149). Yalnızca Owner/Admin. */
function DigestPopover() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: ws } = useCurrentWorkspace();
  const qc = useQueryClient();
  const digest = useQuery({
    queryKey: digestKey(ws),
    queryFn: () => apiRequest(`/workspaces/${ws}/analytics/digest`, AnalyticsDigestSchema),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest(`/workspaces/${ws}/analytics/digest`, AnalyticsDigestSchema, {
        method: 'PUT',
        body: { enabled },
      }),
    onSuccess: (data) => qc.setQueryData(digestKey(ws), data),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const test = useMutation({
    mutationFn: () =>
      apiRequest(`/workspaces/${ws}/analytics/digest/test`, AnalyticsDigestTestSchema, {
        method: 'POST',
      }),
    onSuccess: (r) => toast.success(t('analytics.export.testSent', { to: r.to })),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const d = digest.data;
  const next = d?.nextSendAt
    ? new Date(d.nextSendAt).toLocaleString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="glass-pill rounded-full"
          data-testid="digest-trigger"
        >
          <Mail aria-hidden />
          {t('analytics.export.digest')}
          {d?.enabled && (
            <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              {t('analytics.export.on')}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" data-testid="digest-popover">
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Switch
              id="digest-enabled"
              checked={d?.enabled ?? false}
              disabled={!d || toggle.isPending}
              onCheckedChange={(v) => toggle.mutate(v)}
              aria-label={t('analytics.export.digestEnable')}
            />
            <label htmlFor="digest-enabled" className="font-medium">
              {t('analytics.export.digestEnable')}
            </label>
          </div>
          <p className="text-muted-foreground text-xs">
            {t('analytics.export.digestHint', { count: d?.recipients ?? 0 })}
          </p>
          {next && (
            <p className="text-xs" data-testid="digest-next">
              {t('analytics.export.next', { when: next })}
            </p>
          )}
          {d?.lastSentAt && (
            <p className="text-muted-foreground text-xs">
              {t('analytics.export.last', {
                when: new Date(d.lastSentAt).toLocaleString('tr-TR'),
              })}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={test.isPending}
            onClick={() => test.mutate()}
            data-testid="digest-test"
          >
            {test.isPending ? t('common.loading') : t('analytics.export.testSend')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Sekmenin verisini Excel olarak indirir, sayfayı PDF'e yazdırır; yöneticide haftalık özet ayarı da burada. */
export function ExportBar({
  view,
  filters,
  admin,
  userId,
  projectId,
  userIds,
  weeklyHours,
}: {
  view: AnalyticsExportView;
  filters: AnalyticsFilters;
  admin: boolean;
  userId: string;
  projectId: string | undefined;
  userIds: string[];
  weeklyHours: number;
}) {
  const { t } = useTranslation();
  const { id: ws } = useCurrentWorkspace();
  const params = new URLSearchParams({
    view,
    from: filters.from,
    to: filters.to,
    grain: filters.grain,
  });
  if (filters.spaceId && view !== 'project') params.set('spaceId', filters.spaceId);
  if (view === 'person') params.set('userId', userId);
  if (view === 'project' && projectId) params.set('projectId', projectId);
  if (view === 'compare') params.set('userIds', userIds.join(','));
  if (view === 'capacity') params.set('weeklyHours', String(weeklyHours));
  const unavailable =
    (view === 'project' && !projectId) || (view === 'compare' && userIds.length === 0);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="export-bar">
      <Button
        asChild
        variant="outline"
        size="sm"
        className={cn('glass-pill rounded-full', unavailable && 'pointer-events-none opacity-50')}
      >
        <a
          href={`/api/workspaces/${ws}/analytics/export?${params}`}
          download
          data-testid="export-xlsx"
          aria-disabled={unavailable}
        >
          <Download aria-hidden />
          {t('analytics.export.excel')}
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="glass-pill rounded-full"
        onClick={() => window.print()}
        data-testid="export-pdf"
      >
        <Printer aria-hidden />
        {t('analytics.export.pdf')}
      </Button>
      {admin && <DigestPopover />}
    </div>
  );
}
