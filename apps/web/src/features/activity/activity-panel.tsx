import { type ActivityEvent, ActivityResponseSchema, WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BarChart3, Loader2, MessageSquare, Radio, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/user-avatar';
import { useMe } from '@/features/auth/queries';
import { useOpenConversation } from '@/features/messages/queries';
import { describeEvent } from '@/features/work-items/detail/activity-text';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/** Akış 15 sn'de bir tazelenir (yalnızca panel açıkken). */
const ACTIVITY_POLL_MS = 15_000;

const liveActivityQuery = (workspaceId: string) =>
  infiniteQueryOptions({
    queryKey: ['workspaces', workspaceId, 'activity', 'live'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `/workspaces/${workspaceId}/activity?limit=50${pageParam ? `&before=${pageParam}` : ''}`,
        ActivityResponseSchema,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });

/**
 * Akan aktivite penceresi (yönetici notları madde 2): kim ne yapıyor, tarih ve saatiyle. Yalnızca
 * kullanıcının üyesi olduğu Projelerin olayları gelir (Super Admin hepsini görür, ADR-152).
 * İsme tıklayınca mesaj gönderme ve (yetki varsa) kişi analizi açılır.
 */
export function ActivityPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const query = useInfiniteQuery({
    ...liveActivityQuery(workspaceId),
    refetchInterval: ACTIVITY_POLL_MS,
  });
  const events = query.data?.pages.flatMap((p) => p.events) ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside
      aria-label={t('livefeed.title')}
      data-testid="activity-panel"
      className="bg-card animate-in slide-in-from-right fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l shadow-2xl duration-200"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <h2 className="flex-1 text-sm font-semibold">{t('livefeed.title')}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <X />
        </Button>
      </header>
      <p className="text-muted-foreground border-b px-4 py-2 text-xs">{t('livefeed.hint')}</p>
      <div className="flex-1 overflow-y-auto">
        {query.isPending ? (
          <p className="text-muted-foreground flex items-center gap-2 px-4 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t('common.loading')}
          </p>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            {t('activity.empty')}
          </p>
        ) : (
          <ol className="divide-y" aria-live="polite">
            {events.map((event) => (
              <FeedRow key={event.id} event={event} />
            ))}
          </ol>
        )}
        {query.hasNextPage && (
          <div className="p-3 text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t('activity.more')}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

function FeedRow({ event }: { event: ActivityEvent }) {
  const { t } = useTranslation();
  const lines = describeEvent(event, t);
  return (
    <li className="flex gap-2.5 px-4 py-2.5" data-testid="livefeed-row">
      {event.actor ? (
        <UserAvatar
          id={event.actor.id}
          name={event.actor.name}
          size={28}
          avatarVersion={event.actor.avatarVersion}
          className="mt-0.5"
        />
      ) : (
        <span className="bg-muted mt-0.5 size-7 shrink-0 rounded-full" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="leading-snug">
          {event.actor ? (
            <PersonLink person={event.actor} />
          ) : (
            <span className="font-medium">{t('activity.system')}</span>
          )}{' '}
          {event.item && (
            <ItemOpenLink itemKey={event.item.key} className="font-mono text-xs hover:underline">
              {event.item.key}
            </ItemOpenLink>
          )}{' '}
          {lines.map((line, i) => (
            <span key={i} className="text-muted-foreground">
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
        {event.item && <p className="text-muted-foreground truncate text-xs">{event.item.title}</p>}
        <time className="text-muted-foreground text-[11px] tabular-nums" dateTime={event.at}>
          {formatDateTime(event.at)} · {relativeTime(event.at)}
        </time>
      </div>
    </li>
  );
}

/** Kişi adı: mesaj gönder, yetki varsa kişi analizi. */
function PersonLink({ person }: { person: { id: string; name: string } }) {
  const { t } = useTranslation();
  const { user } = useMe();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const open = useOpenConversation();
  const canAnalyze = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const isMe = person.id === user.id;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hover:text-primary font-medium underline-offset-2 hover:underline"
          data-testid="livefeed-person"
        >
          {person.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1.5">
        <p className="truncate px-2 py-1 text-sm font-semibold">{person.name}</p>
        {!isMe && (
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            disabled={open.isPending}
            onClick={() =>
              open.mutate(person.id, {
                onSuccess: ({ id }) => void navigate({ to: '/messages', search: { c: id } }),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <MessageSquare className="size-4" aria-hidden /> {t('livefeed.message')}
          </button>
        )}
        {canAnalyze && (
          <Link
            to="/analytics"
            search={{ av: 'person', ap: person.id }}
            className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          >
            <BarChart3 className="size-4" aria-hidden /> {t('livefeed.profile')}
          </Link>
        )}
        <Link
          to="/workload"
          className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
        >
          <Radio className="size-4" aria-hidden /> {t('livefeed.workload')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
