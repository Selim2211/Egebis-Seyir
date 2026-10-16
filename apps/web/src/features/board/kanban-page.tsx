import { SPACE_PERMISSIONS as S, type WorkItemSummary } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { useMe } from '@/features/auth/queries';
import { BugsButton } from '@/features/bugs/bugs-page';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { hierarchyQuery, spaceQuery } from '@/features/spaces/queries';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { ItemPanel } from '@/features/work-items/detail/item-panel';
import { PriorityColorToggle } from '@/features/work-items/priority-colors';
import { useCreateItem } from '@/features/work-items/queries';
import { useStatusGuard } from '@/features/work-items/status-guard';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { listName } from '@/lib/default-names';
import { useErrorMessage } from '@/lib/use-error-message';
import type { Swimlane } from './board-model';
import { toBoardStatuses, useCanMove } from './board-hooks';
import { BoardView } from './board-view';
import { kanbanQuery, useKanbanStatus } from './kanban-queries';
import { SwimlanePicker } from './swimlane-picker';

export interface KanbanSearch {
  lane?: Swimlane;
  list?: string;
  q?: string;
  mine?: boolean;
  item?: string;
}

/**
 * Space geneli Kanban panosu (ADR-115): sprint yok, sürekli akış. Tüm listelerin öğeleri tek
 * panoda; liste, kişi ve metin süzgeci, satır (swimlane), WIP uyarısı ve sütundan hızlı kart ekleme.
 */
export function KanbanPage({
  spaceId,
  search,
  onSearch,
}: {
  spaceId: string;
  search: KanbanSearch;
  onSearch: (patch: Partial<KanbanSearch>) => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const { user } = useMe();
  const errorMessage = useErrorMessage();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const board = useQuery(kanbanQuery(workspaceId, spaceId));
  const hierarchy = useQuery(hierarchyQuery(workspaceId));
  const create = useCreateItem();
  const [typing, setTyping] = useState(search.q ?? '');

  const statuses = useMemo(() => (space.data ? toBoardStatuses(space.data) : []), [space.data]);
  const update = useKanbanStatus(spaceId);
  const guard = useStatusGuard(
    (itemId, statusId, force, handlers) => update.mutate({ itemId, statusId, force }, handlers),
    update.isPending,
  );
  const canMove = useCanMove(space.data?.permissions ?? [], space.data?.archived ?? true);

  const treeSpace = hierarchy.data?.spaces.find((s) => s.id === spaceId);
  const lists = useMemo(
    () => [...(treeSpace?.folders.flatMap((f) => f.lists) ?? []), ...(treeSpace?.lists ?? [])],
    [treeSpace],
  );

  // Alt görevler panoda kendi üst öğesiyle birlikte gezilir; panoda yalnızca üst düzey kartlar.
  const items = useMemo(() => {
    const q = (search.q ?? '').trim().toLowerCase();
    return (board.data?.items ?? []).filter(
      (item: WorkItemSummary) =>
        item.type !== 'SUBTASK' &&
        (!search.list || item.listId === search.list) &&
        (!search.mine || item.assignees.some((a) => a.id === user.id)) &&
        (!q || item.title.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)),
    );
  }, [board.data, search.list, search.mine, search.q, user.id]);
  const epicTitles = useMemo(
    () =>
      new Map(
        (board.data?.items ?? []).filter((i) => i.type === 'EPIC').map((i) => [i.id, i.title]),
      ),
    [board.data],
  );

  if (space.isPending || board.isPending) return <LoadingState />;
  if (space.isError || board.isError) return <NotFoundState />;

  const canAdd = space.data.permissions.includes(S.WORK_ITEM_WRITE) && !space.data.archived;
  const targetList = search.list ?? lists[0]?.id;

  const addCard = (statusId: string, title: string) => {
    if (!targetList) return;
    create.mutate(
      { listId: targetList, body: { type: 'TASK', title, statusId, parentId: null } },
      {
        onSuccess: ({ key }) => toast.success(t('items.created', { key })),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <ItemNavContext.Provider value={(key) => onSearch({ item: key })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
        actions={<BugsButton spaceId={spaceId} />}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <h2 className="text-lg font-semibold">{t('kanban.title')}</h2>
        <NativeSelect
          aria-label={t('kanban.list')}
          value={search.list ?? ''}
          className="h-8 max-w-56"
          onChange={(e) => onSearch({ list: e.target.value || undefined })}
        >
          <option value="">{t('kanban.allLists')}</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {listName(l.name)}
            </option>
          ))}
        </NativeSelect>
        <label className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={typing}
            onChange={(e) => {
              setTyping(e.target.value);
              onSearch({ q: e.target.value || undefined });
            }}
            placeholder={t('kanban.search')}
            aria-label={t('kanban.search')}
            className="border-input bg-card h-8 w-48 rounded-md border pr-2 pl-7 text-sm outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={!!search.mine}
            onChange={(e) => onSearch({ mine: e.target.checked || undefined })}
          />
          {t('kanban.mine')}
        </label>
        <SwimlanePicker value={search.lane ?? 'none'} onChange={(lane) => onSearch({ lane })} />
        <PriorityColorToggle />
        <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
          {t('board.hint')}
        </span>
      </div>
      <BoardView
        items={items}
        statuses={statuses}
        swimlane={search.lane ?? 'none'}
        epicTitles={epicTitles}
        canMove={canMove}
        onStatus={guard.change}
        onAddCard={canAdd && targetList ? addCard : undefined}
      />
      {guard.dialog}
      <ItemPanel itemKey={search.item} />
    </ItemNavContext.Provider>
  );
}
