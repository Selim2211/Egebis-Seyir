import { formatMinutes, parseDuration } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Play, Square, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate, todayDay } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { itemTimeQuery, useDeleteTime, useLogTime, useStartTimer, useStopTimer } from './queries';

/** Görevde zaman takibi (brief §5.15): sayaç, elle giriş, tahminle karşılaştırma (ADR-075). */
export function TimeSection({ itemId }: { itemId: string }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(itemTimeQuery(workspaceId, itemId));
  const log = useLogTime();
  const remove = useDeleteTime();
  const start = useStartTimer();
  const stop = useStopTimer();
  const [duration, setDuration] = useState('');
  const [day, setDay] = useState(todayDay());
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState(false);
  const locale = i18n.language === 'en' ? 'en' : 'tr';
  const onError = (error: unknown) => toast.error(errorMessage(error));

  if (!data) return null;
  if (!data.canLog && data.entries.length === 0) return null;

  const estimateMinutes = data.estimateHours === null ? null : Math.round(data.estimateHours * 60);
  const ratio = estimateMinutes
    ? Math.min(100, Math.round((data.ownMinutes / estimateMinutes) * 100))
    : 0;
  const over = estimateMinutes !== null && data.ownMinutes > estimateMinutes;
  const running = data.myTimerStartedAt !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const minutes = parseDuration(duration);
    if (minutes === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void log
      .mutateAsync({ itemId, body: { day, minutes, note: note.trim() || null } })
      .then(() => {
        setDuration('');
        setNote('');
      })
      .catch(onError);
  };

  return (
    <section aria-labelledby="time-title">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 id="time-title" className="text-sm font-semibold">
          {t('time.title')}
        </h3>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t('time.logged', { value: formatMinutes(data.ownMinutes, locale) })}
          {estimateMinutes !== null &&
            ` · ${t('time.estimate', { value: formatMinutes(estimateMinutes, locale) })}`}
          {data.totalMinutes > data.ownMinutes &&
            ` · ${t('time.withChildren', { value: formatMinutes(data.totalMinutes, locale) })}`}
        </span>
        {data.canLog &&
          (running ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={stop.isPending}
              onClick={() => stop.mutate(undefined, { onError })}
            >
              <Square /> {t('time.stop')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={start.isPending}
              onClick={() => start.mutate(itemId, { onError })}
            >
              <Play /> {t('time.start')}
            </Button>
          ))}
      </div>

      {estimateMinutes !== null && (
        <div
          className="bg-muted mb-2 h-1.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ratio}
          aria-label={t('time.vsEstimate')}
        >
          <div
            className={cn('h-full', over ? 'bg-destructive' : 'bg-status-done')}
            style={{ width: `${ratio}%` }}
          />
        </div>
      )}

      {data.canLog && (
        <form onSubmit={submit} className="mb-2 flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-0.5">
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={t('time.durationPlaceholder')}
              aria-label={t('time.duration')}
              aria-invalid={invalid}
              className="h-8 w-32"
            />
            {invalid && (
              <span role="alert" className="text-destructive text-xs">
                {t('time.invalid')}
              </span>
            )}
          </div>
          <Input
            type="date"
            value={day}
            max={todayDay()}
            onChange={(e) => setDay(e.target.value)}
            aria-label={t('time.day')}
            className="h-8 w-36"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={t('time.notePlaceholder')}
            aria-label={t('time.note')}
            className="h-8 min-w-40 flex-1"
          />
          <Button type="submit" size="sm" disabled={log.isPending || !duration.trim()}>
            {t('time.add')}
          </Button>
        </form>
      )}

      {data.entries.length > 0 && (
        <ul className="divide-y rounded-md border">
          {data.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="w-16 shrink-0 font-medium tabular-nums">
                {formatMinutes(entry.minutes, locale)}
              </span>
              <span className="text-muted-foreground w-20 shrink-0 text-xs">
                {formatShortDate(entry.day)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {entry.user?.name ?? '—'}
                {entry.note && <span className="text-muted-foreground"> · {entry.note}</span>}
                {entry.source === 'TIMER' && (
                  <span className="text-muted-foreground"> · {t('time.fromTimer')}</span>
                )}
              </span>
              {entry.canDelete && data.canLog && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={t('time.remove', { value: formatMinutes(entry.minutes, locale) })}
                  onClick={() => remove.mutate({ itemId, entryId: entry.id }, { onError })}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
