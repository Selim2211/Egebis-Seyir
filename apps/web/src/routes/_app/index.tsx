import { WORKSPACE_PERMISSIONS, type WorkItemRow } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Folder, Layers, List, Star, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { StatusBadge, WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { useMe } from '@/features/auth/queries';
import { ContainerLink } from '@/features/spaces/container-header';
import { useHierarchy } from '@/features/spaces/queries';
import { ActivityRow } from '@/features/work-items/detail/activity-list';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { myWorkQuery, recentActivityQuery } from '@/features/work-items/queries';
import { DueCell } from '@/features/work-items/view/cells';
import { dueBucket } from '@/features/work-items/view/view-state';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/')({
  component: HomePage,
});

const ASSIGNED_LIMIT = 8;
const UPCOMING_DAYS = 14;

const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Ana sayfa (brief §10 madde 2, ADR-058): atananlar, yaklaşan teslimler, favoriler, son aktivite. */
function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useMe();
  const { id: workspaceId } = useCurrentWorkspace();
  const canInvite = useCan(WORKSPACE_PERMISSIONS.MEMBERS_MANAGE);
  const firstName = user.name.split(' ')[0] ?? user.name;
  const assigned = useQuery(myWorkQuery(workspaceId, 'assigned', false));
  const activity = useQuery(recentActivityQuery(workspaceId));
  const hierarchy = useHierarchy();

  const today = todayDay();
  const items = assigned.data?.items ?? [];
  const upcoming = items.filter((i) => i.dueDate && i.dueDate <= addDays(today, UPCOMING_DAYS));
  const favorites = hierarchy.data?.favorites ?? [];

  return (
    <ItemNavContext.Provider value={(key) => void navigate({ to: '/items/$key', params: { key } })}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight">
              <span className="text-gradient">{t('home.greeting', { name: firstName })}</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{t('home.subtitle')}</p>
          </div>
          {canInvite && (
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/members">
                <UserPlus />
                {t('home.inviteCta')}
              </Link>
            </Button>
          )}
        </div>

        <div className="stagger mt-7 grid gap-5 lg:grid-cols-2">
          <Card
            title={t('home.assigned')}
            action={
              <Link
                to="/my-work"
                className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                {t('home.seeAll')}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            <ItemList
              items={items.slice(0, ASSIGNED_LIMIT)}
              loading={assigned.isPending}
              empty={t('home.assignedEmpty')}
              today={today}
            />
          </Card>

          <Card title={t('home.upcoming')} hint={t('home.upcomingHint', { days: UPCOMING_DAYS })}>
            <ItemList
              items={upcoming}
              loading={assigned.isPending}
              empty={t('home.upcomingEmpty')}
              today={today}
              showDue
            />
          </Card>

          <Card title={t('nav.favorites')}>
            {hierarchy.isPending ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">{t('common.loading')}</p>
            ) : favorites.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                {t('home.favoritesEmpty')}
              </p>
            ) : (
              <ul className="divide-y">
                {favorites.map((f) => {
                  const Icon = f.type === 'SPACE' ? Layers : f.type === 'FOLDER' ? Folder : List;
                  return (
                    <li key={`${f.type}:${f.id}`}>
                      <ContainerLink
                        type={f.type}
                        id={f.id}
                        className="hover:bg-accent/50 flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        <Star className="size-3.5 fill-amber-400 text-amber-500" aria-hidden />
                        <Icon className="text-muted-foreground size-4" aria-hidden />
                        <span className="truncate">{f.name}</span>
                      </ContainerLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title={t('home.recent')}>
            {activity.isPending ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">{t('common.loading')}</p>
            ) : (activity.data?.events.length ?? 0) === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                {t('activity.empty')}
              </p>
            ) : (
              <ul className="divide-y px-4">
                {activity.data!.events.map((event) => (
                  <ActivityRow
                    key={event.id}
                    event={event}
                    itemLink={
                      event.item ? (
                        <ItemOpenLink
                          itemKey={event.item.key}
                          className="font-mono text-xs hover:underline"
                        >
                          {event.item.key}
                        </ItemOpenLink>
                      ) : null
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </ItemNavContext.Provider>
  );
}

function Card({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="bg-card card-hover min-w-0 overflow-hidden rounded-lg border"
      aria-label={title}
    >
      <header className="from-primary/[0.05] flex items-center gap-2 border-b bg-gradient-to-r to-transparent px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
        <span className="ml-auto">{action}</span>
      </header>
      {children}
    </section>
  );
}

function ItemList({
  items,
  loading,
  empty,
  today,
  showDue,
}: {
  items: WorkItemRow[];
  loading: boolean;
  empty: string;
  today: string;
  showDue?: boolean;
}) {
  if (loading) return <p className="text-muted-foreground px-4 py-3 text-sm">…</p>;
  if (items.length === 0) {
    return <p className="text-muted-foreground px-4 py-6 text-center text-sm">{empty}</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const overdue = dueBucket(item, item.status.category, today) === 'overdue';
        return (
          <li
            key={item.id}
            className="hover:bg-accent/60 flex items-center gap-2 px-4 py-2 text-sm transition-colors"
          >
            <WorkItemTypeIcon type={item.type} />
            <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.key}</span>
            <ItemOpenLink itemKey={item.key} className="min-w-0 flex-1 truncate hover:underline">
              {item.title}
            </ItemOpenLink>
            {showDue ? (
              <span className={cn('shrink-0', overdue && 'text-destructive')}>
                <DueCell item={item} overdue={overdue} />
              </span>
            ) : (
              <StatusBadge
                category={item.status.category}
                label={item.status.name}
                color={item.status.color}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
