import {
  type FavoriteType,
  type HierarchyResponse,
  SPACE_PERMISSIONS as S,
  type TreeFolder,
  type TreeList,
  type TreeSpace,
  WORKSPACE_PERMISSIONS as W,
} from '@scrum/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Archive,
  ChevronRight,
  Clock,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  Kanban,
  FileText,
  ChartGantt as GanttChartIcon,
  Layers,
  List,
  ListOrdered,
  ListPlus,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Star,
  StarOff,
  Trash2,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { useStructureActions } from './actions-context';
import { ContainerLink } from './container-header';
import { hierarchyQuery, useHierarchy, useMove } from './queries';
import { type DragHandleProps, SortableGroup } from './sortable';
import { SpaceAvatar } from './space-avatar';

type Favorites = ReadonlySet<string>;
const favKey = (type: string, id: string) => `${type}:${id}`;

/** Etkin sayfanın Space/Folder/List id'si (ağaçta vurgulama ve otomatik açma için). */
function useActiveIds(tree: TreeSpace[] | undefined) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const match = /^\/(spaces|folders|lists)\/([0-9a-f-]{36})/.exec(pathname);
  const active = new Set<string>();
  if (!match || !tree) return active;
  const id = match[2]!;
  for (const space of tree) {
    if (space.id === id) active.add(space.id);
    for (const folder of space.folders) {
      if (folder.id === id || folder.lists.some((l) => l.id === id)) {
        active.add(space.id).add(folder.id);
      }
    }
    if (space.lists.some((l) => l.id === id)) active.add(space.id);
  }
  return active;
}

