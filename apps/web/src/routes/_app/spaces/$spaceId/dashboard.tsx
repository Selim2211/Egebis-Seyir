import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/dashboard')({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { spaceId } = Route.useParams();
  return <DashboardPage spaceId={spaceId} />;
}
