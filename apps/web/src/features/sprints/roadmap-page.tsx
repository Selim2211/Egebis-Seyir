import {
  SPACE_PERMISSIONS as S,
  type EpicsResponse,
  barPlacement,
  timelineMonths,
  timelineRange,
  todayPosition,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate, todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { epicsQuery, sprintsQuery } from './queries';
import { ScrumTabs } from './scrum-tabs';

const MONTH_FORMAT = (key: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(
    new Date(`${key}-01T12:00:00`),
  );

/** Roadmap (brief §5.7): Epic'ler zaman ekseninde çubuk olarak; çubuk içi dolgu ilerlemeyi gösterir. */
export function RoadmapPage({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const epics = useQuery(epicsQuery(workspaceId, spaceId));
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));

  if (space.isPending || epics.isPending || sprints.isPending) return <LoadingState />;
  if (space.isError || epics.isError || sprints.isError) return <NotFoundState />;

  const today = todayDay();
  const visibleSprints = sprints.data.sprints.filter((s) => s.status !== 'CANCELLED');
  const range = timelineRange(
    epics.data.epics,
    today,
    visibleSprints.flatMap((s) => [s.startDate, s.endDate]),
  );
  const months = timelineMonths(range);
  const todayAt = todayPosition(range, today);
  const scheduled = epics.data.epics.flatMap((epic) => {
    const bar = barPlacement(range, epic);
    return bar ? [{ epic, bar }] : [];
  });
  const unscheduled = epics.data.epics.filter((e) => e.startDate === null && e.dueDate === null);

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="roadmap" />
      </ContainerHeader>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {epics.data.epics.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('roadmap.empty')}
          </p>
        ) : (
          <div className="bg-card overflow-x-auto rounded-lg border">
            <div className="grid min-w-[56rem] grid-cols-[14rem_minmax(0,1fr)]">
              {/* Başlık satırı: aylar */}
              <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">
                {t('roadmap.epic')}
              </div>
              <div className="relative h-8 border-b border-l" aria-hidden>
                {months.map((m) => (
                  <div
                    key={m.key}
                    className="text-muted-foreground absolute inset-y-0 border-l px-1.5 py-2 text-xs first:border-l-0"
                    style={{ left: `${m.left}%`, width: `${m.width}%` }}
                  >
                    {MONTH_FORMAT(m.key, i18n.language)}
                  </div>
                ))}
              </div>

              {/* Sprint satırı */}
              <div className="text-muted-foreground flex items-center border-b px-3 py-2 text-xs">
                {t('roadmap.sprints')}
              </div>
              <Track months={months} todayAt={todayAt} className="h-8 border-b">
                {visibleSprints.map((sprint) => {
                  const bar = barPlacement(range, {
                    startDate: sprint.startDate,
                    dueDate: sprint.endDate,
                  });
                  if (!bar) return null;
                  return (
                    <Link
                      key={sprint.id}
                      to="/spaces/$spaceId/review/$sprintId"
                      params={{ spaceId, sprintId: sprint.id }}
                      title={`${sprint.name} · ${formatShortDate(sprint.startDate)} – ${formatShortDate(sprint.endDate)}`}
                      className={cn(
                        'absolute top-1.5 h-5 truncate rounded px-1.5 text-[11px] leading-5',
                        sprint.status === 'ACTIVE'
                          ? 'bg-primary text-primary-foreground'
                          : sprint.status === 'COMPLETED'
                            ? 'bg-muted text-muted-foreground'
                            : 'border border-dashed',
                      )}
                      style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                    >
                      {sprint.name}
                    </Link>
                  );
                })}
              </Track>

              {/* Epic satırları */}
              {scheduled.map(({ epic, bar }) => (
                <EpicRow
                  key={epic.id}
                  epic={epic}
                  bar={bar}
                  months={months}
                  todayAt={todayAt}
                  label={t('roadmap.barLabel', {
                    key: epic.key,
                    title: epic.title,
                    progress: epic.progress,
                  })}
                />
              ))}
            </div>
          </div>
        )}

        {unscheduled.length > 0 && (
          <section aria-labelledby="unscheduled-title" className="mt-6">
            <h2 id="unscheduled-title" className="text-sm font-semibold">
              {t('roadmap.unscheduled')}
            </h2>
            <p className="text-muted-foreground mb-2 text-xs">{t('roadmap.unscheduledHint')}</p>
            <ul className="bg-card divide-y rounded-lg border">
              {unscheduled.map((epic) => (
                <li key={epic.id}>
                  <Link
                    to="/items/$key"
                    params={{ key: epic.key }}
                    className="hover:bg-accent/50 flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground font-mono text-xs">{epic.key}</span>
                    <span className="truncate">{epic.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

type Months = ReturnType<typeof timelineMonths>;

/** Ay çizgileri ve "bugün" işaretiyle yatay iz. */
function Track({
  months,
  todayAt,
  className,
  children,
}: {
  months: Months;
  todayAt: number | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('relative border-l', className)}>
      {months.slice(1).map((m) => (
        <div
          key={m.key}
          className="bg-border absolute inset-y-0 w-px"
          style={{ left: `${m.left}%` }}
          aria-hidden
        />
      ))}
      {todayAt !== null && (
        <div
          className="bg-destructive/70 absolute inset-y-0 z-10 w-px"
          style={{ left: `${todayAt}%` }}
          aria-hidden
        />
      )}
      {children}
    </div>
  );
}

function EpicRow({
  epic,
  bar,
  months,
  todayAt,
  label,
}: {
  epic: EpicsResponse['epics'][number];
  bar: { left: number; width: number; marker: boolean };
  months: Months;
  todayAt: number | null;
  label: string;
}) {
  const color = epic.color ?? 'var(--primary)';
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2 text-sm">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <Link
          to="/items/$key"
          params={{ key: epic.key }}
          className="min-w-0 truncate hover:underline"
        >
          <span className="text-muted-foreground mr-1.5 font-mono text-xs">{epic.key}</span>
          {epic.title}
        </Link>
      </div>
      <Track months={months} todayAt={todayAt} className="h-10 border-b">
        <Link
          to="/items/$key"
          params={{ key: epic.key }}
          aria-label={label}
          title={label}
          className={cn(
            'absolute top-2 h-6 overflow-hidden rounded',
            bar.marker ? 'min-w-2' : 'min-w-1',
          )}
          style={{
            left: `${bar.left}%`,
            width: `${bar.width}%`,
            background: `color-mix(in oklab, ${color} 28%, transparent)`,
            border: `1px solid ${color}`,
          }}
        >
          <span
            className="absolute inset-y-0 left-0"
            style={{ width: `${epic.progress}%`, background: color, opacity: 0.85 }}
            aria-hidden
          />
        </Link>
      </Track>
    </>
  );
}
