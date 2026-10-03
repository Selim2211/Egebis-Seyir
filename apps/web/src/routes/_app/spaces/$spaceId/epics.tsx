import { createFileRoute } from '@tanstack/react-router';
import { EpicsPage } from '@/features/sprints/epics-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/epics')({
  component: EpicsRoute,
});

function EpicsRoute() {
  const { spaceId } = Route.useParams();
  return <EpicsPage spaceId={spaceId} />;
}
