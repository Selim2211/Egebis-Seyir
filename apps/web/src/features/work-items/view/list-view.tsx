import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { WorkItemSummary } from '@scrum/shared';
import { ChevronRight, CornerDownRight, GripVertical, Unlink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { cn } from '@/lib/utils';
import { ItemOpenLink } from '../detail/item-nav';
import { AssigneeStack, DueCell, EstimateCell, PriorityCell, StatusCell } from './cells';
import { isOverdue } from './cell-utils';
import { GroupHeader, RowMenu, SelectBox } from './row-parts';
import type { ViewProps } from './view-types';
import { VirtualRows } from './virtual-rows';
import type { ViewRow } from './view-state';

/** List görünümü: hiyerarşik veya gruplu satırlar, satır içi durum/öncelik, sanal kaydırma. */
export function ListView(props: ViewProps) {
  const { t } = useTranslation();
  const { rows, allSelected, onSelectAll } = props;
  const hasItems = rows.some((r) => r.kind === 'item');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<WorkItemSummary | null>(null);
  const byId = new Map(
    rows.flatMap((r) => (r.kind === 'item' ? [[r.item.id, r.item] as const] : [])),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const item = byId.get(String(active.id));
    if (!item || !over) return;
    if (over.id === DETACH_ZONE) {
      if (item.parentId) props.onUnnest?.(item);
      return;
    }
    const target = byId.get(String(over.id).replace(DROP_PREFIX, ''));
    if (target && target.id !== item.id && props.canDropOn?.(item, target)) {
      props.onNest?.(item, target);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging(byId.get(String(active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div>
        {hasItems && (
          <div className="text-muted-foreground hidden items-center gap-3 border-b px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase md:flex">
            <SelectBox checked={allSelected} onChange={onSelectAll} label={t('view.selectAll')} />
            <span className="flex-1 pl-6">{t('items.columns.title')}</span>
            <span className="w-32">{t('items.columns.status')}</span>
            <span className="w-20 text-center">{t('items.columns.priority')}</span>
            <span className="w-20">{t('items.columns.assignees')}</span>
            <span className="w-16">{t('items.columns.due')}</span>
            <span className="w-12 text-right">{t('items.columns.estimate')}</span>
            <span className="w-8" />
          </div>
        )}
        <VirtualRows
          rows={rows}
          estimate={44}
          getKey={(row) => (row.kind === 'group' ? `g:${row.id}` : row.key)}
          render={(row) => <RowView row={row} props={props} dragging={dragging} />}
        />
      </div>
      {dragging?.parentId && <DetachZone />}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div
            data-dnd-overlay
            className="bg-card border-primary flex w-max max-w-md items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm shadow-xl"
          >
            <WorkItemTypeIcon type={dragging.type} />
            <span className="text-muted-foreground font-mono text-xs">{dragging.key}</span>
            <span className="truncate font-medium">{dragging.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

const DETACH_ZONE = '__detach';
const DROP_PREFIX = 'drop:';

/** Sürükleme sırasında altta ortada çıkan "Ayır" alanı: alt öğe bırakılınca bağımsız Task olur. */
function DetachZone() {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: DETACH_ZONE });
  return (
    <div
      ref={setNodeRef}
      data-testid="detach-zone"
      className={cn(
        'fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border-2 border-dashed px-8 py-5 text-base font-semibold shadow-2xl transition-colors',
        isOver
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-primary/60 bg-card text-primary',
      )}
    >
      <Unlink className="size-5" aria-hidden />
      {t('dnd.detach')}
    </div>
  );
}

function RowView({
  row,
  props,
  dragging,
}: {
  row: ViewRow;
  props: ViewProps;
  dragging: WorkItemSummary | null;
}) {
  if (row.kind === 'group') {
    return (
      <GroupHeader
        group={row.group}
        collapsed={row.collapsed}
        onToggle={() => props.onToggleGroup(row.id)}
      />
    );
  }
  return (
    <>
      <ItemRow
        item={row.item}
        depth={row.depth}
        children={row.children}
        props={props}
        dragging={dragging}
      />
      {props.addingUnder === row.item.id && (
        <div className="bg-muted/30 border-b" style={{ paddingLeft: 28 + row.depth * 20 }}>
          {props.renderAddChild(row.item)}
        </div>
      )}
    </>
  );
}

function ItemRow({
  item,
  depth,
  children,
  props,
  dragging,
}: {
  item: WorkItemSummary;
  depth: number;
  children: number;
  props: ViewProps;
  dragging: WorkItemSummary | null;
}) {
  const { t } = useTranslation();
  const { cells, labels, selected, collapsedItems } = props;
  const draggable = props.canDrag?.(item) ?? false;
  const {
    setNodeRef: dragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({ id: item.id, disabled: !draggable });
  const droppable =
    dragging !== null && dragging.id !== item.id && (props.canDropOn?.(dragging, item) ?? false);
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: DROP_PREFIX + item.id,
    disabled: !droppable,
  });
  const status = cells.space.statuses.find((s) => s.id === item.statusId);
  const done = status?.category === 'DONE';
  const collapsed = collapsedItems.has(item.id);
  const itemLabels = item.labelIds.flatMap((id) => labels.get(id) ?? []);

  return (
    <div
      ref={dropRef}
      data-item-row={item.key}
      className={cn(
        'group/item hover:bg-accent/50 relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 md:flex-nowrap md:py-1.5',
        selected.has(item.id) && 'bg-primary/5',
        isDragging && 'opacity-40',
        isOver && 'bg-primary/10 ring-primary ring-2 ring-inset',
      )}
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      {draggable && (
        <button
          type="button"
          ref={dragRef}
          {...listeners}
          {...attributes}
          aria-label={t('dnd.handle', { key: item.key })}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 left-0 flex h-7 w-4 -translate-y-1/2 cursor-grab items-center justify-center opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      )}
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 md:basis-auto">
        <SelectBox
          checked={selected.has(item.id)}
          onChange={(value) => props.onSelect(item.id, value)}
          label={t('view.select', { key: item.key })}
        />
        {children > 0 ? (
          <button
            type="button"
            onClick={() => props.onToggleItem(item.id)}
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? 'items.expand' : 'items.collapse', { key: item.key })}
            className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <WorkItemTypeIcon type={item.type} />
        <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.key}</span>
        <ItemOpenLink
          itemKey={item.key}
          className={cn(
            'min-w-0 truncate text-sm hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </ItemOpenLink>
        {itemLabels.slice(0, 2).map((label) => (
          <span
            key={label.id}
            className="hidden shrink-0 rounded-full border px-1.5 text-[11px] sm:inline"
            style={{ borderColor: label.color, color: label.color }}
          >
            {label.name}
          </span>
        ))}
        {item.childCount > 0 && (
          <span className="text-muted-foreground shrink-0 text-xs">
            <CornerDownRight className="mr-0.5 inline size-3" aria-hidden />
            {item.childCount}
          </span>
        )}
      </div>

      <div className="w-32 shrink-0">
        <StatusCell item={item} ctx={cells} />
      </div>
      <div className="flex w-20 shrink-0 justify-center">
        <PriorityCell item={item} ctx={cells} />
      </div>
      <div className="w-20 shrink-0">
        <AssigneeStack item={item} />
      </div>
      <div className="w-16 shrink-0">
        <DueCell item={item} overdue={isOverdue(item, !!done)} />
      </div>
      <div className="w-12 shrink-0 text-right">
        <EstimateCell item={item} ctx={cells} />
      </div>
      <div className="flex w-8 shrink-0 justify-end">
        {cells.canWrite && (
          <RowMenu
            item={item}
            canAddChild={props.canAddChild(item)}
            onAddChild={() => props.onAddChild(item.id)}
            onCopy={() => props.onCopy(item.id)}
            onPromote={props.canPromote(item) ? () => props.onPromote(item) : undefined}
            onArchive={() => props.onArchive(item)}
            onDelete={() => props.onDelete(item)}
          />
        )}
      </div>
    </div>
  );
}
