import { createFileRoute } from '@tanstack/react-router';
import { MemberProfilePage } from '@/features/spaces/member-profile-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/people/$userId')({
  component: MemberProfileRoute,
});

function MemberProfileRoute() {
  const { spaceId, userId } = Route.useParams();
  return <MemberProfilePage spaceId={spaceId} userId={userId} />;
}
