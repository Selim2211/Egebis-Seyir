import { createFileRoute } from '@tanstack/react-router';
import { HistoryPage } from '@/features/sprints/history-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/sprints')({
  component: HistoryRoute,
});

function HistoryRoute() {
  const { spaceId } = Route.useParams();
  return <HistoryPage spaceId={spaceId} />;
}
