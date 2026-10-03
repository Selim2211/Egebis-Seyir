import { formatMinutes, type Flow, type WidgetId } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BurndownSection, VelocitySection } from '@/features/sprints/reports-page';
import { epicsQuery, sprintsQuery, velocityQuery } from '@/features/sprints/queries';
import { workloadQuery } from '@/features/time/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';

const axis = 'var(--muted-foreground)';
const grid = 'var(--border)';

const Empty = ({ text }: { text: string }) => (
  <p className="text-muted-foreground py-8 text-center text-sm">{text}</p>
);

/** Widget gövdesi: kataloğun kimliğine göre içerik (ADR-078). */
export function WidgetBody({
  id,
  spaceId,
  flow,
  scrum,
}: {
  id: WidgetId;
  spaceId: string;
  flow: Flow | undefined;
  scrum: boolean;
}) {
  switch (id) {
    case 'sprint':
      return <SprintWidget spaceId={spaceId} scrum={scrum} />;
    case 'velocity':
      return <VelocityWidget spaceId={spaceId} scrum={scrum} />;
    case 'cfd':
      return flow ? <CfdWidget flow={flow} /> : <Empty text="…" />;
    case 'throughput':
      return flow ? <ThroughputWidget flow={flow} /> : <Empty text="…" />;
    case 'cycle':
      return flow ? <CycleWidget flow={flow} /> : <Empty text="…" />;
    case 'bugs':
      return flow ? <BugsWidget flow={flow} /> : <Empty text="…" />;
    case 'workload':
      return <WorkloadWidget spaceId={spaceId} />;
    case 'epics':
      return <EpicsWidget spaceId={spaceId} scrum={scrum} />;
  }
}

function SprintWidget({ spaceId, scrum }: { spaceId: string; scrum: boolean }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const sprints = useQuery({ ...sprintsQuery(workspaceId, spaceId), enabled: scrum });
  if (!scrum) return <Empty text={t('dashboard.noScrum')} />;
  const active = sprints.data?.sprints.find((s) => s.status === 'ACTIVE');
  if (!active) return <Empty text={t('dashboard.noActiveSprint')} />;
  return (
    <div>
      <p className="text-sm font-medium">
        {active.name}{' '}
        <span className="text-muted-foreground font-normal">
          {formatShortDate(active.startDate)} – {formatShortDate(active.endDate)}
        </span>
      </p>
      {active.goal && <p className="text-muted-foreground text-xs">{active.goal}</p>}
      <BurndownSection workspaceId={workspaceId} sprintId={active.id} />
    </div>
  );
}

function VelocityWidget({ spaceId, scrum }: { spaceId: string; scrum: boolean }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const velocity = useQuery({ ...velocityQuery(workspaceId, spaceId), enabled: scrum });
  if (!scrum) return <Empty text={t('dashboard.noScrum')} />;
  if (!velocity.data) return <Empty text="…" />;
  return <VelocitySection data={velocity.data} />;
}

const day = (iso: string) => formatShortDate(iso);

