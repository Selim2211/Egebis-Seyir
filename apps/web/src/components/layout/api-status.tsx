import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHealth } from '@/features/health/use-health';
import { cn } from '@/lib/utils';

/** Üst çubukta küçük durum noktası: API ve veritabanı erişilebilirliği. */
export function ApiStatus() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useHealth();

  const state = isPending
    ? 'checking'
    : isError
      ? 'down'
      : data.status === 'ok'
        ? 'up'
        : 'degraded';
  const label = t(`apiStatus.${state}`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          aria-label={label}
          data-state={state}
          className="inline-flex size-8 items-center justify-center"
        >
          <span
            className={cn(
              'size-2.5 rounded-full',
              state === 'up' && 'bg-status-done',
              state === 'degraded' && 'bg-priority-high',
              state === 'down' && 'bg-destructive',
              state === 'checking' && 'animate-pulse bg-muted-foreground',
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
