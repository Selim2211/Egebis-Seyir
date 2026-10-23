import {
  AdminOverviewSchema,
  WORKSPACE_PERMISSIONS,
  type AdminOverview,
  type AdminProject,
  type BugSeverity,
} from '@scrum/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Bug, CheckCircle2, Inbox, Mail, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { NotFoundState } from '@/features/spaces/container-header';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const adminQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'admin', 'overview'],
    queryFn: () => apiRequest(`/workspaces/${workspaceId}/admin/overview`, AdminOverviewSchema),
    refetchInterval: 60_000,
  });

const AXIS = 'var(--muted-foreground)';
const GRID = 'var(--border)';
const RED = '#dc2626';
const GREEN = '#16a34a';
const BLUE = '#2563eb';
const AMBER = '#d97706';
const SEVERITY_COLOR: Record<BugSeverity, string> = {
  CRITICAL: '#b91c1c',
  MAJOR: '#ea580c',
  MINOR: '#ca8a04',
  TRIVIAL: '#94a3b8',
};
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
};

/** Süre: 48 saatten kısaysa saat, değilse gün. */
function useDuration() {
  const { t } = useTranslation();
  return (hours: number | null) => {
    if (hours === null) return '—';
    return hours < 48
      ? t('admin.hours', { value: hours.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) })
      : t('admin.days', {
          value: (hours / 24).toLocaleString('tr-TR', { maximumFractionDigits: 1 }),
        });
  };
}

function Kpi({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'bad' | 'good' | 'warn';
  icon?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'bg-card flex flex-col gap-1 rounded-xl border p-4',
        tone === 'bad' &&
          'border-red-300/70 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10',
        tone === 'good' &&
          'border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10',
        tone === 'warn' &&
          'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10',
      )}
    >
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('bg-card rounded-xl border p-4', className)}>
      <header className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => (
  <p className="text-muted-foreground py-10 text-center text-sm">{text}</p>
);

/** Sprint gidişi: tamamlanma yüzdesi geçen süreden çok geride mi? */
function health(p: AdminProject): 'none' | 'good' | 'behind' {
  if (!p.sprint) return 'none';
  const done = p.sprint.totalItems === 0 ? 0 : (p.sprint.doneItems / p.sprint.totalItems) * 100;
  return done + 15 < p.sprint.elapsedPercent ? 'behind' : 'good';
}

function ProjectCard({ project }: { project: AdminProject }) {
  const { t } = useTranslation();
  const sprint = project.sprint;
  const pct =
    sprint && sprint.totalItems > 0 ? Math.round((sprint.doneItems / sprint.totalItems) * 100) : 0;
  const state = health(project);
  return (
    <Link
      to="/spaces/$spaceId/backlog"
      params={{ spaceId: project.id }}
      data-testid="admin-project"
      className="bg-card hover:border-primary/50 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-semibold">{project.name}</span>
        <span className="text-muted-foreground font-mono text-xs">{project.key}</span>
        {project.inbox && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
            {t('admin.inbox')}
          </span>
        )}
      </div>

      {sprint ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{sprint.name}</span>
            <span className="text-muted-foreground">
              {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)} ·{' '}
              {t('admin.daysLeft', { count: sprint.daysLeft })}
            </span>
          </div>
          <div
            className="bg-muted relative h-2.5 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('admin.sprintProgress', { name: project.name })}
          >
            <div
              className={cn(
                'h-full rounded-full',
                state === 'behind' ? 'bg-amber-500' : 'bg-emerald-500',
              )}
              style={{ width: `${pct}%` }}
            />
            <span
              className="bg-foreground/60 absolute top-0 h-full w-0.5"
              style={{ left: `${sprint.elapsedPercent}%` }}
              title={t('admin.elapsed', { percent: sprint.elapsedPercent })}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="tabular-nums">
              {t('admin.doneOf', {
                done: sprint.doneItems,
                total: sprint.totalItems,
                percent: pct,
              })}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-medium',
                state === 'behind'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
              )}
            >
              {t(state === 'behind' ? 'admin.behind' : 'admin.onTrack')}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t('admin.noActiveSprint')}</p>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="bg-muted rounded-full px-2 py-0.5 tabular-nums">
          {t('admin.openItems', { count: project.openItems })}
        </span>
        {project.overdueItems > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 tabular-nums dark:bg-red-500/20 dark:text-red-300">
            {t('admin.overdueItems', { count: project.overdueItems })}
          </span>
        )}
        {project.openBugs > 0 && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-800 tabular-nums dark:bg-orange-500/20 dark:text-orange-300">
            {t('admin.openBugs', { count: project.openBugs })}
          </span>
        )}
      </div>
    </Link>
  );
}

