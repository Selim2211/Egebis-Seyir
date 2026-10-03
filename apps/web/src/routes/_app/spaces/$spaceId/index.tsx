import { SPACE_PERMISSIONS as S } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Folder, FolderPlus, List, ListOrdered, ListPlus, Lock, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { useStructureActions } from '@/features/spaces/actions-context';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery, useSpaceMembers, useTreeSpace } from '@/features/spaces/queries';
import { SpaceAvatar } from '@/features/spaces/space-avatar';
import { useCurrentWorkspace } from '@/features/workspace/queries';

export const Route = createFileRoute('/_app/spaces/$spaceId/')({
  component: SpacePage,
});

/** Space ana sayfası (brief §10 madde 4). Backlog bağlantısı Scrum açık Space'lerde görünür. */
function SpacePage() {
  const { t } = useTranslation();
  const { spaceId } = Route.useParams();
  const { id: workspaceId } = useCurrentWorkspace();
  const actions = useStructureActions();
  const { data: space, isPending, isError } = useQuery(spaceQuery(workspaceId, spaceId));
  const tree = useTreeSpace(spaceId);
  const members = useSpaceMembers(spaceId).data?.members ?? [];

  if (isPending) return <LoadingState />;
  if (isError) return <NotFoundState />;

  const canManage = space.permissions.includes(S.LIST_MANAGE) && !space.archived;
  const empty = !tree || (tree.folders.length === 0 && tree.lists.length === 0);

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.id}
        name={space.name}
        archived={space.archived}
        canUnarchive={space.permissions.includes(S.SPACE_SETTINGS)}
        meta={
          <>
            <SpaceAvatar space={space} size={22} className="order-first" />
            <Badge variant="outline" className="font-mono">
              {space.key}
            </Badge>
            {space.isPrivate && (
              <Badge variant="secondary">
                <Lock />
                {t('spaceForm.private')}
              </Badge>
            )}
          </>
        }
        actions={
          <>
            {canManage && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actions.open({ kind: 'createFolder', spaceId })}
                >
                  <FolderPlus />
                  <span className="max-sm:sr-only">{t('structure.newFolder')}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => actions.open({ kind: 'createList', spaceId, folderId: null })}
                >
                  <ListPlus />
                  <span className="max-sm:sr-only">{t('structure.newList')}</span>
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" asChild>
              <Link to="/spaces/$spaceId/settings" params={{ spaceId }}>
                <Settings2 />
                <span className="max-sm:sr-only">{t('structure.spaceSettings')}</span>
              </Link>
            </Button>
          </>
        }
      />

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-labelledby="space-lists" className="min-w-0">
          <h2 id="space-lists" className="mb-2 text-sm font-semibold">
            {t('spacePage.lists')}
          </h2>
          {empty ? (
            <p className="text-muted-foreground bg-card rounded-lg border px-4 py-8 text-center text-sm">
              {t('structure.emptySpace')}
            </p>
          ) : (
            <ul className="bg-card divide-y rounded-lg border">
              {tree.folders.map((f) => (
                <li key={f.id}>
                  <Link
                    to="/folders/$folderId"
                    params={{ folderId: f.id }}
                    className="hover:bg-accent flex items-center gap-2 px-4 py-2.5 text-sm font-medium"
                  >
                    <Folder className="text-muted-foreground size-4" aria-hidden />
                    {f.name}
                    <span className="text-muted-foreground ml-auto text-xs font-normal">
                      {t('spacePage.listCount', { count: f.lists.length })}
                    </span>
                  </Link>
                </li>
              ))}
              {tree.lists.map((l) => (
                <li key={l.id}>
                  <Link
                    to="/lists/$listId"
                    params={{ listId: l.id }}
                    className="hover:bg-accent flex items-center gap-2 px-4 py-2.5 text-sm"
                  >
                    <List className="text-muted-foreground size-4" aria-hidden />
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {space.scrumEnabled && (
            <div className="bg-card mt-6 flex items-center gap-3 rounded-lg border p-4 text-sm">
              <ListOrdered className="text-primary size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{t('spacePage.backlogTitle')}</h2>
                <p className="text-muted-foreground">{t('spacePage.backlogBody')}</p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/spaces/$spaceId/board" params={{ spaceId }}>
                  {t('board.open')}
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/spaces/$spaceId/backlog" params={{ spaceId }}>
                  {t('spacePage.openBacklog')}
                </Link>
              </Button>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {space.description && (
            <section className="bg-card rounded-lg border p-4">
              <h2 className="mb-1 text-sm font-semibold">{t('spaceForm.description')}</h2>
              <p className="text-muted-foreground text-sm whitespace-pre-line">
                {space.description}
              </p>
            </section>
          )}
          <section className="bg-card rounded-lg border p-4" aria-labelledby="space-members">
            <h2 id="space-members" className="mb-2 text-sm font-semibold">
              {t('spacePage.members', { count: members.length })}
            </h2>
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 text-sm">
                  <UserAvatar
                    id={m.userId}
                    name={m.name}
                    size={24}
                    avatarVersion={m.avatarVersion}
                  />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="text-muted-foreground text-xs">{t(`spaceRoles.${m.role}`)}</span>
                </li>
              ))}
            </ul>
            {space.myRole === null && !space.permissions.includes(S.SPACE_SETTINGS) && (
              <p className="text-muted-foreground mt-3 text-xs">{t('spacePage.notMember')}</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
