import { createFileRoute } from '@tanstack/react-router';
import { ReviewPage } from '@/features/sprints/review-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/review/$sprintId')({
  component: ReviewRoute,
});

function ReviewRoute() {
  const { spaceId, sprintId } = Route.useParams();
  return <ReviewPage spaceId={spaceId} sprintId={sprintId} />;
}
