import { SPACE_PERMISSIONS as S } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/work-item/work-item-visuals';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { epicsQuery } from './queries';
import { ScrumTabs } from './scrum-tabs';

/** Space'in Epic'leri: hedef, ilerleme çubuğu ve puan/adet özeti (brief §5.7, ADR-068). */
export function EpicsPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const epics = useQuery(epicsQuery(workspaceId, spaceId));

  if (space.isPending || epics.isPending) return <LoadingState />;
  if (space.isError || epics.isError) return <NotFoundState />;

  const statuses = new Map(space.data.statuses.map((s) => [s.id, s]));

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="epics" />
      </ContainerHeader>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 sm:px-6">
        {epics.data.epics.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('epics.empty')}
          </p>
        ) : (
          <ul className="bg-card divide-y rounded-lg border">
            {epics.data.epics.map((epic) => {
              const status = statuses.get(epic.statusId);
              return (
                <li key={epic.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: epic.color ?? 'var(--primary)' }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground font-mono text-xs">{epic.key}</span>
                    <Link
                      to="/items/$key"
                      params={{ key: epic.key }}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {epic.title}
                    </Link>
                    {status && (
                      <StatusBadge
                        category={status.category}
                        label={status.name}
                        color={status.color}
                      />
                    )}
                  </div>
                  {epic.goal && <p className="text-muted-foreground text-sm">{epic.goal}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div
                      className="bg-muted h-2 w-48 max-w-full overflow-hidden rounded-full"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={epic.progress}
                      aria-label={t('epics.progressOf', { key: epic.key })}
                    >
                      <div
                        className="bg-status-done h-full"
                        style={{ width: `${epic.progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium tabular-nums">%{epic.progress}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t('epics.points', {
                        done: epic.stats.donePoints,
                        total: epic.stats.points,
                      })}
                      {' · '}
                      {t('epics.items', {
                        done: epic.stats.doneCount,
                        total: epic.stats.itemCount,
                      })}
                    </span>
                    {epic.stats.unestimatedCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 text-xs">
                        {t('epics.unestimated', { count: epic.stats.unestimatedCount })}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
