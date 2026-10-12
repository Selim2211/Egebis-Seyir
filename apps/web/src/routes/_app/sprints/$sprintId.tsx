import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { sprintQuery } from '@/features/sprints/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';

export const Route = createFileRoute('/_app/sprints/$sprintId')({
  component: SprintLinkPage,
});

/** Sprint bağlantısı: `/sprints/<id>` sprint'in panosunu açar (görevler için `/items/MOB-12` gibi, ADR-107). */
function SprintLinkPage() {
  const { sprintId } = Route.useParams();
  const { id: workspaceId } = useCurrentWorkspace();
  const sprint = useQuery(sprintQuery(workspaceId, sprintId));
  if (sprint.isPending) return <LoadingState />;
  if (sprint.isError) return <NotFoundState />;
  return (
    <Navigate
      to="/spaces/$spaceId/board"
      params={{ spaceId: sprint.data.sprint.spaceId }}
      search={{ sprint: sprintId }}
      replace
    />
  );
}
