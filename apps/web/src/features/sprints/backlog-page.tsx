import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  SPACE_PERMISSIONS as S,
  sprintTotals,
  type SprintSummary,
  type WorkItemRow,
} from '@scrum/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Copy, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { BacklogRow } from './backlog-row';
import { filterBacklog, isFiltered, NO_FILTER, type BacklogFilter } from './backlog-filter';
import { BACKLOG_CONTAINER, resolveBacklogDrop } from './backlog-dnd';
import { DropContainerView, SortableRow } from './backlog-dnd-view';
import { itemsToTsv } from './copy-list';
import {
  backlogQuery,
  sprintQuery,
  useDeleteSprint,
  useMoveBacklogItems,
  useNestItem,
} from './queries';
import { SprintActions } from './sprint-actions';
import { SprintDialog } from './sprint-dialog';
import { ScrumTabs } from './scrum-tabs';
import { SprintSection } from './sprint-section';

/** Satırlar önce, yoksa kapsayıcılar: boş alana da bırakılabilsin ama satır hedefi öncelikli olsun. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rows = hits.filter((h) => !String(h.id).startsWith('container:'));
  if (rows.length > 0) return rows;
  return hits.length > 0 ? hits : closestCenter(args);
};

type DialogState = { kind: 'create' } | { kind: 'edit'; sprint: SprintSummary } | null;

/** Product Backlog sayfası (brief §5.5, ADR-062): açık sprint'ler üstte, Backlog altta. */
export function BacklogPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const backlog = useQuery(backlogQuery(workspaceId, spaceId));
  const move = useMoveBacklogItems(spaceId);
  const remove = useDeleteSprint();
  const nestItem = useNestItem();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nestTarget, setNestTarget] = useState<string | null>(null);

  const sprints = useMemo(() => backlog.data?.sprints ?? [], [backlog.data]);
  const sprintDetails = useQueries({
    queries: sprints.map((s) => sprintQuery(workspaceId, s.id)),
  });

  const [filter, setFilter] = useState<BacklogFilter>(NO_FILTER);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<SprintSummary | null>(null);
  // Aktif sprint'e ekleme/çıkarma kapsam değişikliğidir; onay istenir (brief §6.1.4).
  const [scopeChange, setScopeChange] = useState<{
    itemIds: string[];
    sprint: SprintSummary;
    adding: boolean;
    afterId?: string | null;
  } | null>(null);

  const items = useMemo(() => backlog.data?.items ?? [], [backlog.data]);
  const visible = useMemo(() => filterBacklog(items, filter), [items, filter]);
  const epicTitles = useMemo(
    () => new Map((backlog.data?.epics ?? []).map((e) => [e.id, e.title])),
    [backlog.data],
  );
  // Seçim, listeden kaybolan öğeleri (taşındı/silindi) otomatik düşer.
  const selected = useMemo(() => visible.filter((i) => picked.has(i.id)), [visible, picked]);
  const totals = useMemo(
    () =>
      sprintTotals(
        items.map((i) => ({ type: i.type, points: i.points, category: i.status.category })),
      ),
    [items],
  );

  if (space.isPending || backlog.isPending) return <LoadingState />;
  if (space.isError || backlog.isError) return <NotFoundState />;

  const perms = space.data.permissions;
  const canPlan = perms.includes(S.SPRINT_PLAN) && !space.data.archived;
  const canRank = perms.includes(S.BACKLOG_RANK) && !space.data.archived;
  const reorderable = canRank && !isFiltered(filter);

  const performMove = (itemIds: string[], sprintId: string | null, afterId?: string | null) =>
    move.mutate(
      { itemIds, sprintId, afterId },
      {
        onSuccess: () => {
          const target = sprints.find((s) => s.id === sprintId);
          toast.success(
            target
              ? t('backlog.movedToSprint', { count: itemIds.length, name: target.name })
              : t('backlog.movedToBacklog', { count: itemIds.length }),
          );
          setPicked(new Set());
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  /** Öğelerin şu an bulunduğu aktif sprint (varsa): oradan çıkarmak kapsamı küçültür. */
  const activeSourceOf = (itemIds: string[]) =>
    sprints.find(
      (sprint, index) =>
        sprint.status === 'ACTIVE' &&
        itemIds.every((id) => sprintDetails[index]?.data?.items.some((i) => i.id === id)),
    );

  /** Aktif sprint söz konusuysa önce onay alır (brief §6.1.4). */
  const moveItems = (itemIds: string[], sprintId: string | null, afterId?: string | null) => {
    const target = sprints.find((s) => s.id === sprintId);
    if (target?.status === 'ACTIVE') {
      setScopeChange({ itemIds, sprint: target, adding: true, afterId });
      return;
    }
    const source = sprintId === null ? activeSourceOf(itemIds) : undefined;
    if (source) {
      setScopeChange({ itemIds, sprint: source, adding: false, afterId });
      return;
    }
    performMove(itemIds, sprintId, afterId);
  };

  const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  // Sürükle-bırak kapsayıcıları: her sprint ve Backlog (ADR-102).
  const containers = [
    ...sprints.map((sprint, index) => ({
      sprintId: sprint.id,
      itemIds: (sprintDetails[index]?.data?.items ?? []).map((i) => i.id),
    })),
    { sprintId: null, itemIds: visible.map((i) => i.id) },
  ];
  const allItems: WorkItemRow[] = [
    ...sprintDetails.flatMap((d) => d.data?.items ?? []),
    ...visible,
  ];
  const dragging = allItems.find((i) => i.id === activeId);
  const dropFor = ({ active, over, delta }: Pick<DragEndEvent, 'active' | 'over' | 'delta'>) =>
    resolveBacklogDrop({
      activeId: String(active.id),
      overId: over ? String(over.id) : null,
      deltaX: delta.x,
      containers,
    });
  const onDragMove = (e: DragMoveEvent) => {
    const drop = dropFor(e);
    setNestTarget(drop?.kind === 'nest' ? drop.parentId : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setNestTarget(null);
    const drop = dropFor(e);
    if (!drop || !canRank) return;
    if (drop.kind === 'nest') {
      nestItem.mutate(
        { itemId: drop.itemId, parentId: drop.parentId },
        {
          onSuccess: () => toast.success(t('backlog.nested')),
          onError: (error) => toast.error(errorMessage(error)),
        },
      );
      return;
    }
    const from = items.find((i) => i.id === drop.itemId)
      ? null
      : (sprintDetails.find((d) => d.data?.items.some((i) => i.id === drop.itemId))?.data?.sprint
          .id ?? null);
    if (from === drop.sprintId) {
      // Aynı kapsayıcıda yeniden sıralama (filtre varken sıra belirsiz olduğundan yapılmaz).
      if (drop.sprintId === null && !reorderable) return;
      move.mutate(
        { itemIds: [drop.itemId], sprintId: drop.sprintId, afterId: drop.afterId },
        { onError: (error) => toast.error(errorMessage(error)) },
      );
      return;
    }
    if (!canPlan) return;
    moveItems(
      [drop.itemId],
      drop.sprintId,
      drop.sprintId === null && isFiltered(filter) ? undefined : drop.afterId,
    );
  };
  const copyList = (list: readonly WorkItemRow[]) => {
    navigator.clipboard.writeText(itemsToTsv(list, t)).then(
      () => toast.success(t('copyList.copied', { count: list.length })),
      () => toast.error(t('copyList.failed')),
    );
  };

  return (
    <ItemNavContext.Provider value={(key) => void navigate({ to: '/items/$key', params: { key } })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={perms.includes(S.SPACE_SETTINGS)}
        actions={
          canPlan && (
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
              <Plus />
              {t('sprints.create')}
            </Button>
          )
        }
      >
        <ScrumTabs spaceId={spaceId} current="backlog" />
      </ContainerHeader>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setNestTarget(null);
        }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
          {sprints.map((sprint, index) => {
            const detail = sprintDetails[index];
            return (
              <SprintSection
                key={sprint.id}
                sprint={sprint}
                items={detail?.data?.items ?? []}
                loading={detail?.isPending ?? true}
                collapsed={collapsed.has(sprint.id)}
                onToggle={() => setCollapsed((c) => toggle(c, sprint.id, !c.has(sprint.id)))}
                epicTitles={epicTitles}
                targets={sprints}
                canPlan={canPlan}
                dnd={{ enabled: canRank, nestTarget }}
                onCopy={() => copyList(detail?.data?.items ?? [])}
                onMove={(itemId, target) => moveItems([itemId], target)}
                onEdit={() => setDialog({ kind: 'edit', sprint })}
                onDelete={() => setDeleting(sprint)}
                actions={
                  <SprintActions
                    sprint={sprint}
                    permissions={perms}
                    goalRequired={space.data.sprintGoalRequired}
                    plannedOthers={sprints.filter(
                      (s) => s.status === 'PLANNED' && s.id !== sprint.id,
                    )}
                    archived={space.data.archived}
                  />
                }
              />
            );
          })}

          <section className="bg-card rounded-lg border" aria-label={t('backlog.title')}>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <h2 className="text-sm font-semibold">{t('backlog.title')}</h2>
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() => copyList(visible)}
              >
                <Copy />
                {t('copyList.action')}
              </Button>
              <span className="text-muted-foreground text-xs tabular-nums">
                {t('sprints.totals', { count: totals.itemCount, points: totals.points })}
                {totals.unestimatedCount > 0 && (
                  <span className="ml-2 text-amber-700 dark:text-amber-400">
                    {t('sprints.unestimated', { count: totals.unestimatedCount })}
                  </span>
                )}
              </span>
            </header>

            <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
              <div className="relative min-w-40 flex-1 sm:max-w-64">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  value={filter.q}
                  onChange={(e) => setFilter({ ...filter, q: e.target.value })}
                  placeholder={t('backlog.search')}
                  aria-label={t('backlog.search')}
                  className="h-8 pl-8"
                />
              </div>
              <NativeSelect
                value={filter.epic}
                onChange={(e) => setFilter({ ...filter, epic: e.target.value })}
                aria-label={t('backlog.epicFilter')}
                className="h-8 max-w-48"
              >
                <option value="">{t('backlog.allEpics')}</option>
                <option value="none">{t('backlog.noEpic')}</option>
                {backlog.data.epics.map((epic) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.key} {epic.title}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={filter.unestimated}
                  onChange={(e) => setFilter({ ...filter, unestimated: e.target.checked })}
                  className="size-4"
                />
                {t('backlog.onlyUnestimated')}
              </label>
              {isFiltered(filter) && (
                <Button variant="ghost" size="sm" onClick={() => setFilter(NO_FILTER)}>
                  <X />
                  {t('view.clear')}
                </Button>
              )}
            </div>

            {selected.length > 0 && (
              <div
                role="region"
                aria-label={t('backlog.selection')}
                className="bg-accent/50 flex flex-wrap items-center gap-2 border-t px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {t('backlog.selected', { count: selected.length })}
                </span>
                {canPlan && sprints.length > 0 && (
                  <NativeSelect
                    value=""
                    aria-label={t('backlog.moveSelected')}
                    className="h-8"
                    onChange={(e) => {
                      if (e.target.value) {
                        moveItems(
                          selected.map((i) => i.id),
                          e.target.value,
                        );
                      }
                    }}
                  >
                    <option value="">{t('backlog.moveSelected')}</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                  {t('backlog.clearSelection')}
                </Button>
              </div>
            )}

            <div className="border-t">
              <DropContainerView
                id={BACKLOG_CONTAINER}
                itemIds={visible.map((i) => i.id)}
                enabled={canRank}
              >
                {visible.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-10 text-center text-sm">
                    {t(isFiltered(filter) ? 'backlog.noResults' : 'backlog.empty')}
                  </p>
                ) : (
                  visible.map((item) => (
                    <SortableRow
                      key={item.id}
                      id={item.id}
                      enabled={canRank}
                      nestTarget={nestTarget === item.id}
                    >
                      {(handle) => (
                        <BacklogRow
                          item={item}
                          epicTitle={item.parentId ? epicTitles.get(item.parentId) : undefined}
                          selected={picked.has(item.id)}
                          onSelect={(on) => setPicked((p) => toggle(p, item.id, on))}
                          handle={handle}
                          targets={sprints}
                          canPlan={canPlan}
                          onMove={(target) => moveItems([item.id], target)}
                        />
                      )}
                    </SortableRow>
                  ))
                )}
              </DropContainerView>
            </div>
            {canRank && isFiltered(filter) && visible.length > 0 && (
              <p className="text-muted-foreground border-t px-4 py-2 text-xs">
                {t('backlog.reorderHint')}
              </p>
            )}
          </section>
        </div>
        <DragOverlay>
          {dragging && (
            <div className="bg-card ring-primary/30 rounded-md border shadow-lg ring-2">
              <BacklogRow item={dragging} targets={[]} canPlan={false} onMove={() => undefined} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <SprintDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        spaceId={spaceId}
        weeks={space.data.sprintLengthWeeks}
        existing={sprints}
        editing={dialog?.kind === 'edit' ? dialog.sprint : undefined}
      />
      <ConfirmDialog
        open={scopeChange !== null}
        onOpenChange={(open) => !open && setScopeChange(null)}
        title={t('sprints.scopeChangeTitle')}
        description={t(
          scopeChange?.adding ? 'sprints.scopeChangeAdd' : 'sprints.scopeChangeRemove',
          {
            name: scopeChange?.sprint.name,
            count: scopeChange?.itemIds.length,
          },
        )}
        confirmLabel={t('sprints.scopeChangeConfirm')}
        pending={move.isPending}
        onConfirm={() => {
          if (!scopeChange) return;
          performMove(
            scopeChange.itemIds,
            scopeChange.adding ? scopeChange.sprint.id : null,
            scopeChange.afterId,
          );
          setScopeChange(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('sprints.deleteTitle', { name: deleting?.name })}
        description={t('sprints.deleteBody')}
        confirmLabel={t('structure.delete')}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('sprints.deleted', { name: deleting.name }));
              setDeleting(null);
            },
            onError: (error) => {
              toast.error(errorMessage(error));
              setDeleting(null);
            },
          });
        }}
      />
    </ItemNavContext.Provider>
  );
}
