import { createFileRoute, redirect } from '@tanstack/react-router';
import { GanttPage } from '@/features/time/gantt-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/gantt')({
  // Yönetici kararıyla gizli (ADR-160): kod ve veri durur, adres Projenin ana sayfasına döner.
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/spaces/$spaceId', params, replace: true });
  },
  component: GanttRoute,
});

function GanttRoute() {
  const { spaceId } = Route.useParams();
  return <GanttPage spaceId={spaceId} />;
}
