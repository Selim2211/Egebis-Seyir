import { addDays, formatMinutes, SPACE_PERMISSIONS as S, weekdayIndex } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate, todayDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { timesheetQuery } from './queries';

const weekStart = (day: string) => addDays(day, -weekdayIndex(day));

/** Zaman çizelgesi (brief §5.15): hafta bazında kişi × gün süreleri ve en çok zaman harcanan işler. */
export function TimesheetPage({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const today = todayDay();
  const [from, setFrom] = useState(weekStart(today));
  const to = addDays(from, 6);
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const sheet = useQuery(timesheetQuery(workspaceId, spaceId, from, to));
  const locale = i18n.language === 'en' ? 'en' : 'tr';

  if (space.isPending || sheet.isPending) return <LoadingState />;
  if (space.isError || sheet.isError) return <NotFoundState />;

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
          <h1 className="text-xl font-semibold">{t('time.timesheet')}</h1>
          <Button
            variant="outline"
            size="icon"
            className="ml-auto size-8"
            aria-label={t('time.prevWeek')}
            onClick={() => setFrom(addDays(from, -7))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm tabular-nums" aria-live="polite">
            {formatShortDate(from)} – {formatShortDate(to)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t('time.nextWeek')}
            onClick={() => setFrom(addDays(from, 7))}
          >
            <ChevronRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFrom(weekStart(today))}>
            {t('time.thisWeek')}
          </Button>
        </div>

        {data.rows.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('time.emptyWeek')}
          </p>
        ) : (
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-sm">
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
                        'px-2 py-2 text-right font-medium capitalize',
                        day === today && 'text-foreground',
                      )}
                    >
                      {dayName(day)} {Number(day.slice(8))}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('time.total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.user.id} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {row.user.name}
                    </th>
                    {row.perDay.map((minutes, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums">
                        {minutes > 0 ? (
                          formatMinutes(minutes, locale)
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMinutes(row.total, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 border-t font-medium">
                  <th scope="row" className="px-3 py-2 text-left">
                    {t('time.total')}
                  </th>
                  {data.dayTotals.map((minutes, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums">
                      {minutes > 0 ? formatMinutes(minutes, locale) : '–'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMinutes(data.total, locale)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {data.topItems.length > 0 && (
          <section aria-labelledby="top-items-title">
            <h2 id="top-items-title" className="mb-2 text-sm font-semibold">
              {t('time.topItems')}
            </h2>
            <ul className="bg-card divide-y rounded-lg border">
              {data.topItems.map((item) => (
                <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-muted-foreground font-mono text-xs">{item.key}</span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="tabular-nums">{formatMinutes(item.minutes, locale)}</span>
                  {item.estimateHours !== null && (
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        item.minutes > item.estimateHours * 60
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                      )}
                    >
                      / {formatMinutes(Math.round(item.estimateHours * 60), locale)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
