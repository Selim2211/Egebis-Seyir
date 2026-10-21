import type { WorkItemType } from '@scrum/shared';
import { ArrowRight, CornerDownRight, GripVertical, Unlink } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { cn } from '@/lib/utils';
import { DETACH_ATTR, type IntentStore } from './backlog-dnd';

const useIntent = (store: IntentStore) => useSyncExternalStore(store.subscribe, store.get);

/** Sürüklenen öğenin kopyası için gereken alanlar (üst düzey satır ya da alt öğe). */
export interface DraggedItem {
  id: string;
  key: string;
  title: string;
  type: WorkItemType;
  parentId: string | null;
  childCount: number;
}

/** İmlece yapışan, havaya kaldırılmış satır kopyası (Görevler listesindeki gibi). */
export function BacklogGhost({
  item,
  width,
  store,
}: {
  item: DraggedItem;
  width: number;
  store: IntentStore;
}) {
  const { t } = useTranslation();
  const intent = useIntent(store);
  return (
    <div
      data-dnd-overlay
      className="dnd-lift bg-card ring-primary/30 cursor-grabbing overflow-hidden rounded-xl shadow-xl ring-1"
      style={{ width: width ? Math.min(Math.max(width, 320), 720) : undefined }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 text-sm">
        <GripVertical className="text-primary size-4 shrink-0" aria-hidden />
        <WorkItemTypeIcon type={item.type} />
        <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.key}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
        {item.childCount > 0 && (
          <span className="text-muted-foreground shrink-0 text-xs">
            <CornerDownRight className="mr-0.5 inline size-3" aria-hidden />
            {item.childCount}
          </span>
        )}
      </div>
      {intent && (
        <div
          data-testid="dnd-intent"
          className={cn(
            'flex items-center gap-1.5 border-t px-3 py-1.5 text-xs font-semibold',
            intent.kind === 'move'
              ? 'bg-muted text-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {intent.kind === 'nest' && (
            <>
              <CornerDownRight className="size-3.5" aria-hidden />
              {t('dnd.moveUnder', { key: intent.targetKey })}
            </>
          )}
          {intent.kind === 'detach' && (
            <>
              <Unlink className="size-3.5" aria-hidden />
              {t('dnd.detachShort')}
            </>
          )}
          {intent.kind === 'move' && (
            <>
              <ArrowRight className="size-3.5" aria-hidden />
              {intent.label}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Alt öğe sürüklenirken ekranın altında çıkan "Ayır" alanı: bırakılınca bağımsız Task olur. */
export function DetachZone({ store }: { store: IntentStore }) {
  const { t } = useTranslation();
  const isOver = useIntent(store)?.kind === 'detach';
  return createPortal(
    <div
      {...{ [DETACH_ATTR]: '' }}
      data-testid="detach-zone"
      className={cn(
        'dnd-rise fixed bottom-4 left-1/2 z-[1000000000] flex -translate-x-1/2 items-center gap-2.5 rounded-full border-2 border-dashed px-7 py-3.5 text-sm font-semibold shadow-xl transition-colors duration-150',
        isOver
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-primary/50 bg-card text-primary',
      )}
    >
      <Unlink className="size-4.5" aria-hidden />
      {t('dnd.detach')}
    </div>,
    document.body,
  );
}
