import {
  AdminListResponseSchema,
  WORKSPACE_PERMISSIONS,
  type AdminAgeBucket,
  type AdminListItem,
  type AdminListKind,
  type BugSeverity,
} from '@scrum/shared';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bug as BugIcon, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { NotFoundState } from '@/features/spaces/container-header';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { formatDate, formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface AdminListSearch {
  kind: AdminListKind;
  value?: string | undefined;
  page?: number | undefined;
}

const listQuery = (workspaceId: string, s: AdminListSearch) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'admin', 'list', s.kind, s.value ?? '', s.page ?? 1],
    queryFn: () => {
      const params = new URLSearchParams({ kind: s.kind, page: String(s.page ?? 1) });
      if (s.value) params.set('value', s.value);
      return apiRequest(`/workspaces/${workspaceId}/admin/list?${params}`, AdminListResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

const SEVERITY_STYLE: Record<BugSeverity, string> = {
  CRITICAL: 'text-red-700 dark:text-red-300 font-semibold',
  MAJOR: 'text-orange-700 dark:text-orange-300',
  MINOR: 'text-muted-foreground',
  TRIVIAL: 'text-muted-foreground',
};

function Row({ item }: { item: AdminListItem }) {
  const { t } = useTranslation();
  const Icon = item.type === 'BUG' ? BugIcon : CheckSquare;
  const overdue =
    item.dueDate !== null && item.status.category !== 'DONE' && item.dueDate < today();
  return (
    <tr
      className="hover:bg-accent/40 border-b align-top last:border-0"
      data-testid="admin-list-row"
    >
      <td className="px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn('size-4 shrink-0', item.type === 'BUG' ? 'text-red-600' : 'text-sky-600')}
            aria-hidden
          />
          <span className="text-muted-foreground font-mono text-xs">{item.key}</span>
          <Link
            to="/items/$key"
            params={{ key: item.key }}
            className="min-w-0 truncate font-medium hover:underline"
          >
            {item.title}
          </Link>
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: item.space.color }}
            aria-hidden
          />
          {item.space.inbox ? t('bugBox.undecided') : item.space.name}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{item.status.name}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {item.severity ? (
          <span className={SEVERITY_STYLE[item.severity]}>{t(`severity.${item.severity}`)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {item.assignees.length > 0 ? (
          item.assignees.map((a) => a.name).join(', ')
        ) : (
          <span className="text-muted-foreground">{t('adminList.unassigned')}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {item.company ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        {item.dueDate ? (
          <span
            className={cn(overdue && 'font-medium text-red-700 dark:text-red-300')}
            title={t('adminList.due')}
          >
            {formatShortDate(item.dueDate)}
          </span>
        ) : (
          <span className="text-muted-foreground">{formatDate(item.createdAt)}</span>
        )}
      </td>
    </tr>
  );
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

/** Başlık: süzgeç adı + (varsa) değerin adı. */
function useTitle(search: AdminListSearch, valueLabel: string | null | undefined) {
  const { t } = useTranslation();
  const base = t(`adminList.kinds.${search.kind}`);
  let detail = valueLabel ?? null;
  if (search.kind === 'bugs-severity' && search.value)
    detail = t(`severity.${search.value as BugSeverity}`);
  if (search.kind === 'bugs-age' && search.value)
    detail = t(`adminList.age.${search.value as AdminAgeBucket}`);
  if (search.kind === 'bugs-route' && search.value)
    detail = t(`adminList.route.${search.value as 'rule' | 'company' | 'ai' | 'none'}`);
  if (search.kind === 'bugs-company' && search.value === 'none') detail = t('adminList.noCompany');
  return detail ? `${base}: ${detail}` : base;
}

/** Yönetici panelindeki bir kutucuğun ya da grafiğin açtığı liste (ADR-142). Yalnızca Owner/Admin. */
export function AdminListPage({
  search,
  onPage,
}: {
  search: AdminListSearch;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const allowed = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const query = useQuery({ ...listQuery(workspaceId, search), enabled: allowed });
  const title = useTitle(search, query.data?.valueLabel);
  if (!allowed) return <NotFoundState />;
  const data = query.data;

  return (
    <div className="glass-scope min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6" data-testid="admin-list-page">
        <Link
          to="/admin"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t('adminList.back')}
        </Link>
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight" data-testid="admin-list-title">
            {title}
          </h1>
          {data && (
            <span className="text-muted-foreground text-sm" data-testid="admin-list-total">
              {t('adminList.total', { count: data.total })}
            </span>
          )}
        </div>

        {!data ? (
          query.isError ? (
            <NotFoundState />
          ) : (
            <p className="text-muted-foreground py-10 text-sm">{t('common.loading')}</p>
          )
        ) : data.items.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">{t('adminList.empty')}</p>
        ) : (
          <>
            <div className="glass overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    {(
                      [
                        'item',
                        'project',
                        'status',
                        'severity',
                        'assignee',
                        'company',
                        'date',
                      ] as const
                    ).map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">
                        {t(`adminList.col.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <Row key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
            {data.pages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => onPage(data.page - 1)}
                  data-testid="admin-list-prev"
                >
                  <ChevronLeft aria-hidden />
                  {t('bugBox.prev')}
                </Button>
                <span className="text-sm tabular-nums" data-testid="admin-list-page-info">
                  {t('bugBox.pageOf', { page: data.page, pages: data.pages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.pages}
                  onClick={() => onPage(data.page + 1)}
                  data-testid="admin-list-next"
                >
                  {t('bugBox.next')}
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
