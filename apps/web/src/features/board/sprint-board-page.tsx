import { SPACE_PERMISSIONS as S, sprintTotals } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Kanban } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { backlogQuery, sprintsQuery } from '@/features/sprints/queries';
import { SprintActions } from '@/features/sprints/sprint-actions';
import { ScrumTabs } from '@/features/sprints/scrum-tabs';
import { ItemPanel } from '@/features/work-items/detail/item-panel';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { useStatusGuard } from '@/features/work-items/status-guard';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { BoardView } from './board-view';
import { toBoardStatuses, useCanMove } from './board-hooks';
import { SwimlanePicker } from './swimlane-picker';
import type { Swimlane } from './board-model';
import { sprintBoardQuery, useSprintBoardStatus } from './queries';

export interface SprintBoardSearch {
  sprint?: string;
  lane?: Swimlane;
  item?: string;
}

/** Sprint panosu (brief §5.6): aktif sprint'in Board'u; planlı sprint'ler seçilerek de görülebilir. */
export function SprintBoardPage({
  spaceId,
  search,
  onSearch,
}: {
  spaceId: string;
  search: SprintBoardSearch;
  onSearch: (patch: Partial<SprintBoardSearch>) => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const backlog = useQuery(backlogQuery(workspaceId, spaceId));

  const all = useQuery(sprintsQuery(workspaceId, spaceId));
  // Açık sprint'ler önce (aktif, sonra başlangıç sırasıyla planlılar), ardından geçmiş.
  const sprints = useMemo(() => {
    const rank = { ACTIVE: 0, PLANNED: 1, COMPLETED: 2, CANCELLED: 3 } as const;
    return [...(all.data?.sprints ?? [])].sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.status === 'PLANNED'
          ? a.startDate.localeCompare(b.startDate)
          : b.startDate.localeCompare(a.startDate)),
    );
  }, [all.data]);
  const selected = sprints.find((s) => s.id === search.sprint) ?? sprints[0];
  const readOnly =
    selected !== undefined && selected.status !== 'ACTIVE' && selected.status !== 'PLANNED';
  const board = useQuery({
    ...sprintBoardQuery(workspaceId, selected?.id ?? ''),
    enabled: !!selected,
  });

  const statuses = useMemo(() => (space.data ? toBoardStatuses(space.data) : []), [space.data]);
  const update = useSprintBoardStatus(selected?.id ?? '', statuses);
  const guard = useStatusGuard(
    (itemId, statusId, force, handlers) => update.mutate({ itemId, statusId, force }, handlers),
    update.isPending,
  );
  const epicTitles = useMemo(
    () => new Map((backlog.data?.epics ?? []).map((e) => [e.id, e.title])),
    [backlog.data],
  );
  const items = useMemo(() => board.data?.items ?? [], [board.data]);
  const totals = useMemo(
    () =>
      sprintTotals(
        items.map((i) => ({ type: i.type, points: i.points, category: i.status.category })),
      ),
    [items],
  );

  const canMoveItem = useCanMove(
    space.data?.permissions ?? [],
    (space.data?.archived ?? true) || readOnly,
  );

  if (space.isPending || backlog.isPending || all.isPending) return <LoadingState />;
  if (space.isError || backlog.isError || all.isError) return <NotFoundState />;

  const lane = search.lane ?? 'none';

  return (
    // Karttaki başlığa tıklamak yan paneli açar (adreste ?item=KEY).
    <ItemNavContext.Provider value={(key) => onSearch({ item: key })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="board" />
      </ContainerHeader>

      {!selected ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
          <Kanban className="text-muted-foreground size-8" aria-hidden />
          <h2 className="font-semibold">{t('board.noSprintTitle')}</h2>
          <p className="text-muted-foreground text-sm">{t('board.noSprintBody')}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/spaces/$spaceId/backlog" params={{ spaceId }}>
              {t('spacePage.openBacklog')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <NativeSelect
              value={selected.id}
              onChange={(e) => onSearch({ sprint: e.target.value })}
              aria-label={t('board.sprint')}
              className="h-8 max-w-60"
            >
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {t(`sprints.status.${s.status}`)}
                </option>
              ))}
            </NativeSelect>
            <span className="text-muted-foreground text-sm">
              {formatShortDate(selected.startDate)} – {formatShortDate(selected.endDate)}
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              {t('board.progress', { done: totals.donePoints, total: totals.points })}
            </span>
            <SwimlanePicker value={lane} onChange={(next) => onSearch({ lane: next })} />
            <span className="ml-auto flex items-center gap-1">
              <SprintActions
                sprint={selected}
                permissions={space.data.permissions}
                goalRequired={space.data.sprintGoalRequired}
                plannedOthers={sprints.filter(
                  (s) => s.status === 'PLANNED' && s.id !== selected.id,
                )}
                archived={space.data.archived}
              />
            </span>
          </div>
          {readOnly && (
            <p
              role="status"
              className="text-muted-foreground mx-4 mb-2 rounded-md border border-dashed px-3 py-2 text-sm sm:mx-6"
            >
              {t(
                selected.status === 'COMPLETED'
                  ? 'board.readOnlyCompleted'
                  : 'board.readOnlyCancelled',
              )}
            </p>
          )}
          {selected.goal && (
            <p className="text-muted-foreground px-4 pb-2 text-sm sm:px-6">
              <span className="font-medium">{t('sprints.goal')}:</span> {selected.goal}
            </p>
          )}
          {board.isPending ? (
            <LoadingState />
          ) : (
            <BoardView
              items={items}
              statuses={statuses}
              swimlane={lane}
              epicTitles={epicTitles}
              canMove={canMoveItem}
              onStatus={guard.change}
              showPoints
            />
          )}
          {guard.dialog}
        </>
      )}
      <ItemPanel itemKey={search.item} />
    </ItemNavContext.Provider>
  );
}
