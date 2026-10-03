import { formatMinutes, SPACE_PERMISSIONS as S } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { sprintsQuery } from '@/features/sprints/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';
import { workloadQuery } from './queries';

/** İş yükü (brief §14 Faz 4): kişi başına açık iş, puan, kalan süre, geciken ve yaklaşan işler (ADR-076). */
export function WorkloadPage({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const [sprintId, setSprintId] = useState('');
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const scrum = space.data?.scrumEnabled ?? false;
  const sprints = useQuery({ ...sprintsQuery(workspaceId, spaceId), enabled: scrum });
  const workload = useQuery(workloadQuery(workspaceId, spaceId, sprintId));
  const locale = i18n.language === 'en' ? 'en' : 'tr';

  if (space.isPending || workload.isPending) return <LoadingState />;
  if (space.isError || workload.isError) return <NotFoundState />;

  const rows = workload.data.rows;
  const maxMinutes = Math.max(1, ...rows.map((r) => r.remainingMinutes));
  const maxPoints = Math.max(1, ...rows.map((r) => r.points));
  const selectable = (sprints.data?.sprints ?? []).filter(
    (s) => s.status === 'ACTIVE' || s.status === 'PLANNED',
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
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{t('workload.title')}</h1>
          {scrum && selectable.length > 0 && (
            <NativeSelect
              value={sprintId}
              onChange={(e) => setSprintId(e.target.value)}
              aria-label={t('workload.scope')}
              className="ml-auto h-8 max-w-60"
            >
              <option value="">{t('workload.allOpen')}</option>
              {selectable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{t('workload.hint')}</p>

        {rows.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('workload.empty')}
          </p>
        ) : (
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('workload.title')}</caption>
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {t('time.person')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('workload.items')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {t('workload.points')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {t('workload.remaining')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('workload.overdue')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('workload.dueSoon')}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t('workload.loggedWeek')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user?.id ?? 'none'} className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {row.user?.name ?? (
                        <span className="text-muted-foreground italic">
                          {t('workload.unassigned')}
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{row.itemCount}</td>
                    <td className="px-3 py-2">
                      <Bar value={row.points} max={maxPoints} label={`${row.points}`} />
                    </td>
                    <td className="px-3 py-2">
                      <Bar
                        value={row.remainingMinutes}
                        max={maxMinutes}
                        label={
                          row.remainingMinutes > 0
                            ? formatMinutes(row.remainingMinutes, locale)
                            : '–'
                        }
                      />
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        row.overdue > 0 && 'text-destructive font-medium',
                      )}
                    >
                      {row.overdue}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.dueSoon}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.loggedThisWeekMinutes > 0
                        ? formatMinutes(row.loggedThisWeekMinutes, locale)
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-24 shrink-0 overflow-hidden rounded-full" aria-hidden>
        <div className="bg-primary h-full" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
