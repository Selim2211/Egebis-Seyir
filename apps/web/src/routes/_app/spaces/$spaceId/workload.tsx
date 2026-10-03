import { createFileRoute } from '@tanstack/react-router';
import { WorkloadPage } from '@/features/time/workload-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/workload')({
  component: WorkloadRoute,
});

function WorkloadRoute() {
  const { spaceId } = Route.useParams();
  return <WorkloadPage spaceId={spaceId} />;
}
