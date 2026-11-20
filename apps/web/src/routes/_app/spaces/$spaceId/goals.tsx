import { createFileRoute } from '@tanstack/react-router';
import { GoalsPage } from '@/features/sprints/goals-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/goals')({
  component: GoalsRoute,
});

function GoalsRoute() {
  const { spaceId } = Route.useParams();
  return <GoalsPage spaceId={spaceId} />;
}
