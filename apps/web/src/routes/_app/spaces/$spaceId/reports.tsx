import { createFileRoute } from '@tanstack/react-router';
import { ReportsPage } from '@/features/sprints/reports-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/reports')({
  component: ReportsRoute,
});

function ReportsRoute() {
  const { spaceId } = Route.useParams();
  return <ReportsPage spaceId={spaceId} />;
}
