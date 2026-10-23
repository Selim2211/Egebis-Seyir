import {
  BugBoxResponseSchema,
  SPACE_PERMISSIONS as S,
  type BugBoxItem,
  type BugSeverity,
  type BugStatus,
} from '@scrum/shared';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Bug as BugIcon,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Mail,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHierarchy } from '@/features/spaces/queries';
import { MoveItemDialog } from '@/features/work-items/move-item-dialog';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface BugBoxSearch {
  page?: number;
  q?: string;
  order?: 'new' | 'old';
}

const bugBoxQuery = (
  workspaceId: string,
  search: { page: number; q: string; sort: 'new' | 'old' },
) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'bug-box', search],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(search.page),
        sort: search.sort,
        ...(search.q ? { q: search.q } : {}),
      });
      return apiRequest(`/workspaces/${workspaceId}/bug-box?${params}`, BugBoxResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

const STATUS_STYLE: Record<BugStatus, string> = {
  UNASSIGNED: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  ASSIGNED: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
};
const SEVERITY_STYLE: Record<BugSeverity, string> = {
  CRITICAL: 'text-red-700 dark:text-red-300 font-semibold',
  MAJOR: 'text-orange-700 dark:text-orange-300',
  MINOR: 'text-muted-foreground',
  TRIVIAL: 'text-muted-foreground',
};

function Row({ bug }: { bug: BugBoxItem }) {
  const { t } = useTranslation();
  const hierarchy = useHierarchy();
  const [moving, setMoving] = useState(false);
  // Belirsiz'deki Bug'ı projeye taşımak için yazma izni gerekir (gelen kutusu Projesi hiyerarşide yoktur).
  const canMove =
    bug.space.inbox ||
    (hierarchy.data?.spaces
      .find((s) => s.id === bug.space.id)
      ?.permissions.includes(S.WORK_ITEM_WRITE) ??
      false);
  return (
    <tr className="hover:bg-accent/40 border-b align-top last:border-0" data-testid="bug-box-row">
      <td className="px-3 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <BugIcon className="size-4 shrink-0 text-red-600" aria-hidden />
            <span className="text-muted-foreground font-mono text-xs">{bug.key}</span>
            <Link
              to="/items/$key"
              params={{ key: bug.key }}
              className="min-w-0 truncate font-medium hover:underline"
            >
              {bug.title}
            </Link>
          </span>
          {bug.convertedTo.length > 0 && (
            <span className="w-fit rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-500/20 dark:text-violet-300">
              {t('bugs.convertedTo', { keys: bug.convertedTo.join(', ') })}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: bug.space.color }}
            aria-hidden
          />
          {bug.space.inbox ? t('bugBox.undecided') : bug.space.name}
        </span>
        {bug.email && (
          <span
            className="text-muted-foreground block max-w-56 truncate text-xs"
            title={bug.email.routeReason ?? ''}
          >
            {bug.email.routeReason}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {bug.email?.company ? (
          <span className="flex flex-col">
            <span className="font-medium">{bug.email.company}</span>
            {bug.email.subCompany && (
              <span className="text-muted-foreground text-xs">{bug.email.subCompany}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {bug.email ? (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Mail className="text-muted-foreground size-3.5" aria-hidden />
              {bug.email.fromName}
            </span>
            <span className="text-muted-foreground max-w-48 truncate text-xs">
              {bug.email.fromEmail}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t('bugBox.manual')}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_STYLE[bug.bugStatus],
          )}
        >
          {t(`bugStatus.${bug.bugStatus}`)}
        </span>
      </td>
      <td
        className={cn('px-3 py-2 whitespace-nowrap', bug.severity && SEVERITY_STYLE[bug.severity])}
      >
        {bug.severity ? t(`severity.${bug.severity}`) : '—'}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {bug.assignee?.name ?? (
          <span className="text-muted-foreground">{t('bugs.unassigned')}</span>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{bug.owner?.name ?? '—'}</td>
      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
        {formatDateTime(bug.createdAt)}
      </td>
      <td className="px-3 py-2 text-right">
        {canMove && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              data-testid="bug-box-move"
              aria-label={t('bugs.move', { key: bug.key })}
              title={t('bugs.move', { key: bug.key })}
              onClick={() => setMoving(true)}
            >
              <FolderInput />
            </Button>
            <MoveItemDialog
              item={{
                id: bug.id,
                key: bug.key,
                type: 'BUG',
                spaceId: bug.space.id,
                childTaskIds: [],
              }}
              open={moving}
              onOpenChange={setMoving}
            />
          </>
        )}
      </td>
    </tr>
  );
}

/** Bug Kutusu (ADR-140): tüm Projelerdeki Bug'lar; sayfa başına 20, tarihe göre sıralı, firma/isim/sahip aramalı. */
export function BugBoxPage({
  search,
  onSearch,
}: {
  search: BugBoxSearch;
  onSearch: (patch: BugBoxSearch) => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const page = search.page ?? 1;
  const sort = search.order ?? 'new';
  const q = search.q ?? '';
  // Yazarken her tuşta istek atılmaz: kutu yerel durum tutar, 350 ms sonra adrese yazılır.
  const [draft, setDraft] = useState(q);
  useEffect(() => {
    if (draft === q) return;
    const timer = setTimeout(() => onSearch({ q: draft || undefined, page: undefined }), 350);
    return () => clearTimeout(timer);
  }, [draft, q, onSearch]);

  const query = useQuery(bugBoxQuery(workspaceId, { page, sort, q }));
  const data = query.data;

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-6 sm:px-6" data-testid="bug-box-page">
      <PageHeading title={t('bugBox.title')} subtitle={t('bugBox.subtitle')} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-96">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('bugBox.search')}
            aria-label={t('bugBox.search')}
            className="h-9 pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="bug-box-sort"
          onClick={() => onSearch({ order: sort === 'new' ? 'old' : 'new', page: undefined })}
        >
          {sort === 'new' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
          {t(sort === 'new' ? 'bugBox.newestFirst' : 'bugBox.oldestFirst')}
        </Button>
        {data && (
          <span
            className="text-muted-foreground ml-auto text-sm tabular-nums"
            data-testid="bug-box-total"
          >
            {t('bugBox.total', { count: data.total })}
          </span>
        )}
      </div>

      {query.isPending ? (
        <p className="text-muted-foreground py-10 text-sm">{t('common.loading')}</p>
      ) : !data || data.items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-14 text-center">
          <BugIcon className="size-8" aria-hidden />
          <p className="font-medium">{t(q ? 'bugBox.noResults' : 'bugBox.empty')}</p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              'bg-card overflow-x-auto rounded-lg border',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wide uppercase">
                  <th className="px-3 py-2">{t('bugBox.col.bug')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.project')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.company')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.sender')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.status')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.severity')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.assignee')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.owner')}</th>
                  <th className="px-3 py-2">{t('bugBox.col.date')}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t('bugs.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((bug) => (
                  <Row key={bug.id} bug={bug} />
                ))}
              </tbody>
            </table>
          </div>
          <nav
            className="mt-3 flex items-center justify-between gap-2"
            aria-label={t('bugBox.pagination')}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => onSearch({ page: data.page - 1 })}
              data-testid="bug-box-prev"
            >
              <ChevronLeft />
              {t('bugBox.prev')}
            </Button>
            <span className="text-sm tabular-nums" data-testid="bug-box-page-info">
              {t('bugBox.pageOf', { page: data.page, pages: data.pages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.pages}
              onClick={() => onSearch({ page: data.page + 1 })}
              data-testid="bug-box-next"
            >
              {t('bugBox.next')}
              <ChevronRight />
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