function CfdWidget({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const rows = flow.cfd.days.map((d, i) => ({
    label: day(d),
    done: flow.cfd.done[i],
    active: flow.cfd.active[i],
    notStarted: flow.cfd.notStarted[i],
  }));
  return (
    <div className="h-64" role="img" aria-label={t('dashboard.cfdLabel')}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} minTickGap={24} />
          <YAxis stroke={axis} fontSize={12} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="done"
            stackId="1"
            name={t('dashboard.cat.DONE')}
            stroke="var(--status-done)"
            fill="var(--status-done)"
            fillOpacity={0.6}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="active"
            stackId="1"
            name={t('dashboard.cat.ACTIVE')}
            stroke="var(--status-active)"
            fill="var(--status-active)"
            fillOpacity={0.6}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="notStarted"
            stackId="1"
            name={t('dashboard.cat.NOT_STARTED')}
            stroke="var(--status-not-started)"
            fill="var(--status-not-started)"
            fillOpacity={0.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ThroughputWidget({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const rows = flow.throughput.map((w) => ({ label: day(w.weekStart), count: w.count }));
  return (
    <div className="h-56" role="img" aria-label={t('dashboard.throughputLabel')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} />
          <YAxis stroke={axis} fontSize={12} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Bar
            dataKey="count"
            name={t('dashboard.completed')}
            fill="var(--primary)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CycleWidget({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const c = flow.cycle;
  if (c.sample === 0) return <Empty text={t('dashboard.noCompleted')} />;
  const days = (value: number | null) => (value === null ? '–' : t('dashboard.days', { value }));
  const cells: Array<[string, string]> = [
    [t('dashboard.sample'), String(c.sample)],
    [t('dashboard.leadAvg'), days(c.leadAvg)],
    [t('dashboard.leadMedian'), days(c.leadMedian)],
    [t('dashboard.cycleAvg'), days(c.cycleAvg)],
    [t('dashboard.cycleMedian'), days(c.cycleMedian)],
    [t('dashboard.cycleP85'), days(c.cycleP85)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="text-xl font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function BugsWidget({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const rows = flow.bugs.opened.map((w, i) => ({
    label: day(w.weekStart),
    opened: w.count,
    closed: flow.bugs.closed[i]?.count ?? 0,
  }));
  return (
    <div className="h-56" role="img" aria-label={t('dashboard.bugsLabel')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} />
          <YAxis stroke={axis} fontSize={12} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line
            dataKey="opened"
            name={t('dashboard.opened')}
            stroke="var(--destructive)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            dataKey="closed"
            name={t('dashboard.closed')}
            stroke="var(--status-done)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WorkloadWidget({ spaceId }: { spaceId: string }) {
  const { t, i18n } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(workloadQuery(workspaceId, spaceId, ''));
  const locale = i18n.language === 'en' ? 'en' : 'tr';
  if (!data) return <Empty text="…" />;
  if (data.rows.length === 0) return <Empty text={t('workload.empty')} />;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t('workload.title')}</caption>
      <thead>
        <tr className="text-muted-foreground border-b text-xs">
          <th scope="col" className="py-1 text-left font-medium">
            {t('time.person')}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('workload.items')}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('workload.remaining')}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t('workload.overdue')}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.rows.slice(0, 6).map((row) => (
          <tr key={row.user?.id ?? 'none'} className="border-b last:border-0">
            <th scope="row" className="py-1 text-left font-medium">
              {row.user?.name ?? t('workload.unassigned')}
            </th>
            <td className="py-1 text-right tabular-nums">{row.itemCount}</td>
            <td className="py-1 text-right tabular-nums">
              {row.remainingMinutes > 0 ? formatMinutes(row.remainingMinutes, locale) : '–'}
            </td>
            <td className="py-1 text-right tabular-nums">{row.overdue}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EpicsWidget({ spaceId, scrum }: { spaceId: string; scrum: boolean }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery({ ...epicsQuery(workspaceId, spaceId), enabled: scrum });
  if (!scrum) return <Empty text={t('dashboard.noScrum')} />;
  if (!data) return <Empty text="…" />;
  if (data.epics.length === 0) return <Empty text={t('epics.empty')} />;
  return (
    <ul className="flex flex-col gap-2">
      {data.epics.slice(0, 6).map((epic) => (
        <li key={epic.id} className="flex items-center gap-2 text-sm">
          <Link
            to="/items/$key"
            params={{ key: epic.key }}
            className="min-w-0 flex-1 truncate hover:underline"
          >
            <span className="text-muted-foreground mr-1.5 font-mono text-xs">{epic.key}</span>
            {epic.title}
          </Link>
          <div
            className="bg-muted h-1.5 w-24 shrink-0 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={epic.progress}
            aria-label={t('epics.progressOf', { key: epic.key })}
          >
            <div className="bg-status-done h-full" style={{ width: `${epic.progress}%` }} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums">%{epic.progress}</span>
        </li>
      ))}
    </ul>
  );
}
