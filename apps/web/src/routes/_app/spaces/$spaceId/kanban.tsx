import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { SWIMLANES } from '@/features/board/board-model';
import { KanbanPage, type KanbanSearch } from '@/features/board/kanban-page';

const SearchSchema = z.object({
  lane: z.enum(SWIMLANES).optional(),
  list: z.string().optional(),
  q: z.string().optional(),
  mine: z.boolean().optional(),
  item: z.string().optional(),
});

export const Route = createFileRoute('/_app/spaces/$spaceId/kanban')({
  validateSearch: SearchSchema,
  component: KanbanRoute,
});

function KanbanRoute() {
  const { spaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const onSearch = (patch: Partial<KanbanSearch>) =>
    void navigate({
      to: '.',
      replace: true,
      search: (prev: KanbanSearch) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, value]) => value !== undefined),
        ),
    });
  return <KanbanPage spaceId={spaceId} search={search} onSearch={onSearch} />;
}
