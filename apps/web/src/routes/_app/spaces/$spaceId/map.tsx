import { createFileRoute } from '@tanstack/react-router';
import { ProjectMapPage } from '@/features/map/project-map-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/map')({
  component: MapRoute,
});

function MapRoute() {
  const { spaceId } = Route.useParams();
  return <ProjectMapPage spaceId={spaceId} />;
}
