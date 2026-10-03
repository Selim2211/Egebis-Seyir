import { createFileRoute } from '@tanstack/react-router';
import { TimesheetPage } from '@/features/time/timesheet-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/timesheet')({
  component: TimesheetRoute,
});

function TimesheetRoute() {
  const { spaceId } = Route.useParams();
  return <TimesheetPage spaceId={spaceId} />;
}
