import { useDraggable } from '@dnd-kit/core';
import type { PointerEventHandler, ReactNode } from 'react';
import type { DragHandleProps } from '@/features/spaces/sortable';
import { dragFromRow } from '@/lib/drag-start';
import { cn } from '@/lib/utils';

/**
 * Backlog sayfasının bırakma alanı (Backlog ya da bir sprint). Hedef, imleç konumundan bulunur
 * (`data-drop-container`); alanlar dnd-kit'e kaydedilmez. Sürükleme sırasında üzerine gelinince
 * `data-drop-over` ile vurgulanır, en başa bırakılacaksa `data-drop-top` ile üst çizgi çıkar.
 */
export function DropContainerView({
  id,
  children,
}: {
  id: string;
  itemIds?: string[];
  enabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-drop-container={id}
      className={cn(
        'min-h-10 transition-colors',
        'data-[drop-over]:bg-primary/[0.05]',
        'data-[drop-top]:shadow-[inset_0_3px_0_0_var(--primary)]',
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sürüklenebilir satır sarmalayıcısı. Satırın tamamı tutulup taşınır (fare ile); tutamak düğmesi
 * klavye ve ekran okuyucu için kalır. Satırdaki bağlantı, düğme ve kutular 6 px'ten az harekette
 * normal tıklanır.
 *
 * Performans: satırlar sıralama bağlamına (useSortable) bağlı değildir; imleç her satıra girdiğinde
 * yüzlerce satır yeniden çizilmez. Hedef vurgusu (`data-drop-state`, `data-drop-after`) sayfadan
 * doğrudan DOM özniteliğiyle verilir.
 */
export function SortableRow({
  id,
  enabled,
  subtask,
  children,
}: {
  id: string;
  enabled: boolean;
  /** Alt öğe satırı: bırakılınca üst öğesinden ayrılır. */
  subtask?: boolean;
  children: (handle: DragHandleProps | null) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: !enabled,
  });
  const { onPointerDown, ...keyboard } = listeners ?? {};
  return (
    <div
      ref={setNodeRef}
      data-row-id={id}
      data-subtask={subtask ? '' : undefined}
      onPointerDown={
        enabled ? dragFromRow(onPointerDown as PointerEventHandler | undefined) : undefined
      }
      className={cn(
        'relative',
        enabled && 'cursor-grab',
        'data-[drop-state=nest]:ring-primary data-[drop-state=nest]:bg-primary/[0.06] data-[drop-state=nest]:rounded-md data-[drop-state=nest]:ring-2 data-[drop-state=nest]:ring-inset',
        'data-[drop-after]:shadow-[inset_0_-3px_0_0_var(--primary)]',
        // Taşınan satırın yerinde boş, kesik çizgili bir yuva kalır.
        isDragging &&
          'border-primary/40 bg-primary/[0.04] rounded-lg border-2 border-dashed [&>*]:invisible',
      )}
    >
      {children(enabled ? { ...attributes, ...keyboard } : null)}
    </div>
  );
}