function Dashboard({ data }: { data: AdminOverview }) {
  const { t } = useTranslation();
  const duration = useDuration();
  const { bugs, totals, tickets } = data;
  const dailyData = bugs.daily.map((d) => ({ ...d, label: formatShortDate(d.date) }));
  const throughput = data.throughput.map((d) => ({ ...d, label: formatShortDate(d.date) }));
  const severity = bugs.openBySeverity.map((s) => ({
    ...s,
    name: t(`severity.${s.severity}`),
  }));
  const source = [
    { name: t('admin.sourceEmail'), value: bugs.bySource.email, color: BLUE },
    { name: t('admin.sourceManual'), value: bugs.bySource.manual, color: '#94a3b8' },
  ];
  const projects = [...data.projects].sort(
    (a, b) =>
      Number(health(b) === 'behind') - Number(health(a) === 'behind') ||
      b.overdueItems - a.overdueItems ||
      a.name.localeCompare(b.name, 'tr'),
  );
  const load = data.workload.map((p) => ({
    ...p,
    onTime: p.open - p.overdue,
    label: p.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-red-700 uppercase dark:text-red-300">
          {t('admin.bugSection')}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            testId="kpi-new-today"
            label={t('admin.newToday')}
            value={bugs.newToday}
            sub={t('admin.resolvedSub', { count: bugs.resolvedToday })}
            icon={<Bug className="size-3.5" aria-hidden />}
          />
          <Kpi
            testId="kpi-new-week"
            label={t('admin.newWeek')}
            value={bugs.newThisWeek}
            sub={t('admin.resolvedSub', { count: bugs.resolvedThisWeek })}
          />
          <Kpi
            testId="kpi-open"
            label={t('admin.openBugsTitle')}
            value={bugs.open}
            tone={bugs.openUnassigned > 0 ? 'warn' : 'default'}
            sub={t('admin.unassignedSub', { count: bugs.openUnassigned })}
          />
          <Kpi
            testId="kpi-rate"
            label={t('admin.resolutionRate')}
            value={`%${bugs.resolutionRate}`}
            tone={bugs.total > 0 && bugs.resolutionRate >= 70 ? 'good' : 'default'}
            sub={t('admin.resolvedTotal', { resolved: bugs.resolved, total: bugs.total })}
            icon={<CheckCircle2 className="size-3.5" aria-hidden />}
          />
          <Kpi
            testId="kpi-avg"
            label={t('admin.avgResolution')}
            value={duration(bugs.avgResolutionHours)}
            sub={t('admin.last30')}
          />
          <Kpi
            testId="kpi-inbox"
            label={t('admin.inboxPending')}
            value={bugs.inboxPending}
            tone={bugs.inboxPending > 0 ? 'warn' : 'default'}
            sub={t('admin.inboxSub')}
            icon={<Inbox className="size-3.5" aria-hidden />}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t('admin.bugFlow')} hint={t('admin.bugFlowHint')} className="lg:col-span-2">
          <div className="h-64" data-testid="chart-bug-flow">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="opened" name={t('admin.opened')} fill={RED} radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="resolved"
                  name={t('admin.resolved')}
                  fill={GREEN}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title={t('admin.severityTitle')} hint={t('admin.severityHint')}>
            {bugs.open === 0 ? (
              <Empty text={t('admin.noOpenBugs')} />
            ) : (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={severity}
                    layout="vertical"
                    margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={70}
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Bar
                      dataKey="count"
                      name={t('admin.count')}
                      radius={[0, 4, 4, 0]}
                      label={{ position: 'right', fontSize: 11, fill: AXIS }}
                    >
                      {severity.map((s) => (
                        <Cell key={s.severity} fill={SEVERITY_COLOR[s.severity]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
          <Panel title={t('admin.sourceTitle')} hint={t('admin.sourceHint')}>
            {bugs.total === 0 ? (
              <Empty text={t('admin.noBugs')} />
            ) : (
              <div className="flex items-center gap-4">
                <div className="size-24 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={source}
                        dataKey="value"
                        innerRadius={26}
                        outerRadius={44}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {source.map((s) => (
                          <Cell key={s.name} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {source.map((s) => (
                    <li key={s.name} className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden
                      />
                      {s.name}
                      <span className="text-muted-foreground tabular-nums">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wide uppercase">
          {t('admin.generalSection')}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label={t('admin.openWork')} value={totals.openItems} />
          <Kpi
            testId="kpi-overdue"
            label={t('admin.overdueWork')}
            value={totals.overdueItems}
            tone={totals.overdueItems > 0 ? 'bad' : 'good'}
            icon={<AlertTriangle className="size-3.5" aria-hidden />}
          />
          <Kpi label={t('admin.completedWeek')} value={totals.completedThisWeek} tone="good" />
          <Kpi label={t('admin.projects')} value={totals.projects} />
          <Kpi label={t('admin.members')} value={totals.members} />
          <Kpi
            testId="kpi-emails"
            label={t('admin.emails')}
            value={tickets.emailsToday}
            sub={t('admin.emailsSub', {
              week: tickets.emailsThisWeek,
              replies: tickets.repliesThisWeek,
            })}
            icon={<Mail className="size-3.5" aria-hidden />}
          />
        </div>
      </div>

      <Panel title={t('admin.projectsTitle')} hint={t('admin.projectsHint')}>
        {projects.length === 0 ? (
          <Empty text={t('admin.noProjects')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('admin.throughput')} hint={t('admin.throughputHint')}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughput} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  interval={1}
                />
                <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name={t('admin.completed')}
                  stroke={BLUE}
                  fill={BLUE}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={t('admin.teamLoad')} hint={t('admin.teamLoadHint')}>
          {load.length === 0 ? (
            <Empty text={t('admin.noLoad')} />
          ) : (
            <div className="flex flex-col gap-3">
              <div style={{ height: Math.max(load.length * 34, 120) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={load}
                    layout="vertical"
                    margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={110}
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="onTime" stackId="a" name={t('admin.onTime')} fill={BLUE} />
                    <Bar
                      dataKey="overdue"
                      stackId="a"
                      name={t('admin.overdue')}
                      fill={AMBER}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-wrap gap-2">
                {load.map((p) => (
                  <li
                    key={p.userId}
                    className="bg-muted flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs"
                  >
                    <UserAvatar
                      id={p.userId}
                      name={p.name}
                      size={20}
                      avatarVersion={p.avatarVersion}
                    />
                    {p.name}
                    <span className="tabular-nums">{p.open}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Yönetici paneli (ADR-139): Bug akışı, Projelerin sprint durumu, geciken işler, ekip yükü. Yalnızca Owner/Admin. */
export function AdminPage() {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const allowed = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const query = useQuery({ ...adminQuery(workspaceId), enabled: allowed });
  if (!allowed) return <NotFoundState />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6" data-testid="admin-page">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{t('admin.title')}</h1>
          <p className="text-muted-foreground text-sm">
            {query.data
              ? t('admin.updated', {
                  time: new Date(query.data.generatedAt).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })
              : t('admin.subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn(query.isFetching && 'animate-spin')} />
          {t('admin.refresh')}
        </Button>
      </div>
      {query.isPending ? (
        <p className="text-muted-foreground py-10 text-sm">{t('common.loading')}</p>
      ) : query.isError ? (
        <NotFoundState />
      ) : (
        <Dashboard data={query.data} />
      )}
    </div>
  );
}
