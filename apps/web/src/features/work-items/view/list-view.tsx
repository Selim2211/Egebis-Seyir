import {
  defaultDropAnimationSideEffects,
  DndContext,
  type DragStartEvent,
  DragOverlay,
  type DropAnimation,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { WorkItemSummary } from '@scrum/shared';
import { Ban, ChevronRight, CornerDownRight, GripVertical, Unlink } from 'lucide-react';
import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { StatusBadge, WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { statusName } from '@/lib/default-names';
import { dragFromRow } from '@/lib/drag-start';
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

/**
 * Sürükleme niyeti için küçük bir dış depo. Niyet her satır geçişinde değişir; React durumunda
 * tutulsaydı liste ve yüzlerce satır her seferinde yeniden çizilirdi. Yalnızca kopya (ghost) ve
 * Ayır alanı bu depoya abone olur.
 */
function createIntentStore() {
  let value: DragIntent = null;
  const listeners = new Set<() => void>();
  return {
    get: (): DragIntent => value,
    set: (next: DragIntent): void => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type IntentStore = ReturnType<typeof createIntentStore>;
const useIntent = (store: IntentStore) => useSyncExternalStore(store.subscribe, store.get);

const DETACH_ATTR = 'data-detach-zone';

/**
 * List görünümü: hiyerarşik veya gruplu satırlar, satır içi durum/öncelik, sanal kaydırma.
 *
 * Sürükle-bırak performansı: satırların her biri bırakma alanı olarak kaydedilirse (useDroppable)
 * imleç her satıra girdiğinde yüzlerce satır yeniden çizilir. Bunun yerine hedef, imleç konumundan
 * (elementsFromPoint) bulunur ve vurgu doğrudan DOM özniteliğiyle verilir; satırlar yeniden çizilmez.
 */
export function ListView(props: ViewProps) {
  const { t } = useTranslation();
  const { rows, allSelected, onSelectAll } = props;
  const hasItems = rows.some((r) => r.kind === 'item');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<WorkItemSummary | null>(null);
  const [ghostWidth, setGhostWidth] = useState<number>(0);
  // Yalnızca "bırakılabilir mi?" değişince (nadiren) güncellenir; bırakma animasyonunu seçer.
  const [dropOk, setDropOk] = useState(false);
  const [store] = useState(createIntentStore);
  const listRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const marked = useRef<HTMLElement | null>(null);
  const byKey = new Map(
    rows.flatMap((r) => (r.kind === 'item' ? [[r.item.key, r.item] as const] : [])),
  );

  /** İmlecin altındaki satır ya da Ayır alanından sürükleme niyetini çıkarır. */
  const intentAt = (item: WorkItemSummary, x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest(`[${DETACH_ATTR}]`)) {
        return { intent: item.parentId ? ({ kind: 'detach' } as const) : null, row: null };
      }
      const row = el.closest<HTMLElement>('[data-item-row]');
      if (!row) continue;
      const target = byKey.get(row.dataset.itemRow ?? '');
      if (!target || target.id === item.id) return { intent: null, row: null };
      return {
        intent: props.canDropOn?.(item, target)
          ? ({ kind: 'nest', target } as const)
          : ({ kind: 'blocked' } as const),
        row,
      };
    }
    return { intent: null, row: null };
  };

  const mark = (row: HTMLElement | null, state: 'nest' | 'blocked' | null) => {
    if (marked.current && marked.current !== row) delete marked.current.dataset.dropState;
    if (row && state) row.dataset.dropState = state;
    marked.current = row && state ? row : null;
  };

  /** Hedef olamayacak satırları (Epic, Bug, kendi alt ağacı…) bir kez soluklaştırır. */
  const markInvalidRows = (item: WorkItemSummary | null) => {
    for (const el of listRef.current?.querySelectorAll<HTMLElement>('[data-item-row]') ?? []) {
      const target = byKey.get(el.dataset.itemRow ?? '');
      const invalid = item && target && target.id !== item.id && !props.canDropOn?.(item, target);
      if (invalid) el.dataset.dropInvalid = '';
      else delete el.dataset.dropInvalid;
    }
  };

  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const resolve = () => {
      frame = 0;
      const { intent, row } = intentAt(dragging, pointer.current.x, pointer.current.y);
      store.set(intent);
      mark(row, intent?.kind === 'nest' || intent?.kind === 'blocked' ? intent.kind : null);
      setDropOk(intent !== null && intent.kind !== 'blocked');
    };
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(resolve);
    };
    markInvalidRows(dragging);
    resolve();
    document.addEventListener('pointermove', move, { passive: true });
    return () => {
      document.removeEventListener('pointermove', move);
      if (frame) cancelAnimationFrame(frame);
      mark(null, null);
      markInvalidRows(null);
    };
    // Yalnızca sürükleme başlayıp bittiğinde kurulur/kaldırılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const reset = () => {
    setDragging(null);
    store.set(null);
  };
  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const e = activatorEvent as PointerEvent;
    pointer.current = { x: e.clientX, y: e.clientY };
    setDragging(byKey.get(String(active.id)) ?? null);
    setGhostWidth(active.rect.current.initial?.width ?? 0);
  };
  const onDragEnd = () => {
    const item = dragging;
    // Bırakma anındaki gerçek imleç konumu (kare beklemeden).
    const result = item ? intentAt(item, pointer.current.x, pointer.current.y).intent : null;
    reset();
    if (!item || !result) return;
    if (result.kind === 'detach') props.onUnnest?.(item);
    if (result.kind === 'nest') props.onNest?.(item, result.target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={() => []}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div ref={listRef} className={cn(dragging && 'cursor-grabbing select-none')}>
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
          render={(row) => <RowView row={row} props={props} />}
        />
      </div>
      {dragging?.parentId && <DetachZone store={store} />}
      {createPortal(
        <DragOverlay
          dropAnimation={dropOk ? null : RETURN_ANIMATION}
          zIndex={TOP_LAYER}
          style={{ pointerEvents: 'none' }}
        >
          {dragging && <DragGhost item={dragging} width={ghostWidth} store={store} props={props} />}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/** Bildirim baloncuklarının (sonner) da üstünde kalır. */
const TOP_LAYER = 1000000001;

/** İmlece yapışan, havaya kaldırılmış satır kopyası; altında bırakınca ne olacağı yazar. */
function DragGhost({
  item,
  width,
  store,
  props,
}: {
  item: WorkItemSummary;
  width: number;
  store: IntentStore;
  props: ViewProps;
}) {
  const { t } = useTranslation();
  const intent = useIntent(store);
  const status = props.cells.space.statuses.find((s) => s.id === item.statusId);
  return (
    <div
      data-dnd-overlay
      className={cn(
        'dnd-lift bg-card ring-primary/30 overflow-hidden rounded-xl shadow-xl ring-1',
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
function DetachZone({ store }: { store: IntentStore }) {
  const { t } = useTranslation();
  const isOver = useIntent(store)?.kind === 'detach';
  // Portal: kaydırma/animasyon kapsayıcıları fixed konumu bozmasın, alan hep ekranın altında dursun.
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

/** Satır: ListView sürükleme durumuyla yeniden çizilse bile girdileri değişmedikçe yeniden çizilmez. */
const RowView = memo(function RowView({ row, props }: { row: ViewRow; props: ViewProps }) {
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
      <ItemRow item={row.item} depth={row.depth} children={row.children} props={props} />
      {props.addingUnder === row.item.id && (
        <div className="bg-muted/30 border-b" style={{ paddingLeft: 28 + row.depth * 20 }}>
          {props.renderAddChild(row.item)}
        </div>
      )}
    </>
  );
});

function ItemRow({
  item,
  depth,
  children,
  props,
}: {
  item: WorkItemSummary;
  depth: number;
  children: number;
  props: ViewProps;
}) {
  const { t } = useTranslation();
  const { cells, labels, selected, collapsedItems } = props;
  const draggable = props.canDrag?.(item) ?? false;
  const {
    setNodeRef: dragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({ id: item.key, disabled: !draggable });
  const status = cells.space.statuses.find((s) => s.id === item.statusId);
  const done = status?.category === 'DONE';
  const collapsed = collapsedItems.has(item.id);
  const itemLabels = item.labelIds.flatMap((id) => labels.get(id) ?? []);

  return (
    <div
      ref={dragRef}
      // Satırın tamamı tutulup taşınır; klavye ile sürükleme yalnızca tutamaçtan.
      onPointerDown={
        draggable
          ? dragFromRow(listeners?.onPointerDown as React.PointerEventHandler | undefined)
          : undefined
      }
      data-item-row={item.key}
      // Sürükleme sırasında hedef vurgusu ve soluklaşma doğrudan DOM özniteliğiyle verilir
      // (data-drop-state / data-drop-invalid): satırlar yeniden çizilmez.
      className={cn(
        'group/item hover:bg-accent/50 relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 md:flex-nowrap md:py-1.5',
        'data-[drop-invalid]:opacity-45',
        'data-[drop-state=nest]:bg-primary/10 data-[drop-state=nest]:ring-primary data-[drop-state=nest]:ring-2 data-[drop-state=nest]:ring-inset',
        selected.has(item.id) && 'bg-primary/5',
        draggable && 'cursor-grab',
        // Taşınan satırın yerinde boş, kesik çizgili bir yuva kalır.
        isDragging &&
          'border-primary/40 bg-primary/[0.04] rounded-lg border-2 border-dashed [&>*]:invisible',
      )}
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      <span
        className="bg-primary pointer-events-none absolute inset-y-1 left-0 hidden w-1 rounded-r-full group-data-[drop-state=nest]/item:block"
        aria-hidden
      />
      <span className="dnd-rise bg-primary text-primary-foreground pointer-events-none absolute top-1/2 right-12 z-10 hidden -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-md group-data-[drop-state=nest]/item:flex">
        <CornerDownRight className="size-3.5" aria-hidden />
        {t('dnd.dropHint')}
      </span>
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
