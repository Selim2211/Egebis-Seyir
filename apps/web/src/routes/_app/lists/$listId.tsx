import { SPACE_PERMISSIONS as S } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CalendarDays, Kanban, List, Table } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ListCalendar } from '@/features/calendar/list-calendar';
import { ListBoard } from '@/features/board/list-board';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { listQuery, spaceQuery, useTreeSpace } from '@/features/spaces/queries';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { ItemPanel } from '@/features/work-items/detail/item-panel';
import { ItemsView } from '@/features/work-items/items-view';
import { SavedViewsMenu } from '@/features/work-items/view/saved-views-menu';
import { itemsQuery } from '@/features/work-items/queries';
import { ViewSearchSchema, type ViewSearch } from '@/features/work-items/view/view-state';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/lists/$listId')({
  validateSearch: ViewSearchSchema,
  component: ListPage,
});

/** List sayfası (taslak 1): List, Table, Board ve Takvim görünümleri. */
function ListPage() {
  const { t } = useTranslation();
  const { listId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data: list, isPending, isError } = useQuery(listQuery(workspaceId, listId));
  const treeSpace = useTreeSpace(list?.space.id);
  const { data: space } = useQuery({
    ...spaceQuery(workspaceId, list?.space.id ?? ''),
    enabled: !!list,
  });
  const { data: items } = useQuery({ ...itemsQuery(workspaceId, listId), enabled: !!list });

  if (isPending) return <LoadingState />;
  if (isError) return <NotFoundState />;

  const view = search.view ?? 'list';

  /** Görünüm ayarlarını günceller; `null` hepsini temizler (açık panel ve görünüm türü korunur). */
  const onSearch = (patch: Partial<ViewSearch> | null) =>
    void navigate({
      to: '.',
      replace: true,
      search: (prev: ViewSearch) =>
        patch === null
          ? { item: prev.item, view: prev.view }
          : Object.fromEntries(
              Object.entries({ ...prev, ...patch }).filter(([, value]) => value !== undefined),
            ),
    });

  return (
    // Satırdaki başlığa tıklamak yan paneli açar (adreste ?item=KEY); Ctrl/Cmd+tık tam sayfayı açar.
    <ItemNavContext.Provider value={(key) => onSearch({ item: key })}>
      <ContainerHeader
        type="LIST"
        id={list.id}
        name={list.name}
        crumb={{ space: list.space, folder: list.folder }}
        archived={list.archived}
        canUnarchive={!!treeSpace?.permissions.includes(S.LIST_MANAGE)}
      >
        <div className="flex items-end gap-2">
          <div role="tablist" aria-label={t('listPage.views')} className="-mb-px flex gap-1">
            {(['list', 'table', 'board', 'calendar'] as const).map((key) => {
              const Icon =
                key === 'list'
                  ? List
                  : key === 'table'
                    ? Table
                    : key === 'board'
                      ? Kanban
                      : CalendarDays;
              const selected = view === key;
              return (
                <Link
                  key={key}
                  to="."
                  search={(prev: ViewSearch) => ({
                    ...prev,
                    view: key === 'list' ? undefined : key,
                  })}
                  replace
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    'flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-sm',
                    selected
                      ? 'border-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(`listPage.view.${key}`)}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto pb-1">
            <SavedViewsMenu
              listId={list.id}
              search={search}
              permissions={space?.permissions ?? treeSpace?.permissions ?? []}
              onApply={(config) =>
                void navigate({
                  to: '.',
                  replace: true,
                  search: (prev: ViewSearch) => ({ item: prev.item, ...config }),
                })
              }
            />
          </div>
        </div>
      </ContainerHeader>

      {space && items && view === 'calendar' ? (
        <ListCalendar listId={list.id} space={space} data={items} archived={list.archived} />
      ) : space && items && view === 'board' ? (
        <ListBoard
          listId={list.id}
          space={space}
          data={items}
          archived={list.archived}
          lane={search.lane ?? 'none'}
          onLane={(lane) => onSearch({ lane })}
        />
      ) : space && items ? (
        <ItemsView
          listId={list.id}
          space={space}
          data={items}
          archived={list.archived}
          search={search}
          onSearch={onSearch}
        />
      ) : (
        <LoadingState />
      )}
      <ItemPanel itemKey={search.item} />
    </ItemNavContext.Provider>
  );
}
