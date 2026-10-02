import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes, ReactNode } from 'react';
import { restrictToVerticalAxis } from './dnd-modifiers';

/** Sürükleme tutamacına verilecek özellikler (klavye ile de sıralanabilir). */
export type DragHandleProps = HTMLAttributes<HTMLElement>;

/**
 * Tek ebeveyn içinde dikey sıralama (ADR-014). Bırakınca taşınan öğe ve
 * önündeki kardeşin id'si bildirilir (`afterId = null` → en başa).
 */
export function SortableGroup<T extends { id: string }>({
  items,
  enabled,
  onReorder,
  children,
}: {
  items: T[];
  enabled: boolean;
  onReorder: (id: string, afterId: string | null, reordered: T[]) => void;
  children: (item: T, handle: DragHandleProps | null) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!enabled) return <>{items.map((item) => children(item, null))}</>;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(items, from, to);
    onReorder(String(active.id), reordered[to - 1]?.id ?? null, reordered);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableItem key={item.id} id={item.id}>
            {(handle) => children(item, handle)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: (handle: DragHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}
