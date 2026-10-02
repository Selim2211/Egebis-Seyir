import type { ActivityEvent } from '@scrum/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { relativeTime } from '@/lib/format';
import { describeEvent } from './activity-text';
import { itemActivityQuery } from '../queries';

/** Bir olay satırı: aktör, cümle(ler) ve zaman. `showItem` Ana sayfa akışında öğe bağlantısını gösterir. */
export function ActivityRow({
  event,
  itemLink,
}: {
  event: ActivityEvent;
  itemLink?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const lines = describeEvent(event, t);
  const name = event.actor?.name ?? t('activity.system');
  return (
    <li className="flex gap-2.5 py-2">
      {event.actor ? (
        <UserAvatar
          id={event.actor.id}
          name={event.actor.name}
          size={24}
          avatarVersion={event.actor.avatarVersion}
          className="mt-0.5"
        />
      ) : (
        <span className="bg-muted mt-0.5 size-6 shrink-0 rounded-full" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="font-medium">{name}</span> {itemLink}
          {lines.map((line, i) => (
            <span key={i} className="text-muted-foreground">
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
        <time
          className="text-muted-foreground text-xs"
          dateTime={event.at}
          title={new Date(event.at).toLocaleString()}
        >
          {relativeTime(event.at)}
        </time>
      </div>
    </li>
  );
}

/** Öğe detayındaki "Aktivite" sekmesi: yeniden eskiye, "Daha fazla" ile sayfalanır (ADR-057). */
export function ActivityList({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const query = useInfiniteQuery(itemActivityQuery(workspaceId, itemId));
  const events = query.data?.pages.flatMap((p) => p.events) ?? [];

  if (query.isPending)
    return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>;
  if (events.length === 0)
    return <p className="text-muted-foreground text-sm">{t('activity.empty')}</p>;
  return (
    <div>
      <ul className="divide-y">
        {events.map((event) => (
          <ActivityRow key={event.id} event={event} />
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('activity.more')}
        </Button>
      )}
    </div>
  );
}
