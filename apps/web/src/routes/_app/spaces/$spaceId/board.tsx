import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { SWIMLANES } from '@/features/board/board-model';
import { SprintBoardPage, type SprintBoardSearch } from '@/features/board/sprint-board-page';

const SearchSchema = z.object({
  sprint: z.string().optional(),
  lane: z.enum(SWIMLANES).optional(),
  item: z.string().optional(),
});

export const Route = createFileRoute('/_app/spaces/$spaceId/board')({
  validateSearch: SearchSchema,
  component: BoardRoute,
});

function BoardRoute() {
  const { spaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const onSearch = (patch: Partial<SprintBoardSearch>) =>
    void navigate({
      to: '.',
      replace: true,
      search: (prev: SprintBoardSearch) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, value]) => value !== undefined),
        ),
    });
  return <SprintBoardPage spaceId={spaceId} search={search} onSearch={onSearch} />;
}
