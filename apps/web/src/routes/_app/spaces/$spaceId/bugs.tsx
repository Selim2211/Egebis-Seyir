import { BUG_STATUSES } from '@scrum/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { BugsPage, type BugsSearch } from '@/features/bugs/bugs-page';

const SearchSchema = z.object({
  state: z.enum(BUG_STATUSES).optional(),
  item: z.string().optional(),
  report: z.boolean().optional(),
});

export const Route = createFileRoute('/_app/spaces/$spaceId/bugs')({
  validateSearch: SearchSchema,
  component: BugsRoute,
});

function BugsRoute() {
  const { spaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const onSearch = (patch: Partial<BugsSearch>) =>
    void navigate({
      to: '.',
      replace: true,
      search: (prev: BugsSearch) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, value]) => value !== undefined),
        ),
    });
  return <BugsPage spaceId={spaceId} search={search} onSearch={onSearch} />;
}
