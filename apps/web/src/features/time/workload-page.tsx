import { formatMinutes, SPACE_PERMISSIONS as S, type Workload } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '@/components/form';
import { Label } from '@/components/ui/label';
import { useMe } from '@/features/auth/queries';
import { useHierarchy } from '@/features/spaces/queries';
import { sprintsQuery } from '@/features/sprints/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { workspaceWorkloadQuery } from './queries';
import { latestSprint } from './sprint-pick';
import { SprintPicker } from './sprint-picker';

const ALL = '__all';

/**
 * İş yükü (ADR-076, ADR-132): Space (workspace) → Proje → Sprint seçilir. Space ve Proje seçimi hatırlanır
 * (kullanıcı değiştirene kadar). Proje seçilmezse Space'teki tüm Proje'ler, sprint seçilmezse Proje geneli
 * görünür; sprint varsayılanı en son sprint'tir.
 */
export function WorkloadPage() {
  const { t } = useTranslation();
  const me = useMe();
  const { id: workspaceId } = useCurrentWorkspace();
  const setWorkspaceId = useUiStore((s) => s.setWorkspaceId);
  const saved = useUiStore((s) => s.workloadSpace[workspaceId]);
  const setWorkloadSpace = useUiStore((s) => s.setWorkloadSpace);
  const hierarchy = useHierarchy();

  const spaces = (hierarchy.data?.spaces ?? []).filter((s) =>
    s.permissions.includes(S.REPORT_VIEW),
  );
  const space = spaces.find((s) => s.id === saved) ?? null;

  const selectors = (
    <>
      <SelectField
        label={t('workload.space')}
        value={workspaceId}
        className="min-w-48"
        onChange={(e) => setWorkspaceId(e.target.value)}
      >
        {me.workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('workload.project')}
        value={space?.id ?? ALL}
        className="min-w-48"
        onChange={(e) =>
          setWorkloadSpace(workspaceId, e.target.value === ALL ? null : e.target.value)
        }
      >
        <option value={ALL}>{t('workload.allProjects')}</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>
    </>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex items-center gap-2">
        <Users className="text-primary size-5" aria-hidden />
        <h1 className="text-xl font-semibold">{t('workload.title')}</h1>
      </div>
      {space?.scrumEnabled ? (
        <SprintScope key={space.id} spaceId={space.id} selectors={selectors} />
      ) : (
        <Scope selectors={selectors} spaceId={space?.id ?? null} sprintId={null} />
      )}
    </div>
  );
}

/** Scrum Proje'si: sprint seçimi Proje değişince sıfırlanır (varsayılan: en son sprint). */
function SprintScope({ spaceId, selectors }: { spaceId: string; selectors: ReactNode }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));
  // undefined: kullanıcı seçmedi → en son sprint; null: Proje geneli.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const list = sprints.data?.sprints ?? [];
  const sprintId = picked === undefined ? (latestSprint(list)?.id ?? null) : picked;
  return (
    <Scope
      selectors={
        <>
          {selectors}
          <div className="flex flex-col gap-1.5">
            <Label>{t('workload.sprint')}</Label>
            {sprints.isPending ? (
              <span className="text-muted-foreground flex h-9 items-center text-sm">
                {t('common.loading')}
              </span>
            ) : (
              <SprintPicker sprints={list} value={sprintId} onChange={setPicked} />
            )}
          </div>
        </>
      }
      spaceId={spaceId}
      sprintId={sprintId}
      ready={!sprints.isPending}
    />
  );
}

function Scope({
  selectors,
  spaceId,
  sprintId,
  ready = true,
}: {
  selectors: ReactNode;
  spaceId: string | null;
  sprintId: string | null;
  ready?: boolean;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const workload = useQuery({
    ...workspaceWorkloadQuery(workspaceId, spaceId, sprintId),
    enabled: ready,
    placeholderData: (previous) => previous,
  });
  const scopeText = !spaceId
    ? t('workload.scopeAll')
    : sprintId
      ? t('workload.scopeSprint', { name: workload.data?.sprint?.name ?? '' })
      : t('workload.scopeProject');
  return (
    <>
      <div className="bg-card flex flex-wrap items-end gap-3 rounded-xl border p-3">
        {selectors}
      </div>
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-medium" data-testid="workload-scope">
          {scopeText}
        </span>{' '}
        · {t('workload.hint')}
      </p>
      {workload.isPending ? (
        <p className="text-muted-foreground px-1 py-6 text-sm">{t('common.loading')}</p>
      ) : workload.isError ? (
        <p className="text-destructive px-1 py-6 text-sm">{t('errors.INTERNAL')}</p>
      ) : (
        <WorkloadTable rows={workload.data.rows} fading={workload.isFetching} />
      )}
    </>
  );
}

function WorkloadTable({ rows, fading }: { rows: Workload['rows']; fading: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'tr';
  const maxMinutes = Math.max(1, ...rows.map((r) => r.remainingMinutes));
  const maxPoints = Math.max(1, ...rows.map((r) => r.points));
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
        {t('workload.empty')}
      </p>
    );
  }
  return (
    <div
      className={cn(
        'bg-card overflow-x-auto rounded-lg border transition-opacity',
        fading && 'opacity-60',
      )}
    >
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
                  <span className="text-muted-foreground italic">{t('workload.unassigned')}</span>
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
                    row.remainingMinutes > 0 ? formatMinutes(row.remainingMinutes, locale) : '–'
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
