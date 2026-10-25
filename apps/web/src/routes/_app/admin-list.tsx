import { ADMIN_LIST_KINDS } from '@scrum/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { AdminListPage } from '@/features/admin/admin-list-page';

const SearchSchema = z.object({
  kind: z.enum(ADMIN_LIST_KINDS).catch('bugs-open'),
  value: z.string().optional(),
  page: z.number().int().min(1).optional(),
});

/** Yönetici panelindeki kutucuk ve grafiklerin açtığı filtreli liste (ADR-142). */
export const Route = createFileRoute('/_app/admin-list')({
  validateSearch: SearchSchema,
  component: AdminListRoute,
});

function AdminListRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <AdminListPage
      search={search}
      onPage={(page) =>
        void navigate({
          to: '/admin-list',
          search: { kind: search.kind, ...(search.value ? { value: search.value } : {}), page },
        })
      }
    />
  );
}
