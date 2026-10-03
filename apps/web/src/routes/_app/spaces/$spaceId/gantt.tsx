import { createFileRoute } from '@tanstack/react-router';
import { GanttPage } from '@/features/time/gantt-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/gantt')({
  component: GanttRoute,
});

function GanttRoute() {
  const { spaceId } = Route.useParams();
  return <GanttPage spaceId={spaceId} />;
}
