import {
  DndContext,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SPACE_PERMISSIONS as S,
  sprintTotals,
  type SprintSummary,
  type WorkItemRow,
} from '@scrum/shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Archive,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  Layers,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { filterBacklog, isFiltered, NO_FILTER, type BacklogFilter } from './backlog-filter';
import {
  BACKLOG_CONTAINER,
  type BacklogDrop,
  type BacklogIntent,
  containerId,
  createIntentStore,
  DETACH_ATTR,
  NEST_EDGE_RATIO,
  resolveBacklogDrop,
} from './backlog-dnd';
import { BacklogGhost, DetachZone, type DraggedItem } from './backlog-drag-parts';
import { DropContainerView } from './backlog-dnd-view';
import { ItemWithSubtasks } from './backlog-subtasks';
import { subtaskRegistry } from './subtask-registry';
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
import { RestoreSprintDialog } from '@/features/backup/backup';
import { useUnnestItem } from '@/features/work-items/queries';
import { PriorityColorToggle } from '@/features/work-items/priority-colors';
import { SprintImportDialog } from './sprint-import-dialog';
import { ScrumTabs } from './scrum-tabs';
import { GroupEpicDialog } from './group-epic-dialog';
import { SprintSection } from './sprint-section';

/** Toplu taşıma seçiminde Backlog'a geri alma değeri. */
const BACKLOG_OPTION = '__backlog';

