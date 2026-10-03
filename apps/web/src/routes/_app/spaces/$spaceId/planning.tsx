import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { PlanningPage } from '@/features/sprints/planning-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/planning')({
  validateSearch: z.object({ sprint: z.string().optional() }),
  component: PlanningRoute,
});

function PlanningRoute() {
  const { spaceId } = Route.useParams();
  const { sprint } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PlanningPage
      spaceId={spaceId}
      sprintId={sprint}
      onSprint={(id) => void navigate({ to: '.', replace: true, search: { sprint: id } })}
    />
  );
}
