import { createFileRoute } from '@tanstack/react-router';
import { RetroPage } from '@/features/sprints/retro-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/retro/$sprintId')({
  component: RetroRoute,
});

function RetroRoute() {
  const { spaceId, sprintId } = Route.useParams();
  return <RetroPage spaceId={spaceId} sprintId={sprintId} />;
}
