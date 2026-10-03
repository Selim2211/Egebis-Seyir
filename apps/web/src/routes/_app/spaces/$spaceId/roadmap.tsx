import { createFileRoute } from '@tanstack/react-router';
import { RoadmapPage } from '@/features/sprints/roadmap-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/roadmap')({
  component: RoadmapRoute,
});

function RoadmapRoute() {
  const { spaceId } = Route.useParams();
  return <RoadmapPage spaceId={spaceId} />;
}