/** Bildirim baloncuklarının (sonner) da üstünde kalır. */
const TOP_LAYER = 1000000001;

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
  const unnestItem = useUnnestItem();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ghostWidth, setGhostWidth] = useState(0);
  const [intents] = useState(createIntentStore);
  const [hierarchy, setHierarchy] = useState<
    | { kind: 'nest'; item: DraggedItem; target: WorkItemRow }
    | {
        kind: 'unnest';
        item: DraggedItem;
        place: { sprintId: string | null; afterId: string | null } | null;
      }
    | null
  >(null);
  // Sürükleme sırasındaki imleç konumu ve DOM'a işaretlenen hedef öğeler (yeniden çizim tetiklemez).
  const pointer = useRef({ x: 0, y: 0 });
  const marked = useRef<HTMLElement[]>([]);

  const sprints = useMemo(() => backlog.data?.sprints ?? [], [backlog.data]);
  const sprintDetails = useQueries({
    queries: sprints.map((s) => sprintQuery(workspaceId, s.id)),
  });

  const [filter, setFilter] = useState<BacklogFilter>(NO_FILTER);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<SprintSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [restoring, setRestoring] = useState(false);
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
  const selected = useMemo(
    () =>
      [...sprintDetails.flatMap((d) => d.data?.items ?? []), ...visible].filter((i) =>
        picked.has(i.id),
      ),
    [sprintDetails, visible, picked],
  );
  const totals = useMemo(
    () =>
      sprintTotals(
        items.map((i) => ({ type: i.type, points: i.points, category: i.status.category })),
      ),
    [items],
  );

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
  /** Sürüklenen öğe: üst düzey satır ya da açılmış bir alt öğe. */
  const draggedOf = (id: string | null): DraggedItem | null => {
    if (!id) return null;
    const row = allItems.find((i) => i.id === id) ?? subtaskRegistry.get(id);
    return row
      ? {
          id: row.id,
          key: row.key,
          title: row.title,
          type: row.type,
          parentId: row.parentId,
          childCount: row.childCount,
        }
      : null;
  };
  const dragged = draggedOf(activeId);
  /**
   * Görevler listesindeki kural (ADR-116): alt öğesi olmayan Task ya da Sub-Task, başka bir Task'ın
   * üstüne bırakılınca onun Sub-Task'ı olur. Epic ve Bug ne alt öğe yapılır ne de hedef olur.
   */
  const canNestOn = (item: DraggedItem, targetId: string) => {
    const target = allItems.find((i) => i.id === targetId);
    return (
      !!target &&
      target.id !== item.id &&
      target.type === 'TASK' &&
      target.id !== item.parentId &&
      (item.type === 'SUBTASK' || (item.type === 'TASK' && item.childCount === 0))
    );
  };
  const sourceOf = (id: string) =>
    items.some((i) => i.id === id)
      ? null
      : (sprintDetails.find((d) => d.data?.items.some((i) => i.id === id))?.data?.sprint.id ??
        null);
  /**
   * Bırakma hedefi: imlecin altındaki Ayır alanı, satır ya da kapsayıcı (elementsFromPoint). Satırlar
   * dnd-kit'e bırakma alanı olarak kaydedilmez; böylece sürüklerken yüzlerce satır yeniden çizilmez.
   * Satırın ortası "alt öğe yap", üst/alt kenarı "araya bırak"tır.
   */
  const dropAtPointer = (): BacklogDrop | null => {
    if (!dragged) return null;
    let overId: string | null = null;
    let nestOn = false;
    for (const el of document.elementsFromPoint(pointer.current.x, pointer.current.y)) {
      if (el.closest(`[${DETACH_ATTR}]`)) {
        return dragged.parentId ? { kind: 'detach', itemId: dragged.id } : null;
      }
      const row = el.closest<HTMLElement>('[data-row-id]');
      if (row?.dataset.subtask !== undefined) {
        // Alt öğe satırları hedef değildir (alt öğenin alt öğesi olmaz).
        if (row.dataset.rowId === dragged.id) return null;
        continue;
      }
      const box = el.closest<HTMLElement>('[data-drop-container]');
      overId = row?.dataset.rowId ?? box?.dataset.dropContainer ?? null;
      if (row && overId) {
        const rect = row.getBoundingClientRect();
        const ratio = (pointer.current.y - rect.top) / Math.max(rect.height, 1);
        nestOn =
          ratio > NEST_EDGE_RATIO && ratio < 1 - NEST_EDGE_RATIO && canNestOn(dragged, overId);
      }
      if (overId) break;
    }
    return resolveBacklogDrop({
      activeId: dragged.id,
      overId,
      nestOn,
      containers,
      detach: dragged.type === 'SUBTASK',
    });
  };
  const nameOf = (sprintId: string | null) =>
    sprintId === null
      ? t('backlog.moveToBacklog')
      : t('backlog.moveToSprint', { name: sprints.find((s) => s.id === sprintId)?.name ?? '' });
  /** Kopyanın altında yazan niyet. Aynı kapsayıcıda sıra değişiminde yazı çıkmaz. */
  const intentOf = (drop: BacklogDrop | null): BacklogIntent => {
    if (!drop) return null;
    if (drop.kind === 'detach') return { kind: 'detach' };
    if (drop.kind === 'nest') {
      return { kind: 'nest', targetKey: allItems.find((i) => i.id === drop.parentId)?.key ?? '' };
    }
    if (drop.kind === 'unnest') {
      return { kind: 'move', label: `${t('dnd.detachShort')} · ${nameOf(drop.sprintId)}` };
    }
    return sourceOf(drop.itemId) === drop.sprintId
      ? null
      : { kind: 'move', label: nameOf(drop.sprintId) };
  };
  const clearMarks = () => {
    for (const el of marked.current) {
      delete el.dataset.dropState;
      delete el.dataset.dropAfter;
      delete el.dataset.dropOver;
      delete el.dataset.dropTop;
    }
    marked.current = [];
  };
  const showDrop = (drop: BacklogDrop | null) => {
    clearMarks();
    intents.set(intentOf(drop));
    if (!drop || drop.kind === 'detach') return;
    const put = (
      el: HTMLElement | null,
      key: 'dropState' | 'dropAfter' | 'dropOver' | 'dropTop',
      value = '',
    ) => {
      if (!el) return;
      el.dataset[key] = value;
      marked.current.push(el);
    };
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    if (drop.kind === 'nest') {
      put(row(drop.parentId), 'dropState', 'nest');
      return;
    }
    const box = document.querySelector<HTMLElement>(
      `[data-drop-container="${containerId(drop.sprintId)}"]`,
    );
    put(box, 'dropOver');
    if (drop.afterId) put(row(drop.afterId), 'dropAfter');
    else put(box, 'dropTop');
  };
  useEffect(() => {
    if (!activeId) return;
    let frame = 0;
    const resolve = () => {
      frame = 0;
      showDrop(dropAtPointer());
    };
    const move = (e: PointerEvent) => {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
      if (!frame) frame = requestAnimationFrame(resolve);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => {
      document.removeEventListener('pointermove', move);
      if (frame) cancelAnimationFrame(frame);
      clearMarks();
      intents.set(null);
    };
    // Yalnızca sürükleme başlayıp bittiğinde kurulur/kaldırılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const e = activatorEvent as PointerEvent;
    pointer.current = { x: e.clientX, y: e.clientY };
    setGhostWidth(active.rect.current.initial?.width ?? 0);
    setActiveId(String(active.id));
  };
  if (space.isPending || backlog.isPending) return <LoadingState />;
  if (space.isError || backlog.isError) return <NotFoundState />;

  const perms = space.data.permissions;
  const canPlan = perms.includes(S.SPRINT_PLAN) && !space.data.archived;
  const canWrite = perms.includes(S.WORK_ITEM_WRITE) && !space.data.archived;
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

  const onDragEnd = () => {
    // Bırakma anındaki gerçek imleç konumu (kare beklemeden).
    const drop = dropAtPointer();
    const item = dragged;
    setActiveId(null);
    if (!drop || !item) return;
    // Hiyerarşi değişiklikleri (alt öğe yap / ayır) Görevler listesindeki gibi onayla yapılır.
    if (drop.kind === 'nest') {
      const target = allItems.find((i) => i.id === drop.parentId);
      if (canWrite && target) setHierarchy({ kind: 'nest', item, target });
      return;
    }
    if (drop.kind === 'detach' || drop.kind === 'unnest') {
      if (canWrite) {
        setHierarchy({
          kind: 'unnest',
          item,
          place: drop.kind === 'unnest' ? { sprintId: drop.sprintId, afterId: drop.afterId } : null,
        });
      }
      return;
    }
    if (!canRank) return;
    if (sourceOf(drop.itemId) === drop.sprintId) {
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
  /** Onaylanan hiyerarşi değişikliği: alt öğe yap ya da ayır (ayrılan öğe gerekirse sprint'e yerleşir). */
  const applyHierarchy = () => {
    if (!hierarchy) return;
    const { item } = hierarchy;
    const done = (message: string) => {
      toast.success(message);
      setHierarchy(null);
    };
    const failed = (error: unknown) => {
      toast.error(errorMessage(error));
      setHierarchy(null);
    };
    if (hierarchy.kind === 'nest') {
      const { target } = hierarchy;
      nestItem.mutate(
        { itemId: item.id, parentId: target.id },
        {
          onSuccess: () => done(t('dnd.nested', { key: item.key, target: target.key })),
          onError: failed,
        },
      );
      return;
    }
    const { place } = hierarchy;
    unnestItem.mutate(item.id, {
      onSuccess: () => {
        done(t('dnd.unnested', { key: item.key }));
        if (place?.sprintId && canPlan) moveItems([item.id], place.sprintId, place.afterId);
      },
      onError: failed,
    });
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
          <>
            <PriorityColorToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FileSpreadsheet />
                  {t('sprintImport.menu')}
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a
                    href={`/api/workspaces/${workspaceId}/spaces/${spaceId}/backlog/export.xlsx`}
                    download
                  >
                    <FileSpreadsheet />
                    {t('sprintImport.exportBacklog')}
                  </a>
                </DropdownMenuItem>
                {canPlan && (
                  <DropdownMenuItem onSelect={() => setRestoring(true)}>
                    <Archive />
                    {t('backup.restoreSprint')}
                  </DropdownMenuItem>
                )}
                {canPlan && (
                  <DropdownMenuItem onSelect={() => setImporting(true)}>
                    <Upload />
                    {t('sprintImport.import')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {canPlan && (
              <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
                <Plus />
                {t('sprints.create')}
              </Button>
            )}
          </>
        }
      >
        <ScrumTabs spaceId={spaceId} current="backlog" />
      </ContainerHeader>

      <DndContext
        sensors={sensors}
        collisionDetection={() => []}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
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
                dnd={{ enabled: canRank }}
                selected={picked}
                onSelect={(itemId, on) => setPicked((p) => toggle(p, itemId, on))}
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
                          e.target.value === BACKLOG_OPTION ? null : e.target.value,
                        );
                      }
                    }}
                  >
                    <option value="">{t('backlog.moveSelected')}</option>
                    <option value={BACKLOG_OPTION}>{t('moveItem.backlog')}</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {canWrite && space.data.scrumEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="group-selected"
                    onClick={() => setGrouping(true)}
                  >
                    <Layers />
                    {t('groupEpic.action')}
                  </Button>
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
                    <ItemWithSubtasks
                      key={item.id}
                      enabled={canRank}
                      item={item}
                      epicTitle={item.parentId ? epicTitles.get(item.parentId) : undefined}
                      selected={picked.has(item.id)}
                      onSelect={(on) => setPicked((p) => toggle(p, item.id, on))}
                      targets={sprints}
                      canPlan={canPlan}
                      onMove={(target) => moveItems([item.id], target)}
                    />
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
        {dragged?.parentId && <DetachZone store={intents} />}
        {createPortal(
          <DragOverlay dropAnimation={null} zIndex={TOP_LAYER} style={{ pointerEvents: 'none' }}>
            {dragged && <BacklogGhost item={dragged} width={ghostWidth} store={intents} />}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <GroupEpicDialog
        spaceId={spaceId}
        listId={selected[0]?.listId ?? ''}
        itemIds={selected.map((i) => i.id)}
        epics={backlog.data.epics}
        open={grouping && selected.length > 0}
        onOpenChange={setGrouping}
        onDone={() => setPicked(new Set())}
      />
      {restoring && <RestoreSprintDialog spaceId={spaceId} onClose={() => setRestoring(false)} />}
      {importing && (
        <SprintImportDialog open onOpenChange={setImporting} spaceId={spaceId} sprints={sprints} />
      )}
      <SprintDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        spaceId={spaceId}
        weeks={space.data.sprintLengthWeeks}
        existing={sprints}
        editing={dialog?.kind === 'edit' ? dialog.sprint : undefined}
      />
      <ConfirmDialog
        open={hierarchy !== null}
        onOpenChange={(open) => !open && setHierarchy(null)}
        title={
          hierarchy?.kind === 'nest'
            ? t('dnd.nestTitle', { key: hierarchy.item.key, target: hierarchy.target.key })
            : t('dnd.unnestTitle', { key: hierarchy?.item.key ?? '' })
        }
        description={
          hierarchy?.kind === 'nest'
            ? t('dnd.nestBody', { title: hierarchy.item.title, target: hierarchy.target.title })
            : t('dnd.unnestBody', { title: hierarchy?.item.title ?? '' })
        }
        confirmLabel={t(hierarchy?.kind === 'nest' ? 'dnd.nestConfirm' : 'dnd.unnestConfirm')}
        pending={nestItem.isPending || unnestItem.isPending}
        onConfirm={applyHierarchy}
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
