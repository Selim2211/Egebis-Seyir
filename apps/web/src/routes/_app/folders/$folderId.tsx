import { SPACE_PERMISSIONS as S } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { List, ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useStructureActions } from '@/features/spaces/actions-context';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { folderQuery, useTreeSpace } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';

export const Route = createFileRoute('/_app/folders/$folderId')({
  component: FolderPage,
});

function FolderPage() {
  const { t } = useTranslation();
  const { folderId } = Route.useParams();
  const { id: workspaceId } = useCurrentWorkspace();
  const actions = useStructureActions();
  const { data: folder, isPending, isError } = useQuery(folderQuery(workspaceId, folderId));
  const space = useTreeSpace(folder?.space.id);
  const canManage = !!space?.permissions.includes(S.LIST_MANAGE);

  if (isPending) return <LoadingState />;
  if (isError) return <NotFoundState />;

  const createList = () =>
    actions.open({ kind: 'createList', spaceId: folder.space.id, folderId: folder.id });

  return (
    <>
      <ContainerHeader
        type="FOLDER"
        id={folder.id}
        name={folder.name}
        crumb={{ space: folder.space }}
        archived={folder.archived}
        canUnarchive={canManage}
        actions={
          canManage &&
          !folder.archived && (
            <Button size="sm" onClick={createList}>
              <ListPlus />
              {t('structure.newList')}
            </Button>
          )
        }
      />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {folder.lists.length > 0 ? (
          <ul className="bg-card divide-y rounded-lg border">
            {folder.lists.map((l) => (
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
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t('structure.emptyFolder')}
          </p>
        )}
      </div>
    </>
  );
}
