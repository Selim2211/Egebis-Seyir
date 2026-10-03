import type { Notification } from '@scrum/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  describeNotification,
  notificationTarget,
} from '@/features/notifications/notification-text';
import { notificationsQuery, useMarkAllRead, useMarkRead } from '@/features/notifications/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/notifications')({
  component: NotificationsPage,
});

/** Bildirim merkezi (brief §5.13, ADR-066): okunmamışlar öne çıkar, tıklayınca okundu olur ve hedefe gider. */
function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useInfiniteQuery(notificationsQuery(workspaceId, unreadOnly));
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    const target = notificationTarget(n);
    if (target) void navigate(target);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('notifications.title')}</h1>
        <div role="tablist" aria-label={t('notifications.filter')} className="flex gap-1">
          {([false, true] as const).map((only) => (
            <button
              key={String(only)}
              role="tab"
              type="button"
              aria-selected={unreadOnly === only}
              onClick={() => setUnreadOnly(only)}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm',
                unreadOnly === only
                  ? 'bg-accent font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(only ? 'notifications.unread' : 'notifications.all')}
              {only && unreadCount > 0 && (
                <span className="ml-1.5 tabular-nums">({unreadCount})</span>
              )}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={unreadCount === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck />
          {t('notifications.markAll')}
        </Button>
      </div>

      <div className="bg-card mt-5 overflow-hidden rounded-lg border">
        {query.isPending ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            {t('common.loading')}
          </p>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-14 text-center text-sm">
            <BellOff className="size-6" aria-hidden />
            {t(unreadOnly ? 'notifications.emptyUnread' : 'notifications.empty')}
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    'hover:bg-accent/50 flex w-full items-start gap-3 px-4 py-3 text-left text-sm',
                    !n.read && 'bg-primary/5',
                  )}
                >
                  {n.actor ? (
                    <UserAvatar
                      id={n.actor.id}
                      name={n.actor.name}
                      size={28}
                      avatarVersion={n.actor.avatarVersion}
                    />
                  ) : (
                    <span className="bg-muted size-7 shrink-0 rounded-full" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn(!n.read && 'font-medium')}>
                      {describeNotification(n, t)}
                    </span>
                    {n.item && (
                      <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                        <span className="font-mono">{n.item.key}</span> {n.item.title}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {relativeTime(n.at)}
                  </span>
                  {!n.read && (
                    <span
                      role="img"
                      aria-label={t('notifications.unreadDot')}
                      className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('notifications.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
