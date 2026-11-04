import { ActivityResponseSchema, MemberProfileSchema, SPACE_PERMISSIONS as S } from '@scrum/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { StatusBadge, WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { FeedRow } from '@/features/activity/activity-panel';
import { useRoleLabel } from '@/features/roles/queries';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { statusName } from '@/lib/default-names';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const base = (workspaceId: string, spaceId: string, userId: string) =>
  `/workspaces/${workspaceId}/spaces/${spaceId}/members/${userId}`;

const profileQuery = (workspaceId: string, spaceId: string, userId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'member-profile', userId],
    queryFn: () => apiRequest(`${base(workspaceId, spaceId, userId)}/profile`, MemberProfileSchema),
  });

const activityQuery = (workspaceId: string, spaceId: string, userId: string) =>
  infiniteQueryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'member-activity', userId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `${base(workspaceId, spaceId, userId)}/activity${pageParam ? `?before=${pageParam}` : ''}`,
        ActivityResponseSchema,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });

const fmt = (n: number, locale: string) => n.toLocaleString(locale, { maximumFractionDigits: 1 });

/**
 * Kişinin Projedeki profili (ADR-165): Proje Yöneticisi ve Super Admin görür. Hangi sprint'te ne
 * kadar iş üstlendiği ve bitirdiği, açık işleri ve bu Projedeki son hareketleri.
 */
export function MemberProfilePage({ spaceId, userId }: { spaceId: string; userId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const roleLabel = useRoleLabel();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const canView = space.data?.permissions.includes(S.SPACE_SETTINGS) ?? false;
  const profile = useQuery({ ...profileQuery(workspaceId, spaceId, userId), enabled: canView });
  const activity = useInfiniteQuery({
    ...activityQuery(workspaceId, spaceId, userId),
    enabled: canView,
  });
  const locale = i18n.language === 'en' ? 'en' : 'tr';

  if (space.isPending) return <LoadingState />;
  if (space.isError || !canView) return <NotFoundState />;
  if (profile.isPending) return <LoadingState />;
  if (profile.isError) return <NotFoundState />;
  const p = profile.data;
  const events = activity.data?.pages.flatMap((page) => page.events) ?? [];
  const tiles = [
    [t('memberProfile.donePoints'), fmt(p.totals.donePoints, locale)],
    [t('memberProfile.doneItems'), String(p.totals.doneItems)],
    [t('memberProfile.openPoints'), fmt(p.totals.openPoints, locale)],
    [t('memberProfile.resolvedBugs'), String(p.totals.resolvedBugs)],
  ] as const;
  const maxCommitted = Math.max(1, ...p.sprints.map((s) => s.committed));

  return (
    <ItemNavContext.Provider value={(key) => void navigate({ to: '/items/$key', params: { key } })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive
      />
      <div
        className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6"
        data-testid="member-profile"
      >
        <Link
          to="/spaces/$spaceId"
          params={{ spaceId }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {space.data.name}
        </Link>

        <header className="flex items-center gap-4">
          <UserAvatar
            id={p.user.id}
            name={p.user.name}
            avatarVersion={p.user.avatarVersion}
            size={56}
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{p.user.name}</h1>
            <p className="text-muted-foreground text-sm">
              {[p.user.title, p.role ? roleLabel('SPACE', p.role) : t('memberProfile.notMember')]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="bg-card rounded-lg border px-4 py-3">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <section aria-labelledby="mp-sprints" className="bg-card rounded-lg border">
          <h2 id="mp-sprints" className="border-b px-4 py-3 text-sm font-semibold">
            {t('memberProfile.sprints')}
          </h2>
          {p.sprints.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              {t('memberProfile.noSprints')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="px-4 py-2 text-left font-medium">Sprint</th>
                    <th className="w-2/5 px-2 py-2 text-left font-medium">
                      {t('memberProfile.load')}
                    </th>
                    <th className="px-2 py-2 text-right font-medium">{t('effort.committed')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('effort.done')}</th>
                    <th className="px-2 py-2 text-right font-medium">{t('memberProfile.items')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('memberProfile.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.sprints.map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0" data-testid="mp-sprint">
                      <td className="px-4 py-2">
                        <span className="block font-medium">{s.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatShortDate(s.startDate)} – {formatShortDate(s.endDate)}
                          {s.status === 'ACTIVE' && ` · ${t('myWork.sprintStatus.ACTIVE')}`}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="bg-muted relative block h-2.5 overflow-hidden rounded-full">
                          <span
                            className="bg-primary/30 absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${(s.committed / maxCommitted) * 100}%` }}
                          />
                          <span
                            className="bg-primary absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${(s.done / maxCommitted) * 100}%` }}
                          />
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmt(s.committed, locale)}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {fmt(s.done, locale)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {s.doneItems}/{s.items}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        %{Math.round(s.share * 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-labelledby="mp-open" className="bg-card rounded-lg border">
            <h2 id="mp-open" className="border-b px-4 py-3 text-sm font-semibold">
              {t('memberProfile.openItems', { count: p.totals.openItems })}
            </h2>
            {p.openItems.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                {t('memberProfile.noOpen')}
              </p>
            ) : (
              <ul className="divide-y">
                {p.openItems.map((item) => (
                  <li key={item.key} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <WorkItemTypeIcon type={item.type} />
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {item.key}
                    </span>
                    <ItemOpenLink
                      itemKey={item.key}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {item.title}
                    </ItemOpenLink>
                    {item.points !== null && (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {fmt(item.points, locale)} SP
                      </span>
                    )}
                    <span className="w-28 shrink-0">
                      <StatusBadge
                        category={item.status.category as 'NOT_STARTED' | 'ACTIVE' | 'DONE'}
                        label={statusName(item.status.name)}
                        color={item.status.color}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="mp-activity" className="bg-card rounded-lg border">
            <h2 id="mp-activity" className="border-b px-4 py-3 text-sm font-semibold">
              {t('memberProfile.activity')}
            </h2>
            {events.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                {activity.isPending ? t('common.loading') : t('memberProfile.noActivity')}
              </p>
            ) : (
              <ul className={cn('divide-y')}>
                {events.map((event) => (
                  <FeedRow key={event.id} event={event} />
                ))}
              </ul>
            )}
            {activity.hasNextPage && (
              <div className="border-t p-2 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={activity.isFetchingNextPage}
                  onClick={() => void activity.fetchNextPage()}
                >
                  {t('activity.more')}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </ItemNavContext.Provider>
  );
}
