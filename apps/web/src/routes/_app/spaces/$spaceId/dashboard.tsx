import { createFileRoute, redirect } from '@tanstack/react-router';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/dashboard')({
  // Yönetici kararıyla gizli (ADR-160): kod ve veri durur, adres Projenin ana sayfasına döner.
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/spaces/$spaceId', params, replace: true });
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  const { spaceId } = Route.useParams();
  return <DashboardPage spaceId={spaceId} />;
}
