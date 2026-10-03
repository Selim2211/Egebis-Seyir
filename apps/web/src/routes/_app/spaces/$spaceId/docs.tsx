import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { DocsPage } from '@/features/docs/docs-page';

const SearchSchema = z.object({ doc: z.uuid().optional() });

export const Route = createFileRoute('/_app/spaces/$spaceId/docs')({
  validateSearch: SearchSchema,
  component: DocsRoute,
});

function DocsRoute() {
  const { spaceId } = Route.useParams();
  const { doc } = Route.useSearch();
  return <DocsPage spaceId={spaceId} docId={doc ?? null} />;
}
