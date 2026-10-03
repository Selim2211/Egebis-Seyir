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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/user-avatar';
import { PriorityIcon } from '@/components/work-item/work-item-visuals';
import { cn } from '@/lib/utils';
import { BoardCard } from './board-card';
import {
  type BoardLane,
  type BoardStatus,
  buildBoard,
  columnTotals,
  type Swimlane,
} from './board-model';

const CELL_SEPARATOR = '|';
const COLUMN_MIN_REM = 15;

/**
 * Kanban panosu (brief §5.8, §5.9): sütunlar = durumlar, kart sürükleyince durum değişir.
 * Satır (swimlane) değiştirmek durumu değiştirmez; yalnızca sütun önemlidir.
 */
export function BoardView({
  items,
  statuses,
  swimlane,
  epicTitles,
  canMove,
  onStatus,
  showPoints,
}: {
  items: readonly WorkItemSummary[];
  statuses: readonly BoardStatus[];
  swimlane: Swimlane;
  epicTitles: ReadonlyMap<string, string>;
  canMove: (item: WorkItemSummary) => boolean;
  onStatus: (itemId: string, statusId: string) => void;
  /** Sütun başlığında toplam puan gösterilsin mi (sprint panosu). */
  showPoints?: boolean;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const lanes = useMemo(
    () => buildBoard(items, statuses, swimlane, epicTitles),
    [items, statuses, swimlane, epicTitles],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const active = activeId ? byId.get(activeId) : undefined;

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    const item = byId.get(String(dragged.id));
    const target = over ? String(over.id).split(CELL_SEPARATOR)[1] : undefined;
    if (item && target && target !== item.statusId) onStatus(item.id, target);
  };

  const columns = `repeat(${statuses.length}, minmax(${COLUMN_MIN_REM}rem, 1fr))`;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active: a }) => setActiveId(String(a.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="overflow-x-auto px-4 pb-6 sm:px-6">
        <div
          className="grid gap-x-3"
          style={{
            gridTemplateColumns: columns,
            minWidth: `${statuses.length * COLUMN_MIN_REM}rem`,
          }}
        >
          {statuses.map((status) => {
            const total = columnTotals(lanes, status.id);
            return (
              <div
                key={status.id}
                className="bg-background sticky top-0 z-10 flex items-center gap-2 border-b py-2 text-sm"
              >
                <span className="size-2 rounded-full" style={{ background: status.color }} />
                <h2 className="font-semibold">{status.name}</h2>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {total.count}
                  {showPoints && ` · ${t('board.points', { points: total.points })}`}
                </span>
              </div>
            );
          })}

          {lanes.map((lane) => (
            <LaneRows
              key={lane.id}
              lane={lane}
              statuses={statuses}
              showHeader={swimlane !== 'none'}
              canMove={canMove}
              onStatus={onStatus}
              activeId={activeId}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {active && <BoardCard item={active} statuses={statuses} canMove overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function LaneRows({
  lane,
  statuses,
  showHeader,
  canMove,
  onStatus,
  activeId,
}: {
  lane: BoardLane<WorkItemSummary>;
  statuses: readonly BoardStatus[];
  showHeader: boolean;
  canMove: (item: WorkItemSummary) => boolean;
  onStatus: (itemId: string, statusId: string) => void;
  activeId: string | null;
}) {
  return (
    <>
      {showHeader && <LaneHeader lane={lane} span={statuses.length} />}
      {statuses.map((status) => (
        <Cell
          key={status.id}
          laneId={lane.id}
          status={status}
          items={lane.cells.get(status.id) ?? []}
          statuses={statuses}
          canMove={canMove}
          onStatus={onStatus}
          activeId={activeId}
        />
      ))}
    </>
  );
}

function LaneHeader({ lane, span }: { lane: BoardLane<WorkItemSummary>; span: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="bg-muted/50 mt-3 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium"
      style={{ gridColumn: `span ${span}` }}
    >
      {lane.kind === 'assignee' && lane.userId && (
        <UserAvatar
          id={lane.userId}
          name={lane.title ?? ''}
          size={20}
          avatarVersion={lane.avatarVersion}
        />
      )}
      {lane.kind === 'priority' && lane.priority && <PriorityIcon priority={lane.priority} />}
      <span>
        {lane.kind === 'priority' && lane.priority
          ? t(`priority.${lane.priority}`)
          : lane.kind === 'unassigned'
            ? t('board.unassigned')
            : lane.kind === 'noEpic'
              ? t('board.noEpic')
              : lane.title}
      </span>
      <span className="text-muted-foreground text-xs font-normal tabular-nums">{lane.count}</span>
    </div>
  );
}

function Cell({
  laneId,
  status,
  items,
  statuses,
  canMove,
  onStatus,
  activeId,
}: {
  laneId: string;
  status: BoardStatus;
  items: WorkItemSummary[];
  statuses: readonly BoardStatus[];
  canMove: (item: WorkItemSummary) => boolean;
  onStatus: (itemId: string, statusId: string) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${laneId}${CELL_SEPARATOR}${status.id}` });
  return (
    <div
      ref={setNodeRef}
      data-status-id={status.id}
      className={cn(
        'flex min-h-24 flex-col gap-2 rounded-md py-2',
        status.category === 'DONE' && 'bg-emerald-50/50 dark:bg-emerald-500/5',
        isOver && 'bg-accent/60 ring-primary/40 ring-2',
      )}
    >
      {items.map((item) => (
        <DraggableCard
          key={item.id}
          item={item}
          statuses={statuses}
          canMove={canMove(item)}
          onStatus={onStatus}
          dragging={activeId === item.id}
        />
      ))}
    </div>
  );
}

function DraggableCard({
  item,
  statuses,
  canMove,
  onStatus,
  dragging,
}: {
  item: WorkItemSummary;
  statuses: readonly BoardStatus[];
  canMove: boolean;
  onStatus: (itemId: string, statusId: string) => void;
  dragging: boolean;
}) {
  const { setNodeRef, listeners } = useDraggable({ id: item.id, disabled: !canMove });
  return (
    <div ref={setNodeRef} {...listeners}>
      <BoardCard
        item={item}
        statuses={statuses}
        canMove={canMove}
        onStatus={onStatus}
        dragging={dragging}
      />
    </div>
  );
}
