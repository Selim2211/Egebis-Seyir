import {
  defaultDropAnimationSideEffects,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { WorkItemSummary } from '@scrum/shared';
import { Ban, ChevronRight, CornerDownRight, GripVertical, Unlink } from 'lucide-react';
import { type PointerEventHandler, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { StatusBadge, WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { statusName } from '@/lib/default-names';
import { cn } from '@/lib/utils';
import { ItemOpenLink } from '../detail/item-nav';
import { AssigneeStack, DueCell, EstimateCell, PriorityCell, StatusCell } from './cells';
import { isOverdue } from './cell-utils';
import { GroupHeader, RowMenu, SelectBox } from './row-parts';
import type { ViewProps } from './view-types';
import { VirtualRows } from './virtual-rows';
import type { ViewRow } from './view-state';

/** Sürüklenen öğenin şu an neyin üstünde olduğu: hedef Task, Ayır alanı veya geçersiz satır. */
type DragIntent =
  { kind: 'nest'; target: WorkItemSummary } | { kind: 'blocked' } | { kind: 'detach' } | null;

/** Geçersiz yere bırakınca satır yerine süzülerek geri döner (masaüstü klasörü gibi). */
const RETURN_ANIMATION: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } }),
};

/** List görünümü: hiyerarşik veya gruplu satırlar, satır içi durum/öncelik, sanal kaydırma. */
export function ListView(props: ViewProps) {
  const { t } = useTranslation();
  const { rows, allSelected, onSelectAll } = props;
  const hasItems = rows.some((r) => r.kind === 'item');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const [dragging, setDragging] = useState<WorkItemSummary | null>(null);
  const [ghostWidth, setGhostWidth] = useState<number>(0);
  const [overId, setOverId] = useState<string | null>(null);
  const byId = new Map(
    rows.flatMap((r) => (r.kind === 'item' ? [[r.item.id, r.item] as const] : [])),
  );

  const intentFor = (id: string | null): DragIntent => {
    if (!dragging || !id) return null;
    if (id === DETACH_ZONE) return dragging.parentId ? { kind: 'detach' } : null;
    const target = byId.get(id.replace(DROP_PREFIX, ''));
    if (!target || target.id === dragging.id) return null;
    return props.canDropOn?.(dragging, target) ? { kind: 'nest', target } : { kind: 'blocked' };
  };
  const intent = intentFor(overId);

  const reset = () => {
    setDragging(null);
    setOverId(null);
  };
  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging(byId.get(String(active.id)) ?? null);
    setGhostWidth(active.rect.current.initial?.width ?? 0);
  };
  const onDragEnd = ({ over }: DragEndEvent) => {
    const item = dragging;
    const result = intentFor(over ? String(over.id) : null);
    reset();
    if (!item || !result) return;
    if (result.kind === 'detach') props.onUnnest?.(item);
    if (result.kind === 'nest') props.onNest?.(item, result.target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div className={cn(dragging && 'select-none')}>
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
      {/* Geçerli bir hedefe bırakınca onay penceresi açılır; geri dönüş animasyonu yalnızca iptalde. */}
      {createPortal(
        <DragOverlay
          dropAnimation={intent && intent.kind !== 'blocked' ? null : RETURN_ANIMATION}
          zIndex={TOP_LAYER}
        >
          {dragging && (
            <DragGhost item={dragging} width={ghostWidth} intent={intent} props={props} />
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/** Bildirim baloncuklarının (sonner) da üstünde kalır. */
const TOP_LAYER = 1000000001;
const DETACH_ZONE = '__detach';
const DROP_PREFIX = 'drop:';

/** İmlece yapışan, havaya kaldırılmış satır kopyası; altında bırakınca ne olacağı yazar. */
function DragGhost({
  item,
  width,
  intent,
  props,
}: {
  item: WorkItemSummary;
  width: number;
  intent: DragIntent;
  props: ViewProps;
}) {
  const { t } = useTranslation();
  const status = props.cells.space.statuses.find((s) => s.id === item.statusId);
  return (
    <div
      data-dnd-overlay
      className={cn(
        'dnd-lift bg-card/95 ring-primary/30 overflow-hidden rounded-xl shadow-2xl ring-1 backdrop-blur',
        intent?.kind === 'blocked' ? 'cursor-not-allowed' : 'cursor-grabbing',
      )}
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
        {status && (
          <StatusBadge
            category={status.category}
            label={statusName(status.name)}
            color={status.color}
          />
        )}
      </div>
      {intent && (
        <div
          data-testid="dnd-intent"
          className={cn(
            'flex items-center gap-1.5 border-t px-3 py-1.5 text-xs font-semibold',
            intent.kind === 'blocked'
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {intent.kind === 'nest' && (
            <>
              <CornerDownRight className="size-3.5" aria-hidden />
              {t('dnd.moveUnder', { key: intent.target.key })}
            </>
          )}
          {intent.kind === 'detach' && (
            <>
              <Unlink className="size-3.5" aria-hidden />
              {t('dnd.detachShort')}
            </>
          )}
          {intent.kind === 'blocked' && (
            <>
              <Ban className="size-3.5" aria-hidden />
              {t('dnd.cannotDrop')}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Sürükleme sırasında ekranın altında ortada çıkan "Ayır" alanı: alt öğe bırakılınca bağımsız Task olur. */
function DetachZone() {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: DETACH_ZONE });
  // Portal: kaydırma/animasyon kapsayıcıları fixed konumu bozmasın, alan hep ekranın altında dursun.
  return createPortal(
    <div
      ref={setNodeRef}
      data-testid="detach-zone"
      className={cn(
        'dnd-rise fixed bottom-4 left-1/2 z-[1000000000] flex -translate-x-1/2 items-center gap-2.5 rounded-full border-2 border-dashed px-7 py-3.5 text-sm font-semibold shadow-2xl backdrop-blur transition-all duration-150',
        isOver
          ? 'border-primary bg-primary text-primary-foreground scale-105'
          : 'border-primary/50 bg-card/90 text-primary',
      )}
    >
      <Unlink className="size-4.5" aria-hidden />
      {t('dnd.detach')}
    </div>,
    document.body,
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
  // Sürükleme sırasında her satır hedef olur; geçersiz olanlar "bırakılamaz" der.
  const target = dragging !== null && dragging.id !== item.id;
  const valid = target && (props.canDropOn?.(dragging, item) ?? false);
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: DROP_PREFIX + item.id,
    disabled: !target,
  });
  const status = cells.space.statuses.find((s) => s.id === item.statusId);
  const done = status?.category === 'DONE';
  const collapsed = collapsedItems.has(item.id);
  const itemLabels = item.labelIds.flatMap((id) => labels.get(id) ?? []);
  const nestHere = isOver && valid;

  return (
    <div
      ref={(node) => {
        dropRef(node);
        dragRef(node);
      }}
      // Satırın tamamı tutulup taşınır; klavye ile sürükleme yalnızca tutamaçtan.
      onPointerDown={draggable ? (listeners?.onPointerDown as PointerEventHandler) : undefined}
      data-item-row={item.key}
      data-drop-state={nestHere ? 'nest' : isOver && target ? 'blocked' : undefined}
      className={cn(
        'group/item relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 transition-[background-color,opacity] duration-150 md:flex-nowrap md:py-1.5',
        !dragging && 'hover:bg-accent/50',
        selected.has(item.id) && 'bg-primary/5',
        draggable && !dragging && 'cursor-grab',
        // Taşınan satırın yerinde boş, kesik çizgili bir yuva kalır.
        isDragging &&
          'border-primary/40 bg-primary/[0.04] rounded-lg border-2 border-dashed [&>*]:invisible',
        target && !valid && 'opacity-45',
        nestHere && 'bg-primary/10 ring-primary ring-2 ring-inset',
      )}
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      {nestHere && (
        <>
          <span className="bg-primary absolute inset-y-1 left-0 w-1 rounded-r-full" aria-hidden />
          <span
            className="border-primary/60 pointer-events-none absolute right-3 bottom-0.5 h-0 border-t-2 border-dashed"
            style={{ left: 12 + (depth + 1) * 20 + 28 }}
            aria-hidden
          />
          <span className="dnd-rise bg-primary text-primary-foreground pointer-events-none absolute top-1/2 right-12 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-md">
            <CornerDownRight className="size-3.5" aria-hidden />
            {t('dnd.dropHint')}
          </span>
        </>
      )}
      {draggable && (
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={t('dnd.handle', { key: item.key })}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 left-0 flex h-7 w-4 -translate-y-1/2 cursor-grab items-center justify-center opacity-40 group-hover/item:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
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
