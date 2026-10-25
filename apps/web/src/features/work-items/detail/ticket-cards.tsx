import type { WorkItemDetail } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Mail, Reply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { formatDateTime } from '@/lib/format';

/**
 * Çağrı sistemi kartları (ADR-138): e-postadan açılan Bug'ın kaynağı (kimden, ne zaman), Bug Task'a
 * çevrildiyse "Task'a çevrildi" ibaresi ve Task'ın kaynak Bug bağlantısı.
 */
export function TicketCards({ item }: { item: WorkItemDetail }) {
  const { t } = useTranslation();
  const { inbound, sourceBug, convertedTasks } = item;
  if (!inbound && !sourceBug && convertedTasks.length === 0) return null;
  return (
    <section
      aria-label={t('tickets.title')}
      className="flex flex-col gap-3"
      data-testid="ticket-cards"
    >
      {convertedTasks.length > 0 && (
        <div
          role="status"
          data-testid="converted-banner"
          className="flex flex-wrap items-center gap-2 rounded-md border border-violet-300/60 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200"
        >
          <ArrowRight className="size-4 shrink-0" aria-hidden />
          <span>{t('tickets.convertedTo')}</span>
          {convertedTasks.map((task) => (
            <Link
              key={task.id}
              to="/items/$key"
              params={{ key: task.key }}
              className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
            >
              <WorkItemTypeIcon type="TASK" />
              {task.key} {task.title}
            </Link>
          ))}
        </div>
      )}

      {sourceBug && (
        <div
          data-testid="source-bug"
          className="flex flex-wrap items-center gap-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
        >
          <WorkItemTypeIcon type="BUG" />
          <span>{t('tickets.fromBug')}</span>
          <Link
            to="/items/$key"
            params={{ key: sourceBug.key }}
            className="font-semibold underline-offset-2 hover:underline"
          >
            {sourceBug.key} {sourceBug.title}
          </Link>
          <span className="text-xs opacity-80">{t('tickets.seeBugHistory')}</span>
        </div>
      )}

      {inbound && (
        <div data-testid="inbound-card" className="bg-card rounded-md border px-3 py-2.5 text-sm">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <Mail className="size-4 text-red-600" aria-hidden />
            {t(sourceBug ? 'tickets.sourceMail' : 'tickets.inboundMail')}
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">{t('tickets.from')}</dt>
            <dd className="min-w-0 truncate">
              <span className="font-medium">{inbound.fromName}</span>{' '}
              <a href={`mailto:${inbound.fromEmail}`} className="text-primary hover:underline">
                &lt;{inbound.fromEmail}&gt;
              </a>
            </dd>
            <dt className="text-muted-foreground">{t('tickets.company')}</dt>
            <dd data-testid="inbound-company">
              {inbound.company ? (
                <>
                  <span className="font-medium">{inbound.company}</span>
                  {inbound.subCompany && (
                    <span className="text-muted-foreground"> · {inbound.subCompany}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">{t('tickets.noCompany')}</span>
              )}
            </dd>
            {inbound.routeReason && (
              <>
                <dt className="text-muted-foreground">{t('tickets.routing')}</dt>
                <dd data-testid="inbound-routing">
                  {inbound.routedTo && <span className="font-medium">{inbound.routedTo} · </span>}
                  <span className="text-muted-foreground">{inbound.routeReason}</span>
                </dd>
              </>
            )}
            {inbound.aiSummary && (
              <>
                <dt className="text-muted-foreground">{t('tickets.aiSummary')}</dt>
                <dd data-testid="inbound-ai-summary">{inbound.aiSummary}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t('tickets.subject')}</dt>
            <dd className="min-w-0 truncate">{inbound.subject}</dd>
            <dt className="text-muted-foreground">{t('tickets.received')}</dt>
            <dd>{formatDateTime(inbound.receivedAt)}</dd>
            {inbound.replyCount > 0 && (
              <>
                <dt className="text-muted-foreground">{t('tickets.replies')}</dt>
                <dd className="flex items-center gap-1">
                  <Reply className="size-3.5" aria-hidden />
                  {t('tickets.replyCount', { count: inbound.replyCount })}
                </dd>
              </>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
