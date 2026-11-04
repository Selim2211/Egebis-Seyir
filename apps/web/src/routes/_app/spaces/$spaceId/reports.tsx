import { createFileRoute, redirect } from '@tanstack/react-router';
import { ReportsPage } from '@/features/sprints/reports-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/reports')({
  // Yönetici kararıyla gizli (ADR-160): kod ve veri durur, adres Projenin ana sayfasına döner.
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/spaces/$spaceId', params, replace: true });
  },
  component: ReportsRoute,
});

function ReportsRoute() {
  const { spaceId } = Route.useParams();
  return <ReportsPage spaceId={spaceId} />;
}
