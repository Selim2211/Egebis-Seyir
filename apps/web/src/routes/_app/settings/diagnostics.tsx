import { createFileRoute } from '@tanstack/react-router';
import {
  CircleAlert,
  CircleCheck,
  ClipboardCopy,
  Download,
  Loader2,
  Play,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { type DiagnosticsReport, runDiagnostics } from '@/features/diagnostics/run-diagnostics';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings/diagnostics')({ component: DiagnosticsPage });

const ICON = { ok: CircleCheck, warn: TriangleAlert, bad: CircleAlert } as const;
const TONE = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-red-700 dark:text-red-400',
} as const;

/**
 * Tanılama (ADR-159): sunucuya erişimi olmayan yönetici, yavaşlığın kaynağını (ağ, sunucu, veritabanı)
 * buradan ölçer ve raporu geliştiriciye gönderir. Yalnızca Super Admin.
 */
function DiagnosticsPage() {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const text = report ? JSON.stringify(report, null, 2) : '';

  const run = async () => {
    setRunning(true);
    try {
      setReport(await runDiagnostics(workspaceId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };
  const copy = () =>
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t('diagnostics.copied')),
      () => toast.error(t('diagnostics.copyFailed')),
    );
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `seyir-tanilama-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('diagnostics.title')} subtitle={t('diagnostics.description')} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run()} disabled={running} data-testid="diagnostics-run">
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {running ? t('diagnostics.running') : t('diagnostics.run')}
        </Button>
        {report && (
          <>
            <Button variant="outline" onClick={copy} data-testid="diagnostics-copy">
              <ClipboardCopy /> {t('diagnostics.copy')}
            </Button>
            <Button variant="outline" onClick={download}>
              <Download /> {t('diagnostics.download')}
            </Button>
          </>
        )}
      </div>

      {report && (
        <>
          <section className="bg-card rounded-lg border p-4" data-testid="diagnostics-verdicts">
            <h2 className="mb-2 text-sm font-semibold">{t('diagnostics.summary')}</h2>
            <ul className="flex flex-col gap-1.5">
              {report.verdicts.map((v, i) => {
                const Icon = ICON[v.level];
                return (
                  <li key={i} className={cn('flex items-start gap-2 text-sm', TONE[v.level])}>
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {t(
                        `diagnostics.verdict.${v.key}` as 'diagnostics.verdict.dbOk',
                        v.values ?? {},
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric
              label={t('diagnostics.metric.network')}
              value={`${report.client.ping.networkMedianMs ?? '—'} ms`}
            />
            <Metric
              label={t('diagnostics.metric.download')}
              value={`${report.client.download
                .filter((d) => d.kb === 1024)
                .map((d) => d.mbps)
                .join(' / ')} Mbit/sn`}
            />
            <Metric
              label={t('diagnostics.metric.protocol')}
              value={`${report.client.page.protocol ?? '—'} · ${report.client.page.assetFiles} ${t('diagnostics.files')}`}
            />
          </section>
          <section>
            <h2 className="mb-2 text-sm font-semibold">{t('diagnostics.raw')}</h2>
            <pre
              className="bg-muted max-h-[28rem] overflow-auto rounded-lg p-3 text-xs"
              data-testid="diagnostics-json"
            >
              {text}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
