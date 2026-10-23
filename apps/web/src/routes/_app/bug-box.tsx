import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { BugBoxPage, type BugBoxSearch } from '@/features/bug-box/bug-box-page';

const SearchSchema = z.object({
  page: z.number().int().min(1).optional(),
  q: z.string().optional(),
  order: z.enum(['new', 'old']).optional(),
});

export const Route = createFileRoute('/_app/bug-box')({
  validateSearch: SearchSchema,
  component: BugBoxRoute,
});

function BugBoxRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const onSearch = (patch: BugBoxSearch) =>
    void navigate({
      to: '.',
      replace: true,
      search: (prev: BugBoxSearch) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, value]) => value !== undefined),
        ),
    });
  return <BugBoxPage search={search} onSearch={onSearch} />;
}
