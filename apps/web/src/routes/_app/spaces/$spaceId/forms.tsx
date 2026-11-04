import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { FormsPage } from '@/features/forms/forms-page';

const SearchSchema = z.object({ form: z.uuid().optional() });

export const Route = createFileRoute('/_app/spaces/$spaceId/forms')({
  // Yönetici kararıyla gizli (ADR-160): kod ve veri durur, adres Projenin ana sayfasına döner.
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/spaces/$spaceId', params, replace: true });
  },
  validateSearch: SearchSchema,
  component: FormsRoute,
});

function FormsRoute() {
  const { spaceId } = Route.useParams();
  const { form } = Route.useSearch();
  return <FormsPage spaceId={spaceId} formId={form ?? null} />;
}
