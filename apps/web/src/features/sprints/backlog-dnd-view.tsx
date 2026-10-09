import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import type { DragHandleProps } from '@/features/spaces/sortable';
import { cn } from '@/lib/utils';

/**
 * Backlog sayfasının bırakma alanı (Backlog ya da bir sprint). Boşken de bırakılabilir;
 * üzerine gelinince vurgulanır.
 */
export function DropContainerView({
  id,
  itemIds,
  enabled,
  children,
}: {
  id: string;
  itemIds: string[];
  enabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled });
  return (
    <div
      ref={setNodeRef}
      data-drop-container={id}
      className={cn('min-h-10 transition-colors', isOver && 'bg-primary/[0.05]')}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

/** Sürüklenebilir satır sarmalayıcısı; tutamak özelliklerini satıra verir. */
export function SortableRow({
  id,
  enabled,
  nestTarget,
  children,
}: {
  id: string;
  enabled: boolean;
  /** Sürüklenen öğe bu satırın alt öğesi olacaksa vurgulanır. */
  nestTarget: boolean;
  children: (handle: DragHandleProps | null) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative',
        isDragging && 'opacity-40',
        nestTarget && 'ring-primary bg-primary/[0.06] rounded-md ring-2 ring-inset',
      )}
    >
      {children(enabled ? { ...attributes, ...listeners } : null)}
    </div>
  );
}
