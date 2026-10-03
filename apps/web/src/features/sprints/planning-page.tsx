import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  averageVelocity,
  SPACE_PERMISSIONS as S,
  type SprintSummary,
  type WorkItemRow,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NativeSelect } from '@/components/form';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { BacklogRow } from './backlog-row';
import { capacityOf } from './capacity';
import { backlogQuery, sprintQuery, sprintsQuery, useMoveBacklogItems } from './queries';
import { SprintActions } from './sprint-actions';
import { ScrumTabs } from './scrum-tabs';

const BACKLOG_PANE = 'pane:backlog';
const SPRINT_PANE = 'pane:sprint';

/**
 * Sprint Planning (brief Akış C): solda Backlog, sağda seçili sprint. Öğeler iki bölme arasında
 * sürüklenir; toplam puan, son sprint'lerin ortalama velocity'sine göre kapasite göstergesinde izlenir.
 */
export function PlanningPage({
  spaceId,
  sprintId,
  onSprint,
}: {
  spaceId: string;
  sprintId: string | undefined;
  onSprint: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const backlog = useQuery(backlogQuery(workspaceId, spaceId));
  const all = useQuery(sprintsQuery(workspaceId, spaceId));
  const move = useMoveBacklogItems(spaceId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scopeChange, setScopeChange] = useState<{
    itemId: string;
    afterId: string | null;
    adding: boolean;
  } | null>(null);

  const open = useMemo(() => backlog.data?.sprints ?? [], [backlog.data]);
  const selected =
    open.find((s) => s.id === sprintId) ??
    open.find((s) => s.status === 'PLANNED') ??
    open.find((s) => s.status === 'ACTIVE');
  const detail = useQuery({ ...sprintQuery(workspaceId, selected?.id ?? ''), enabled: !!selected });

  const backlogItems = useMemo(() => backlog.data?.items ?? [], [backlog.data]);
  const sprintItems = useMemo(() => detail.data?.items ?? [], [detail.data]);
  const epicTitles = useMemo(
    () => new Map((backlog.data?.epics ?? []).map((e) => [e.id, e.title])),
    [backlog.data],
  );
  const velocity = useMemo(() => averageVelocity(all.data?.sprints ?? []), [all.data]);

  if (space.isPending || backlog.isPending) return <LoadingState />;
  if (space.isError || backlog.isError) return <NotFoundState />;

  const perms = space.data.permissions;
  const canPlan = perms.includes(S.SPRINT_PLAN) && !space.data.archived;
  const dragging = [...backlogItems, ...sprintItems].find((i) => i.id === activeId);

  const send = (itemId: string, target: SprintSummary | null, afterId: string | null) =>
    move.mutate(
      { itemIds: [itemId], sprintId: target?.id ?? null, afterId },
      { onError: (error) => toast.error(errorMessage(error)) },
    );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || !selected) return;
    const id = String(active.id);
    const fromSprint = sprintItems.some((i) => i.id === id);
    const overId = String(over.id);
    const toSprint =
      overId === SPRINT_PANE
        ? true
        : overId === BACKLOG_PANE
          ? false
          : sprintItems.some((i) => i.id === overId);
    const source = fromSprint ? sprintItems : backlogItems;
    const target = toSprint ? sprintItems : backlogItems;

    let afterId: string | null;
    if (fromSprint === toSprint) {
      if (overId === id || overId === SPRINT_PANE || overId === BACKLOG_PANE) return;
      const from = source.findIndex((i) => i.id === id);
      const to = source.findIndex((i) => i.id === overId);
      afterId = arrayMove(source, from, to)[to - 1]?.id ?? null;
    } else if (overId === SPRINT_PANE || overId === BACKLOG_PANE) {
      afterId = target.at(-1)?.id ?? null; // bölmenin sonuna
    } else {
      const index = target.findIndex((i) => i.id === overId);
      afterId = target[index - 1]?.id ?? null; // hedef öğenin önüne
    }

    // Aktif sprint'e ekleme/çıkarma kapsam değişikliğidir; onay istenir (brief §6.1.4).
    const crossing = fromSprint !== toSprint;
    if (crossing && selected.status === 'ACTIVE') {
      setScopeChange({ itemId: id, afterId, adding: toSprint });
      return;
    }
    send(id, toSprint ? selected : null, afterId);
  };

  const capacity = capacityOf(detail.data?.sprint.points ?? 0, velocity);

  return (
    <ItemNavContext.Provider value={(key) => void navigate({ to: '/items/$key', params: { key } })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={perms.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="planning" />
      </ContainerHeader>

      {!selected ? (
        <p className="text-muted-foreground mx-auto max-w-md px-4 py-16 text-center text-sm">
          {t('planning.noSprint')}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveId(String(active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-2">
            <Pane
              id={BACKLOG_PANE}
              title={t('backlog.title')}
              summary={t('planning.backlogSummary', { count: backlogItems.length })}
              items={backlogItems}
              epicTitles={epicTitles}
              canPlan={canPlan}
              empty={t('planning.backlogEmpty')}
            />
            <Pane
              id={SPRINT_PANE}
              title={selected.name}
              summary={t('sprints.totals', {
                count: detail.data?.sprint.itemCount ?? 0,
                points: detail.data?.sprint.points ?? 0,
              })}
              items={sprintItems}
              epicTitles={epicTitles}
              canPlan={canPlan}
              empty={t('planning.sprintEmpty')}
              header={
                <div className="flex flex-col gap-2 border-b px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                      value={selected.id}
                      onChange={(e) => onSprint(e.target.value)}
                      aria-label={t('board.sprint')}
                      className="h-8 max-w-52"
                    >
                      {open.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {t(`sprints.status.${s.status}`)}
                        </option>
                      ))}
                    </NativeSelect>
                    <span className="text-muted-foreground text-xs">
                      {formatShortDate(selected.startDate)} – {formatShortDate(selected.endDate)}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      <SprintActions
                        sprint={detail.data?.sprint ?? selected}
                        permissions={perms}
                        goalRequired={space.data.sprintGoalRequired}
                        plannedOthers={open.filter(
                          (s) => s.status === 'PLANNED' && s.id !== selected.id,
                        )}
                        archived={space.data.archived}
                      />
                    </span>
                  </div>
                  {selected.goal && (
                    <p className="text-muted-foreground text-sm">
                      <span className="font-medium">{t('sprints.goal')}:</span> {selected.goal}
                    </p>
                  )}
                  <CapacityMeter
                    planned={detail.data?.sprint.points ?? 0}
                    velocity={velocity}
                    state={capacity.state}
                    percent={capacity.percent}
                  />
                  {selected.capacityNote && (
                    <p className="text-muted-foreground text-xs">
                      {t('sprints.capacity')}: {selected.capacityNote}
                    </p>
                  )}
                </div>
              }
            />
          </div>
          <DragOverlay>
            {dragging && (
              <div className="bg-card rounded-md border shadow-lg">
                <BacklogRow item={dragging} targets={[]} canPlan={false} onMove={() => undefined} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog
        open={scopeChange !== null}
        onOpenChange={(next) => !next && setScopeChange(null)}
        title={t('sprints.scopeChangeTitle')}
        description={t(
          scopeChange?.adding ? 'sprints.scopeChangeAdd' : 'sprints.scopeChangeRemove',
          {
            name: selected?.name,
            count: 1,
          },
        )}
        confirmLabel={t('sprints.scopeChangeConfirm')}
        pending={move.isPending}
        onConfirm={() => {
          if (scopeChange && selected) {
            send(scopeChange.itemId, scopeChange.adding ? selected : null, scopeChange.afterId);
          }
          setScopeChange(null);
        }}
      />
    </ItemNavContext.Provider>
  );
}

/** Toplam puanın ortalama velocity'ye göre ilerleme çubuğu. */
function CapacityMeter({
  planned,
  velocity,
  state,
  percent,
}: {
  planned: number;
  velocity: number | null;
  state: 'none' | 'under' | 'near' | 'over';
  percent: number | null;
}) {
  const { t } = useTranslation();
  if (state === 'none' || velocity === null) {
    return <p className="text-muted-foreground text-xs">{t('planning.noVelocity')}</p>;
  }
  return (
    <div className="flex flex-col gap-1" data-state={state}>
      <div
        role="progressbar"
        aria-label={t('planning.capacity')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent ?? 0)}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'h-full rounded-full',
            state === 'over' ? 'bg-destructive' : state === 'near' ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${Math.min(100, percent ?? 0)}%` }}
        />
      </div>
      <p
        className={cn(
          'text-xs tabular-nums',
          state === 'over' ? 'text-destructive font-medium' : 'text-muted-foreground',
        )}
      >
        {t('planning.capacityText', { planned, velocity, percent })}
        {state === 'over' && ` · ${t('planning.overCapacity')}`}
      </p>
    </div>
  );
}

function Pane({
  id,
  title,
  summary,
  items,
  epicTitles,
  canPlan,
  empty,
  header,
}: {
  id: string;
  title: string;
  summary: string;
  items: WorkItemRow[];
  epicTitles: ReadonlyMap<string, string>;
  canPlan: boolean;
  empty: string;
  header?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      aria-label={title}
      className={cn(
        'bg-card flex min-h-64 flex-col rounded-lg border',
        isOver && 'ring-primary/40 ring-2',
      )}
    >
      <header className="flex items-center gap-3 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">{summary}</span>
      </header>
      {header}
      <div ref={setNodeRef} className="min-h-24 flex-1">
        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">{empty}</p>
        ) : (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <PlanningRow
                key={item.id}
                item={item}
                epicTitle={item.parentId ? epicTitles.get(item.parentId) : undefined}
                canPlan={canPlan}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </section>
  );
}

function PlanningRow({
  item,
  epicTitle,
  canPlan,
}: {
  item: WorkItemRow;
  epicTitle: string | undefined;
  canPlan: boolean;
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canPlan,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(canPlan && 'cursor-grab', isDragging && 'opacity-40')}
      {...(canPlan ? listeners : {})}
    >
      <BacklogRow
        item={item}
        epicTitle={epicTitle}
        handle={canPlan ? attributes : null}
        targets={[]}
        canPlan={false}
        onMove={() => undefined}
      />
    </div>
  );
}
