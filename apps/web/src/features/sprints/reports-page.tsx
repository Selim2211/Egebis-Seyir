import {
  SPACE_PERMISSIONS as S,
  type SprintBurndown,
  type SprintSummary,
  type VelocityResponse,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NativeSelect } from '@/components/form';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { burndownQuery, sprintsQuery, velocityQuery } from './queries';
import { ScrumTabs } from './scrum-tabs';

const COLORS = {
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
  actual: 'var(--primary)',
  ideal: 'var(--muted-foreground)',
  scope: 'var(--destructive)',
  committed: 'var(--muted-foreground)',
} as const;

/** Raporlar: Sprint Burndown ve Velocity (brief §5.11, ADR-067). */
export function ReportsPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));
  const velocity = useQuery(velocityQuery(workspaceId, spaceId));
  const [picked, setPicked] = useState<string | null>(null);

  if (space.isPending || sprints.isPending) return <LoadingState />;
  if (space.isError || sprints.isError) return <NotFoundState />;

  // Planlı sprint'in burndown'ı yoktur; varsayılan: aktif, yoksa en son biten.
  const reportable = sprints.data.sprints
    .filter((s) => s.status === 'ACTIVE' || s.status === 'COMPLETED' || s.status === 'CANCELLED')
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
  const selected: SprintSummary | undefined =
    reportable.find((s) => s.id === picked) ??
    reportable.find((s) => s.status === 'ACTIVE') ??
    reportable[0];

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="reports" />
      </ContainerHeader>
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section aria-labelledby="burndown-title" className="bg-card rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="burndown-title" className="text-lg font-semibold">
              {t('reports.burndown.title')}
            </h2>
            {reportable.length > 0 && selected && (
              <NativeSelect
                value={selected.id}
                onChange={(e) => setPicked(e.target.value)}
                aria-label={t('reports.burndown.sprint')}
                className="ml-auto h-8 max-w-60"
              >
                {reportable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {t(`sprints.status.${s.status}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
          {selected ? (
            <BurndownSection workspaceId={workspaceId} sprintId={selected.id} />
          ) : (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {t('reports.burndown.noSprint')}
            </p>
          )}
        </section>

        <section aria-labelledby="velocity-title" className="bg-card rounded-lg border p-4">
          <h2 id="velocity-title" className="text-lg font-semibold">
            {t('reports.velocity.title')}
          </h2>
          {velocity.isPending ? (
            <LoadingState />
          ) : velocity.isError ? (
            <NotFoundState />
          ) : (
            <VelocitySection data={velocity.data} />
          )}
        </section>
      </div>
    </>
  );
}

function BurndownSection({ workspaceId, sprintId }: { workspaceId: string; sprintId: string }) {
  const { t } = useTranslation();
  const query = useQuery(burndownQuery(workspaceId, sprintId));
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <NotFoundState />;
  const data: SprintBurndown = query.data;
  const scopeNet = data.points.reduce((sum, p) => sum + p.scopeChange, 0);
  const lastKnown = [...data.points].reverse().find((p) => p.remaining !== null)?.remaining ?? null;
  const remaining = data.currentRemaining ?? lastKnown;

  const rows = data.points.map((p) => ({ ...p, label: formatShortDate(p.date) }));
  const scopeDays = rows.filter((r) => r.scopeChange !== 0);

  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('reports.burndown.baseline')} value={data.baseline} />
        <Stat label={t('reports.burndown.remaining')} value={remaining ?? 0} />
        <Stat label={t('reports.burndown.scope')} value={`${scopeNet > 0 ? '+' : ''}${scopeNet}`} />
      </dl>
      <div
        className="mt-4 h-72"
        role="img"
        aria-label={t('reports.burndown.chartLabel', { name: data.sprint.name })}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={COLORS.axis} fontSize={12} tickLine={false} />
            <YAxis stroke={COLORS.axis} fontSize={12} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line
              type="linear"
              dataKey="ideal"
              name={t('reports.burndown.ideal')}
              stroke={COLORS.ideal}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="remaining"
              name={t('reports.burndown.actual')}
              stroke={COLORS.actual}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            {scopeDays.map((day) => (
              <ReferenceLine
                key={day.date}
                x={day.label}
                stroke={COLORS.scope}
                strokeDasharray="2 3"
                label={{
                  value: `${day.scopeChange > 0 ? '+' : ''}${day.scopeChange}`,
                  fill: COLORS.scope,
                  fontSize: 11,
                  position: 'top',
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {data.points.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('reports.burndown.planned')}</p>
      )}
      {scopeDays.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">{t('reports.burndown.scopeHint')}</p>
      )}
    </div>
  );
}

function VelocitySection({ data }: { data: VelocityResponse }) {
  const { t } = useTranslation();
  if (data.sprints.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t('reports.velocity.empty')}
      </p>
    );
  }
  const rows = data.sprints.map((s) => ({
    name: s.name,
    committed: s.committedPoints,
    completed: s.completedPoints,
  }));
  return (
    <div className="mt-3">
      {data.average !== null && (
        <p className="text-sm">{t('reports.velocity.average', { velocity: data.average })}</p>
      )}
      <div className="mt-3 h-64" role="img" aria-label={t('reports.velocity.chartLabel')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" stroke={COLORS.axis} fontSize={12} tickLine={false} />
            <YAxis stroke={COLORS.axis} fontSize={12} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar
              dataKey="committed"
              name={t('reports.velocity.committed')}
              fill={COLORS.committed}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="completed"
              name={t('reports.velocity.completed')}
              fill={COLORS.actual}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            {data.average !== null && (
              <ReferenceLine y={data.average} stroke={COLORS.scope} strokeDasharray="4 4" />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">{t('reports.velocity.table')}</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="py-1.5 font-medium">{t('reports.velocity.sprint')}</th>
            <th className="py-1.5 text-right font-medium">{t('reports.velocity.committed')}</th>
            <th className="py-1.5 text-right font-medium">{t('reports.velocity.completed')}</th>
          </tr>
        </thead>
        <tbody>
          {data.sprints.map((s) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="py-1.5">{s.name}</td>
              <td className="py-1.5 text-right tabular-nums">{s.committedPoints ?? '–'}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{s.completedPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
