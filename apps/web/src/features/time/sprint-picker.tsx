import type { SprintSummary } from '@scrum/shared';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { sprintChoices } from './sprint-pick';

/**
 * Aranabilir sprint seçici (ADR-132): açılınca son 3 sprint, yazınca tüm sprint'lerde ada göre arama.
 * `null` seçimi "proje geneli" demektir (sprint süzgeci yok).
 */
export function SprintPicker({
  sprints,
  value,
  onChange,
}: {
  sprints: readonly SprintSummary[];
  value: string | null;
  onChange: (sprintId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = sprints.find((s) => s.id === value);
  const choices = sprintChoices(sprints, query);
  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };
  const statusLabel = (status: string) =>
    status === 'ACTIVE'
      ? t('workload.sprintActive')
      : status === 'PLANNED'
        ? t('workload.sprintPlanned')
        : t('workload.sprintDone');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('workload.sprint')}
          data-testid="sprint-picker"
          className="border-input bg-card hover:border-primary/40 flex h-9 min-w-48 items-center gap-2 rounded-md border px-3 text-left text-sm shadow-xs"
        >
          <span className="min-w-0 flex-1 truncate">
            {current ? current.name : t('workload.wholeProject')}
          </span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="relative mb-2">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('workload.searchSprint')}
            aria-label={t('workload.searchSprint')}
            autoFocus
            className="border-input bg-background h-8 w-full rounded-md border pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        {!query && (
          <p className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
            {t('workload.recentSprints')}
          </p>
        )}
        <div
          role="listbox"
          aria-label={t('workload.sprint')}
          className="flex max-h-64 flex-col overflow-y-auto"
        >
          {choices.map((s) => (
            <Option key={s.id} selected={s.id === value} onClick={() => pick(s.id)}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  s.status === 'ACTIVE'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {statusLabel(s.status)}
              </span>
            </Option>
          ))}
          {choices.length === 0 && (
            <p className="text-muted-foreground px-2 py-2 text-sm">{t('workload.noSprint')}</p>
          )}
          <div className="my-1 border-t" />
          <Option selected={value === null} onClick={() => pick(null)}>
            <span className="flex-1">{t('workload.wholeProject')}</span>
          </Option>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        selected ? 'bg-primary/10 font-medium' : 'hover:bg-accent',
      )}
    >
      <Check
        className={cn('size-3.5 shrink-0', selected ? 'text-primary' : 'invisible')}
        aria-hidden
      />
      {children}
    </button>
  );
}
