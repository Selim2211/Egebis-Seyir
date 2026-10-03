import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { myTimerQuery, useStopTimer } from './queries';

const pad = (n: number) => String(n).padStart(2, '0');

/** 3725 sn → "1:02:05". */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;

/** Üst çubukta çalışan sayaç: görev bağlantısı, geçen süre ve durdurma düğmesi. */
export function TimerIndicator() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(myTimerQuery(workspaceId));
  const stop = useStopTimer();
  const timer = data?.timer ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  if (!timer) return null;
  const seconds = Math.max(0, Math.floor((now - Date.parse(timer.startedAt)) / 1000));

  return (
    <div
      role="group"
      aria-label={t('time.runningTimer')}
      className="bg-primary/10 text-primary flex h-8 items-center gap-1.5 rounded-md border border-primary/30 pr-1 pl-2 text-xs"
    >
      <span className="bg-primary size-1.5 animate-pulse rounded-full" aria-hidden />
      <Link
        to="/items/$key"
        params={{ key: timer.itemKey }}
        className="max-w-40 truncate font-medium hover:underline"
        title={timer.itemTitle}
      >
        {timer.itemKey}
      </Link>
      <span className="font-mono tabular-nums">{clock(seconds)}</span>
      <button
        type="button"
        aria-label={t('time.stopTimer')}
        disabled={stop.isPending}
        onClick={() =>
          stop.mutate(undefined, {
            onSuccess: ({ minutes }) => toast.success(t('time.saved', { minutes })),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
        className="hover:bg-primary/20 flex size-6 items-center justify-center rounded"
      >
        <Square className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
