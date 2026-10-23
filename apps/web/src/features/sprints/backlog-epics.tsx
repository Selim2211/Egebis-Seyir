import { ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { cn } from '@/lib/utils';

export const EPIC_ATTR = 'data-epic-id';

export interface EpicRowData {
  id: string;
  key: string;
  title: string;
  color: string | null;
  childCount: number;
}

/**
 * Backlog'daki Epic grubu: Epic satırı (sürüklenmez, bırakma hedefidir) ve altında girintili Task'ları.
 * Task'ların alt öğeleri kendi satırlarında açılır (Epic → Task → Sub-Task). Bir sprint'te olan Task'lar
 * burada yalnızca bilgi satırıdır; sprint bölümünde ayrıca durur ve oradan taşınır.
 */
export function EpicGroup({
  epic,
  children,
  inSprint,
}: {
  epic: EpicRowData;
  /** Backlog'daki Task satırları. */
  children: ReactNode;
  inSprint: Array<{ id: string; key: string; title: string; sprintName: string }>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const count = epic.childCount;
  return (
    <div className="border-b last:border-b-0" data-testid="epic-group">
      <div
        {...{ [EPIC_ATTR]: epic.id }}
        className={cn(
          'flex items-center gap-2 border-l-4 px-3 py-2 text-sm transition-colors',
          'bg-muted/40 data-[drop-state=nest]:ring-primary data-[drop-state=nest]:bg-primary/[0.08] data-[drop-state=nest]:ring-2 data-[drop-state=nest]:ring-inset',
        )}
        style={{ borderLeftColor: epic.color ?? 'var(--primary)' }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={t(open ? 'backlog.collapseEpic' : 'backlog.expandEpic', { key: epic.key })}
          className="hover:bg-muted flex size-5 shrink-0 items-center justify-center rounded"
        >
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>
        <WorkItemTypeIcon type="EPIC" />
        <span className="text-muted-foreground shrink-0 font-mono text-xs">{epic.key}</span>
        <ItemOpenLink
          itemKey={epic.key}
          className="min-w-0 flex-1 truncate font-semibold hover:underline"
        >
          {epic.title}
        </ItemOpenLink>
        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
          {t('backlog.epicTasks', { count })}
        </span>
      </div>
      {open && (
        <div className="pl-5">
          {children}
          {inSprint.map((x) => (
            <div
              key={x.id}
              className="text-muted-foreground flex items-center gap-2 border-t px-3 py-1.5 pl-9 text-sm"
            >
              <WorkItemTypeIcon type="TASK" />
              <span className="shrink-0 font-mono text-xs">{x.key}</span>
              <ItemOpenLink itemKey={x.key} className="min-w-0 flex-1 truncate hover:underline">
                {x.title}
              </ItemOpenLink>
              <span className="bg-muted shrink-0 rounded-full px-2 py-0.5 text-[11px]">
                {x.sprintName}
              </span>
            </div>
          ))}
          {count === 0 && inSprint.length === 0 && (
            <p className="text-muted-foreground px-3 py-2 pl-9 text-xs">{t('backlog.epicEmpty')}</p>
          )}
        </div>
      )}
    </div>
  );
}
