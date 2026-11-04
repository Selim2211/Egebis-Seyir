import { EffortSheetSchema, SPACE_PERMISSIONS as S } from '@scrum/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Check, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { downloadCsv } from '@/lib/download';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { sprintsQuery } from '@/features/sprints/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { formatShortDate, todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { latestSprint } from './sprint-pick';
import { SprintPicker } from './sprint-picker';

const effortQuery = (workspaceId: string, spaceId: string, sprintId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'effort', sprintId],
    queryFn: () =>
      apiRequest(
        `/workspaces/${workspaceId}/spaces/${spaceId}/effort?sprintId=${sprintId}`,
        EffortSheetSchema,
      ),
  });

/** Kesirli puanı kısa gösterir (1.5 → "1,5"). */
const fmt = (n: number, locale: string) => n.toLocaleString(locale, { maximumFractionDigits: 1 });

/**
 * Zaman çizelgesi, Story Point tabanlı (ADR-164): seçili sprint'te kişi × gün biten puan, kişi başına
 * üstlenilen / biten / kalan puan ve en büyük işler.
 */
export function TimesheetPage({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const today = todayDay();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));
  const [picked, setPicked] = useState<string | null>(null);
  const sprintId = picked ?? latestSprint(sprints.data?.sprints ?? [])?.id ?? null;
  const sheet = useQuery({
    ...effortQuery(workspaceId, spaceId, sprintId ?? ''),
    enabled: sprintId !== null,
  });
  const locale = i18n.language === 'en' ? 'en' : 'tr';

  if (space.isPending || sprints.isPending) return <LoadingState />;
  if (space.isError || sprints.isError) return <NotFoundState />;

  const data = sheet.data;
  const dayName = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(
      new Date(`${day}T12:00:00`),
    );

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-xl font-semibold">{t('time.timesheet')}</h1>
            <p className="text-muted-foreground text-xs">{t('effort.subtitle')}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sprintId && (
              <SprintPicker
                sprints={sprints.data.sprints}
                value={sprintId}
                onChange={(id) => id && setPicked(id)}
                allowWhole={false}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!data || data.rows.length === 0}
              onClick={() =>
                data &&
                downloadCsv(`efor-${data.sprint.name}.csv`, [
                  [
                    t('time.person'),
                    ...data.days,
                    t('effort.committed'),
                    t('effort.done'),
                    t('effort.remaining'),
                  ],
                  ...data.rows.map((r) => [
                    r.user.name,
                    ...r.perDay,
                    r.committed,
                    r.done,
                    r.remaining,
                  ]),
                  [t('time.total'), ...data.dayTotals, data.committed, data.done],
                ])
              }
            >
              <Download /> {t('dashboard.exportCsv')}
            </Button>
          </div>
        </div>

        {!sprintId ? (
          <Empty text={t('effort.noSprint')} />
        ) : !data ? (
          <LoadingState />
        ) : (
          <>
            <Summary
              committed={data.committed}
              done={data.done}
              unassigned={data.unassigned}
              range={`${formatShortDate(data.sprint.startDate)} – ${formatShortDate(data.sprint.endDate)}`}
              locale={locale}
            />
            {data.rows.length === 0 ? (
              <Empty text={t('effort.empty')} />
            ) : (
              <div className="bg-card overflow-x-auto rounded-lg border" data-testid="effort-table">
                <table className="w-full min-w-[44rem] text-sm">
                  <caption className="sr-only">{t('time.timesheet')}</caption>
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        {t('time.person')}
                      </th>
                      {data.days.map((day) => (
                        <th
                          key={day}
                          scope="col"
                          className={cn(
                            'px-1.5 py-2 text-right font-medium capitalize',
                            day === today && 'text-primary',
                          )}
                        >
                          <span className="block">{dayName(day)}</span>
                          {Number(day.slice(8))}
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        {t('effort.committed')}
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        {t('effort.done')}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {t('effort.remaining')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => {
                      const ratio = row.committed > 0 ? row.done / row.committed : 0;
                      return (
                        <tr key={row.user.id} className="border-b last:border-b-0">
                          <th scope="row" className="px-3 py-2 text-left font-medium">
                            <span className="flex items-center gap-2">
                              <UserAvatar
                                id={row.user.id}
                                name={row.user.name}
                                avatarVersion={row.user.avatarVersion}
                                size={22}
                              />
                              <span className="truncate">{row.user.name}</span>
                            </span>
                            <span className="bg-muted mt-1.5 block h-1 overflow-hidden rounded-full">
                              <span
                                className="bg-primary block h-full rounded-full"
                                style={{ width: `${Math.round(ratio * 100)}%` }}
                              />
                            </span>
                          </th>
                          {row.perDay.map((points, i) => (
                            <td key={i} className="px-1.5 py-2 text-right tabular-nums">
                              {points > 0 ? (
                                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                  {fmt(points, locale)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">·</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-right tabular-nums">
                            {fmt(row.committed, locale)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">
                            {fmt(row.done, locale)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmt(row.remaining, locale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t font-medium">
                      <th scope="row" className="px-3 py-2 text-left">
                        {t('time.total')}
                      </th>
                      {data.dayTotals.map((points, i) => (
                        <td key={i} className="px-1.5 py-2 text-right tabular-nums">
                          {points > 0 ? fmt(points, locale) : '–'}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmt(data.committed - data.unassigned, locale)}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {fmt(
                          data.rows.reduce((sum, r) => sum + r.done, 0),
                          locale,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(
                          data.rows.reduce((sum, r) => sum + r.remaining, 0),
                          locale,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {data.topItems.length > 0 && (
              <section aria-labelledby="top-items-title">
                <h2 id="top-items-title" className="mb-2 text-sm font-semibold">
                  {t('effort.topItems')}
                </h2>
                <ul className="bg-card divide-y rounded-lg border">
                  {data.topItems.map((item) => (
                    <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="text-muted-foreground font-mono text-xs">{item.key}</span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          item.done && 'text-muted-foreground line-through',
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="text-muted-foreground hidden truncate text-xs sm:block">
                        {item.assignees.join(', ')}
                      </span>
                      {item.done && (
                        <Check className="size-4 text-emerald-600" aria-label={t('effort.done')} />
                      )}
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {fmt(item.points, locale)} SP
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Summary({
  committed,
  done,
  unassigned,
  range,
  locale,
}: {
  committed: number;
  done: number;
  unassigned: number;
  range: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const percent = committed > 0 ? Math.round((done / committed) * 100) : 0;
  const tiles = [
    [t('effort.committed'), fmt(committed, locale)],
    [t('effort.done'), fmt(done, locale)],
    [t('effort.remaining'), fmt(committed - done, locale)],
    [t('effort.progress'), `%${percent}`],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="bg-card rounded-lg border px-4 py-3">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {range}
        {unassigned > 0 && ` · ${t('effort.unassigned', { points: fmt(unassigned, locale) })}`}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
      {text}
    </p>
  );
}
