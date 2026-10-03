import { SPACE_PERMISSIONS as S, averageVelocity, type SprintSummary } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { sprintsQuery } from './queries';
import { ScrumTabs } from './scrum-tabs';

const STATUS_ORDER: Record<SprintSummary['status'], number> = {
  ACTIVE: 0,
  PLANNED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

/** Tüm sprint'ler: aktif ve planlılar üstte, ardından geçmiş (brief §5.6 "geçmiş sprintleri incele"). */
export function HistoryPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));

  if (space.isPending || sprints.isPending) return <LoadingState />;
  if (space.isError || sprints.isError) return <NotFoundState />;

  const sorted = [...sprints.data.sprints].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0),
  );
  const velocity = averageVelocity(sprints.data.sprints);

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="history" />
      </ContainerHeader>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 sm:px-6">
        {velocity !== null && (
          <p className="text-muted-foreground text-sm">{t('history.average', { velocity })}</p>
        )}
        {sorted.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('history.empty')}
          </p>
        ) : (
          <ul className="bg-card divide-y rounded-lg border">
            {sorted.map((sprint) => (
              <li key={sprint.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to="/spaces/$spaceId/board"
                      params={{ spaceId }}
                      search={{ sprint: sprint.id }}
                      className="font-medium hover:underline"
                    >
                      {sprint.name}
                    </Link>
                    <Badge variant={sprint.status === 'ACTIVE' ? 'default' : 'outline'}>
                      {t(`sprints.status.${sprint.status}`)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
                    {sprint.goal && ` · ${sprint.goal}`}
                  </p>
                </div>
                <Link
                  to="/spaces/$spaceId/review/$sprintId"
                  params={{ spaceId, sprintId: sprint.id }}
                  className="text-primary text-sm hover:underline"
                >
                  {t('review.link')}
                </Link>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {sprint.status === 'COMPLETED'
                    ? t('history.completedPoints', {
                        points: sprint.completedPoints ?? sprint.donePoints,
                      })
                    : t('history.progress', {
                        done: sprint.doneItemCount,
                        total: sprint.itemCount,
                      })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
