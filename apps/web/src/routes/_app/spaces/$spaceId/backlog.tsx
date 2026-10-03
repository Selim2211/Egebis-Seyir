import { createFileRoute } from '@tanstack/react-router';
import { BacklogPage } from '@/features/sprints/backlog-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/backlog')({
  component: BacklogRoute,
});

function BacklogRoute() {
  const { spaceId } = Route.useParams();
  return <BacklogPage spaceId={spaceId} />;
}
