import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  calendarWeeks,
  daysCovered,
  moveItemDates,
  shiftMonth,
  type SpaceDetail,
  type WorkItemSummary,
  type WorkItemsResponse,
} from '@scrum/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { useCanMove } from '@/features/board/board-hooks';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { useUpdateItem } from '@/features/work-items/queries';
import { todayDay } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';

const MAX_CHIPS = 3;
const SEP = '|';

/**
 * List sayfasının Takvim görünümü (brief §5.8): öğeler başlangıç–bitiş günlerinde görünür,
 * bir güne sürüklenince tarihleri süreyi koruyarak kayar. Tarihsiz öğeler altta listelenir.
 */
export function ListCalendar({
  listId,
  space,
  data,
  archived,
}: {
  listId: string;
  space: SpaceDetail;
  data: WorkItemsResponse;
  archived: boolean;
}) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateItem(listId);
  const canMove = useCanMove(space.permissions, archived);
  const today = todayDay();
  const [month, setMonth] = useState(today.slice(0, 7));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const doneIds = useMemo(
    () => new Set(space.statuses.filter((s) => s.category === 'DONE').map((s) => s.id)),
    [space.statuses],
  );

  const weeks = calendarWeeks(month);
  const byDay = useMemo(() => {
    const map = new Map<string, WorkItemSummary[]>();
    for (const item of data.items) {
      for (const day of daysCovered(item)) map.set(day, [...(map.get(day) ?? []), item]);
    }
    return map;
  }, [data.items]);
  const unscheduled = data.items.filter((i) => i.startDate === null && i.dueDate === null);

  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00`));
  const weekdays = weeks[0]!.map((d) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(
      new Date(`${d.day}T12:00:00`),
    ),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const [itemId, fromDay] = String(active.id).split(SEP) as [string, string];
    const toDay = String(over.id);
    if (fromDay === toDay) return;
    const item = data.items.find((i) => i.id === itemId);
    if (!item) return;
    update.mutate(
      { itemId, body: moveItemDates(item, fromDay, toDay) },
      { onError: (error) => toast.error(errorMessage(error)) },
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="min-w-40 text-lg font-semibold capitalize" aria-live="polite">
          {monthLabel}
        </h2>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={t('calendar.prev')}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={t('calendar.next')}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          {t('calendar.today')}
        </Button>
        <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
          {t('calendar.hint')}
        </span>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          role="grid"
          aria-label={monthLabel}
          className="bg-card overflow-x-auto rounded-lg border"
        >
          <div className="min-w-[44rem]">
            <div role="row" className="text-muted-foreground grid grid-cols-7 border-b text-xs">
              {weekdays.map((name, i) => (
                <div key={i} role="columnheader" className="px-2 py-1.5 font-medium capitalize">
                  {name}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div
                key={week[0]!.day}
                role="row"
                className="grid grid-cols-7 border-b last:border-b-0"
              >
                {week.map(({ day, inMonth }) => (
                  <DayCell
                    key={day}
                    day={day}
                    inMonth={inMonth}
                    isToday={day === today}
                    items={byDay.get(day) ?? []}
                    doneIds={doneIds}
                    canMove={canMove}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </DndContext>

      {unscheduled.length > 0 && (
        <section aria-labelledby="calendar-unscheduled" className="mt-5">
          <h3 id="calendar-unscheduled" className="text-sm font-semibold">
            {t('calendar.unscheduled', { count: unscheduled.length })}
          </h3>
          <ul className="bg-card mt-2 divide-y rounded-lg border">
            {unscheduled.slice(0, 50).map((item) => (
              <li key={item.id}>
                <ItemOpenLink
                  itemKey={item.key}
                  className="hover:bg-accent/50 flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <WorkItemTypeIcon type={item.type} />
                  <span className="text-muted-foreground font-mono text-xs">{item.key}</span>
                  <span className="truncate">{item.title}</span>
                </ItemOpenLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DayCell({
  day,
  inMonth,
  isToday,
  items,
  doneIds,
  canMove,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  items: WorkItemSummary[];
  doneIds: ReadonlySet<string>;
  canMove: (item: WorkItemSummary) => boolean;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: day });
  const shown = items.slice(0, MAX_CHIPS);
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={day}
      data-day={day}
      className={cn(
        'min-h-24 border-r p-1 last:border-r-0',
        !inMonth && 'bg-muted/40 text-muted-foreground',
        isOver && 'bg-primary/10',
      )}
    >
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-xs',
          isToday && 'bg-primary text-primary-foreground font-semibold',
        )}
      >
        {Number(day.slice(8))}
      </span>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {shown.map((item) => (
          <li key={item.id}>
            <Chip item={item} day={day} done={doneIds.has(item.statusId)} canMove={canMove(item)} />
          </li>
        ))}
        {items.length > MAX_CHIPS && (
          <li className="text-muted-foreground px-1 text-[11px]">
            {t('calendar.more', { count: items.length - MAX_CHIPS })}
          </li>
        )}
      </ul>
    </div>
  );
}

function Chip({
  item,
  day,
  done,
  canMove,
}: {
  item: WorkItemSummary;
  day: string;
  done: boolean;
  canMove: boolean;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${item.id}${SEP}${day}`,
    disabled: !canMove,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'bg-accent/70 flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-4',
        canMove && 'cursor-grab',
        done && 'text-muted-foreground line-through',
        isDragging && 'opacity-40',
      )}
    >
      <WorkItemTypeIcon type={item.type} className="size-3 shrink-0" />
      <ItemOpenLink itemKey={item.key} className="min-w-0 flex-1 truncate hover:underline">
        <span aria-label={`${item.key} ${item.title}`}>{item.title}</span>
      </ItemOpenLink>
    </div>
  );
}