/** Kenar çubuğu: Favoriler + Space → Folder → List ağacı (brief §5.2, taslak 1). */
export function SidebarTree() {
  const { t } = useTranslation();
  const { data, isPending } = useHierarchy();
  const actions = useStructureActions();
  const canCreateSpace = useCan(W.SPACE_CREATE);
  const canOrderSpaces = useCan(W.WORKSPACE_SETTINGS);
  const reorder = useReorder();
  const ancestors = useActiveIds(data?.spaces);
  const favorites: Favorites = new Set(data?.favorites.map((f) => favKey(f.type, f.id)));

  return (
    <>
      {data && data.favorites.length > 0 && (
        <>
          <SectionTitle>{t('nav.favorites')}</SectionTitle>
          {data.favorites.map((f) => {
            const space = data.spaces.find((s) => s.id === f.spaceId);
            return (
              <Row
                key={favKey(f.type, f.id)}
                depth={0}
                target={f}
                icon={<Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden />}
                label={f.name}
                aside={
                  f.type !== 'SPACE' && space ? (
                    <span className="text-muted-foreground max-w-20 truncate text-[11px]">
                      {space.name}
                    </span>
                  ) : null
                }
                menu={
                  <DropdownMenuItem onSelect={() => actions.setFavorite(f.type, f.id, false)}>
                    <StarOff />
                    {t('structure.removeFavorite')}
                  </DropdownMenuItem>
                }
                menuLabel={t('structure.more', { name: f.name })}
              />
            );
          })}
        </>
      )}

      <SectionTitle
        action={
          canCreateSpace && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5.5"
              aria-label={t('spaces.create')}
              onClick={() => actions.open({ kind: 'createSpace' })}
            >
              <Plus className="size-3.5" />
            </Button>
          )
        }
      >
        {t('nav.spaces')}
      </SectionTitle>

      {isPending ? (
        <p className="text-muted-foreground px-2 py-1 text-xs">{t('common.loading')}</p>
      ) : data && data.spaces.length > 0 ? (
        <>
          <SortableGroup
            items={data.spaces}
            enabled={canOrderSpaces}
            onReorder={(id, afterId, reordered) =>
              reorder({ type: 'SPACE', id, afterId }, (h) => ({ ...h, spaces: reordered }))
            }
          >
            {(space, handle) => (
              <SpaceNode
                key={space.id}
                space={space}
                handle={handle}
                favorites={favorites}
                forceOpen={ancestors.has(space.id)}
                ancestors={ancestors}
              />
            )}
          </SortableGroup>
          {canCreateSpace && (
            <button
              type="button"
              onClick={() => actions.open({ kind: 'createSpace' })}
              className="text-muted-foreground hover:bg-sidebar-accent flex h-7.5 items-center gap-1.5 rounded-md pr-2 pl-6 text-sm font-medium"
            >
              <Plus className="size-3.5" aria-hidden />
              {t('spaces.create')}
            </button>
          )}
        </>
      ) : (
        <div className="border-sidebar-border mx-1 rounded-md border border-dashed p-3 text-center">
          <Layers className="text-muted-foreground mx-auto mb-1.5 size-5" aria-hidden />
          <p className="text-xs font-medium">{t('spaces.emptyTitle')}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {canCreateSpace ? t('spaces.emptyBody') : t('spaces.emptyBodyNoCreate')}
          </p>
          {canCreateSpace && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => actions.open({ kind: 'createSpace' })}
            >
              <Plus />
              {t('spaces.create')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** Sıralamayı önce önbellekte uygular (anlık his), sonra API'ye yazar. */
function useReorder() {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  const move = useMove();
  return (
    input: Parameters<typeof move.mutate>[0],
    update: (h: HierarchyResponse) => HierarchyResponse,
  ) => {
    qc.setQueryData(hierarchyQuery(id).queryKey, (h) => (h ? update(h) : h));
    move.mutate(input);
  };
}

function SpaceNode({
  space,
  handle,
  favorites,
  forceOpen,
  ancestors,
}: {
  space: TreeSpace;
  handle: DragHandleProps | null;
  favorites: Favorites;
  forceOpen: boolean;
  ancestors: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  const reorder = useReorder();
  const open = useUiStore((s) => s.expanded[space.id] ?? false) || forceOpen;
  const setExpanded = useUiStore((s) => s.setExpanded);
  const canManage = space.permissions.includes(S.LIST_MANAGE);
  const canSettings = space.permissions.includes(S.SPACE_SETTINGS);
  const favorite = favorites.has(favKey('SPACE', space.id));
  const updateSpace = (fn: (s: TreeSpace) => TreeSpace) => (h: HierarchyResponse) => ({
    ...h,
    spaces: h.spaces.map((s) => (s.id === space.id ? fn(s) : s)),
  });

  return (
    <div>
      <Row
        depth={0}
        target={{ type: 'SPACE', id: space.id }}
        icon={<SpaceAvatar space={space} size={18} />}
        label={space.name}
        expanded={open}
        onToggle={() => setExpanded(space.id, !open)}
        handle={handle}
        aside={
          space.isPrivate ? (
            <Lock
              className="text-muted-foreground size-3"
              aria-label={t('structure.privateSpace')}
            />
          ) : null
        }
        quickAdd={
          canManage
            ? {
                label: t('structure.newListIn', { name: space.name }),
                onClick: () =>
                  actions.open({ kind: 'createList', spaceId: space.id, folderId: null }),
              }
            : undefined
        }
        menuLabel={t('structure.more', { name: space.name })}
        menu={
          <>
            {canManage && (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    actions.open({ kind: 'createList', spaceId: space.id, folderId: null })
                  }
                >
                  <ListPlus />
                  {t('structure.newList')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => actions.open({ kind: 'createFolder', spaceId: space.id })}
                >
                  <FolderPlus />
                  {t('structure.newFolder')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <FavoriteItem type="SPACE" id={space.id} favorite={favorite} />
            <DropdownMenuItem asChild>
              <Link to="/spaces/$spaceId/settings" params={{ spaceId: space.id }}>
                <Settings2 />
                {t('structure.spaceSettings')}
              </Link>
            </DropdownMenuItem>
            {canSettings && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.archive('SPACE', space.id, space.name)}>
                  <Archive />
                  {t('structure.archive')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    actions.open({ kind: 'delete', type: 'SPACE', id: space.id, name: space.name })
                  }
                >
                  <Trash2 />
                  {t('structure.delete')}
                </DropdownMenuItem>
              </>
            )}
          </>
        }
      />
      {open && (
        <div role="group" aria-label={space.name}>
          {space.scrumEnabled && <ScrumLinks spaceId={space.id} />}
          <DocsLink spaceId={space.id} />
          <TimesheetLink spaceId={space.id} />
          <GanttLink spaceId={space.id} />
          <WorkloadLink spaceId={space.id} />
          <SortableGroup
            items={space.folders}
            enabled={canManage}
            onReorder={(id, afterId, reordered) =>
              reorder(
                { type: 'FOLDER', id, afterId },
                updateSpace((s) => ({ ...s, folders: reordered })),
              )
            }
          >
            {(folder, folderHandle) => (
              <FolderNode
                key={folder.id}
                space={space}
                folder={folder}
                handle={folderHandle}
                favorites={favorites}
                forceOpen={ancestors.has(folder.id)}
              />
            )}
          </SortableGroup>
          <ListNodes
            space={space}
            folderId={null}
            lists={space.lists}
            depth={1}
            favorites={favorites}
            onReordered={(reordered) => updateSpace((s) => ({ ...s, lists: reordered }))}
          />
          {space.folders.length === 0 && space.lists.length === 0 && (
            <p className="text-muted-foreground py-1 pl-9 text-xs">{t('structure.emptySpace')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Space altındaki Scrum bağlantıları: Backlog ve sprint panosu (yalnızca Scrum açık Space'lerde). */
function ScrumLinks({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const closeSidebar = useUiStore((s) => s.setSidebarOpen);
  return (
    <>
      <ScrumLink
        to="/spaces/$spaceId/backlog"
        spaceId={spaceId}
        onNavigate={() => closeSidebar(false)}
      >
        <ListOrdered className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="truncate">{t('backlog.link')}</span>
      </ScrumLink>
      <ScrumLink
        to="/spaces/$spaceId/board"
        spaceId={spaceId}
        onNavigate={() => closeSidebar(false)}
      >
        <Kanban className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="truncate">{t('board.link')}</span>
      </ScrumLink>
    </>
  );
}

/** Space Gantt görünümü (Faz 4.5). */
function GanttLink({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const closeSidebar = useUiStore((s) => s.setSidebarOpen);
  return (
    <ScrumLink to="/spaces/$spaceId/gantt" spaceId={spaceId} onNavigate={() => closeSidebar(false)}>
      <GanttChartIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="truncate">{t('gantt.link')}</span>
    </ScrumLink>
  );
}

/** Space iş yükü (Faz 4.4). */
function WorkloadLink({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const closeSidebar = useUiStore((s) => s.setSidebarOpen);
  return (
    <ScrumLink
      to="/spaces/$spaceId/workload"
      spaceId={spaceId}
      onNavigate={() => closeSidebar(false)}
    >
      <Users className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="truncate">{t('workload.link')}</span>
    </ScrumLink>
  );
}

/** Space zaman çizelgesi (Faz 4.3). */
function TimesheetLink({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const closeSidebar = useUiStore((s) => s.setSidebarOpen);
  return (
    <ScrumLink
      to="/spaces/$spaceId/timesheet"
      spaceId={spaceId}
      onNavigate={() => closeSidebar(false)}
    >
      <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="truncate">{t('time.link')}</span>
    </ScrumLink>
  );
}

/** Space'in doküman sayfaları (Faz 3.2). */
function DocsLink({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const closeSidebar = useUiStore((s) => s.setSidebarOpen);
  return (
    <ScrumLink to="/spaces/$spaceId/docs" spaceId={spaceId} onNavigate={() => closeSidebar(false)}>
      <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="truncate">{t('docs.link')}</span>
    </ScrumLink>
  );
}

function ScrumLink({
  to,
  spaceId,
  onNavigate,
  children,
}: {
  to:
    | '/spaces/$spaceId/backlog'
    | '/spaces/$spaceId/board'
    | '/spaces/$spaceId/docs'
    | '/spaces/$spaceId/timesheet'
    | '/spaces/$spaceId/workload'
    | '/spaces/$spaceId/gantt';
  spaceId: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="text-sidebar-foreground hover:bg-sidebar-accent has-[[data-status=active]]:bg-sidebar-accent has-[[data-status=active]]:font-medium flex h-7.5 items-center gap-1 rounded-md pr-1 text-sm"
      style={{ paddingLeft: 4 + 14 }}
    >
      <span className="w-5 shrink-0" aria-hidden />
      <Link
        to={to}
        params={{ spaceId }}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch outline-none focus-visible:underline"
      >
        {children}
      </Link>
    </div>
  );
}

function FolderNode({
  space,
  folder,
  handle,
  favorites,
  forceOpen,
}: {
  space: TreeSpace;
  folder: TreeFolder;
  handle: DragHandleProps | null;
  favorites: Favorites;
  forceOpen: boolean;
}) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  const open = useUiStore((s) => s.expanded[folder.id] ?? true) || forceOpen;
  const setExpanded = useUiStore((s) => s.setExpanded);
  const canManage = space.permissions.includes(S.LIST_MANAGE);

  return (
    <div>
      <Row
        depth={1}
        target={{ type: 'FOLDER', id: folder.id }}
        icon={<Folder className="text-muted-foreground size-3.75" aria-hidden />}
        label={folder.name}
        expanded={open}
        onToggle={() => setExpanded(folder.id, !open)}
        handle={handle}
        quickAdd={
          canManage
            ? {
                label: t('structure.newListIn', { name: folder.name }),
                onClick: () =>
                  actions.open({ kind: 'createList', spaceId: space.id, folderId: folder.id }),
              }
            : undefined
        }
        menuLabel={t('structure.more', { name: folder.name })}
        menu={
          <>
            {canManage && (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    actions.open({ kind: 'createList', spaceId: space.id, folderId: folder.id })
                  }
                >
                  <ListPlus />
                  {t('structure.newList')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    actions.open({
                      kind: 'rename',
                      type: 'FOLDER',
                      id: folder.id,
                      name: folder.name,
                    })
                  }
                >
                  <Pencil />
                  {t('structure.rename')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <FavoriteItem
              type="FOLDER"
              id={folder.id}
              favorite={favorites.has(favKey('FOLDER', folder.id))}
            />
            {canManage && <ArchiveDeleteItems type="FOLDER" id={folder.id} name={folder.name} />}
          </>
        }
      />
      {open && (
        <div role="group" aria-label={folder.name}>
          <ListNodes
            space={space}
            folderId={folder.id}
            lists={folder.lists}
            depth={2}
            favorites={favorites}
            onReordered={(reordered) => (h) => ({
              ...h,
              spaces: h.spaces.map((s) =>
                s.id === space.id
                  ? {
                      ...s,
                      folders: s.folders.map((f) =>
                        f.id === folder.id ? { ...f, lists: reordered } : f,
                      ),
                    }
                  : s,
              ),
            })}
          />
          {folder.lists.length === 0 && (
            <p className="text-muted-foreground py-1 pl-14 text-xs">{t('structure.emptyFolder')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ListNodes({
  space,
  folderId,
  lists,
  depth,
  favorites,
  onReordered,
}: {
  space: TreeSpace;
  folderId: string | null;
  lists: TreeList[];
  depth: number;
  favorites: Favorites;
  onReordered: (reordered: TreeList[]) => (h: HierarchyResponse) => HierarchyResponse;
}) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  const reorder = useReorder();
  const canManage = space.permissions.includes(S.LIST_MANAGE);

  return (
    <SortableGroup
      items={lists}
      enabled={canManage}
      onReorder={(id, afterId, reordered) =>
        reorder({ type: 'LIST', id, folderId, afterId }, onReordered(reordered))
      }
    >
      {(list, handle) => (
        <Row
          key={list.id}
          depth={depth}
          target={{ type: 'LIST', id: list.id }}
          icon={<List className="text-muted-foreground size-3.75" aria-hidden />}
          label={list.name}
          handle={handle}
          menuLabel={t('structure.more', { name: list.name })}
          menu={
            <>
              {canManage && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      actions.open({ kind: 'rename', type: 'LIST', id: list.id, name: list.name })
                    }
                  >
                    <Pencil />
                    {t('structure.rename')}
                  </DropdownMenuItem>
                  {space.folders.length > 0 && (
                    <DropdownMenuItem
                      onSelect={() =>
                        actions.open({
                          kind: 'moveList',
                          spaceId: space.id,
                          id: list.id,
                          folderId,
                          name: list.name,
                        })
                      }
                    >
                      <FolderInput />
                      {t('structure.move')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              <FavoriteItem
                type="LIST"
                id={list.id}
                favorite={favorites.has(favKey('LIST', list.id))}
              />
              {canManage && <ArchiveDeleteItems type="LIST" id={list.id} name={list.name} />}
            </>
          }
        />
      )}
    </SortableGroup>
  );
}

function FavoriteItem({
  type,
  id,
  favorite,
}: {
  type: 'SPACE' | 'FOLDER' | 'LIST';
  id: string;
  favorite: boolean;
}) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  return (
    <DropdownMenuItem onSelect={() => actions.setFavorite(type, id, !favorite)}>
      {favorite ? <StarOff /> : <Star />}
      {t(favorite ? 'structure.removeFavorite' : 'structure.addFavorite')}
    </DropdownMenuItem>
  );
}

function ArchiveDeleteItems({
  type,
  id,
  name,
}: {
  type: 'FOLDER' | 'LIST';
  id: string;
  name: string;
}) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => actions.archive(type, id, name)}>
        <Archive />
        {t('structure.archive')}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => actions.open({ kind: 'delete', type, id, name })}
      >
        <Trash2 />
        {t('structure.delete')}
      </DropdownMenuItem>
    </>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex h-6 items-center px-2">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {children}
      </span>
      {action && <span className="ml-auto flex">{action}</span>}
    </div>
  );
}

/** Ağaç satırı: aç/kapa, ikon, bağlantı, üzerine gelince hızlı ekle + işlemler + sürükleme. */
function Row({
  depth,
  target,
  icon,
  label,
  aside,
  expanded,
  onToggle,
  handle,
  quickAdd,
  menu,
  menuLabel,
}: {
  depth: number;
  target: { type: FavoriteType; id: string };
  icon: ReactNode;
  label: string;
  aside?: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  handle?: DragHandleProps | null;
  quickAdd?: { label: string; onClick: () => void };
  menu: ReactNode;
  menuLabel: string;
}) {
  const { t } = useTranslation();
  const closeSidebar = useUiStore((s) => s.setSidebarOpen);
  return (
    <div
      className="group/row text-sidebar-foreground hover:bg-sidebar-accent has-[[data-status=active]]:bg-sidebar-accent has-[[data-status=active]]:font-medium relative flex h-7.5 items-center gap-1 rounded-md pr-1 text-sm"
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      {handle ? (
        <button
          type="button"
          {...handle}
          aria-label={t('structure.dragHandle', { name: label })}
          className="text-muted-foreground absolute top-1/2 left-0 flex h-5 w-3 -translate-y-1/2 cursor-grab items-center justify-center rounded opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <GripVertical className="size-3" />
        </button>
      ) : null}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'structure.collapse' : 'structure.expand', { name: label })}
          className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <ContainerLink
        type={target.type}
        id={target.id}
        onClick={() => closeSidebar(false)}
        className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch outline-none focus-visible:underline"
      >
        {icon}
        <span className="truncate">{label}</span>
      </ContainerLink>
      {aside}
      <div className="flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-state=open]]:opacity-100 max-md:opacity-100">
        {quickAdd && (
          <Button
            variant="ghost"
            size="icon"
            className="size-5.5"
            aria-label={quickAdd.label}
            onClick={quickAdd.onClick}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-5.5" aria-label={menuLabel}>
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-52">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
