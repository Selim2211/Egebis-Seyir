import {
  AdminOverviewSchema,
  WORKSPACE_PERMISSIONS,
  type AdminListKind,
  type AdminOverview,
  type AdminProject,
  type BugSeverity,
} from '@scrum/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Inbox,
  Mail,
  RefreshCw,
  UserX,
} from 'lucide-react';
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
import { RiskStrip } from '@/features/analytics/risk-strip';
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
    retry: 2,
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
    if (hours < 1) return t('admin.minutes', { value: Math.max(1, Math.round(hours * 60)) });
    return hours < 48
      ? t('admin.hours', { value: hours.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) })
      : t('admin.days', {
          value: (hours / 24).toLocaleString('tr-TR', { maximumFractionDigits: 1 }),
        });
  };
}

/** Recharts tıklama olayından (çubuk ya da dilim) bir alanı okur. */
function pick(d: unknown, field: string, then: (value: string) => void) {
  const o = d as Record<string, unknown> & { payload?: Record<string, unknown> };
  const v = o.payload?.[field] ?? o[field];
  if (typeof v === 'string' && v) then(v);
}

/** Bir kutucuğun ya da grafiğin açtığı liste (ADR-142). */
type Target = { kind: AdminListKind; value?: string };

/** Grafikten ya da kutucuktan filtreli listeye gider. */
function useGo() {
  const navigate = useNavigate();
  return (target: Target) =>
    void navigate({
      to: '/admin-list',
      search: { kind: target.kind, ...(target.value ? { value: target.value } : {}) },
    });
}

function Kpi({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  testId,
  to,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'bad' | 'good' | 'warn';
  icon?: ReactNode;
  testId?: string;
  to?: Target | { item: string };
}) {
  const card = (
    <div
      data-testid={testId}
      className={cn(
        'bg-card flex h-full flex-col gap-1 rounded-xl border p-4 transition-colors',
        to && 'hover:border-primary/60 hover:shadow-sm',
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
  if (!to) return card;
  const className = 'focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2';
  return 'item' in to ? (
    <Link to="/items/$key" params={{ key: to.item }} className={className}>
      {card}
    </Link>
  ) : (
    <Link
      to="/admin-list"
      search={{ kind: to.kind, ...(to.value ? { value: to.value } : {}) }}
      className={className}
      data-testid={testId ? `${testId}-link` : undefined}
    >
      {card}
    </Link>
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
  const go = useGo();
  const { bugs, totals, tickets } = data;
  const aging = bugs.aging.map((a) => ({ ...a, name: t(`adminList.age.${a.bucket}`) }));
  const routing = (
    [
      ['rule', bugs.routing.rule, BLUE],
      ['company', bugs.routing.company, GREEN],
      ['ai', bugs.routing.ai, '#7c3aed'],
      ['none', bugs.routing.unrouted, '#94a3b8'],
    ] as const
  ).map(([key, value, color]) => ({ key, value, color, name: t(`adminList.route.${key}`) }));
  const routedTotal = routing.reduce((n, r) => n + r.value, 0);
  const companies = bugs.byCompany.map((c) => ({ ...c, label: c.name }));
  const velocity = data.velocity.map((v) => ({ ...v, label: v.name }));
  const dailyData = bugs.daily.map((d) => ({ ...d, label: formatShortDate(d.date) }));
  const throughput = data.throughput.map((d) => ({ ...d, label: formatShortDate(d.date) }));
  const severity = bugs.openBySeverity.map((s) => ({
    ...s,
    name: t(`severity.${s.severity}`),
  }));
  const source = [
    {
      name: t('admin.sourceEmail'),
      value: bugs.bySource.email,
      color: BLUE,
      kind: 'bugs-email' as const,
    },
    {
      name: t('admin.sourceManual'),
      value: bugs.bySource.manual,
      color: '#94a3b8',
      kind: 'bugs-manual' as const,
    },
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
      <RiskStrip />
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
            to={{ kind: 'bugs-new-today' }}
          />
          <Kpi
            testId="kpi-new-week"
            label={t('admin.newWeek')}
            value={bugs.newThisWeek}
            sub={t('admin.resolvedSub', { count: bugs.resolvedThisWeek })}
            to={{ kind: 'bugs-new-week' }}
          />
          <Kpi
            testId="kpi-open"
            label={t('admin.openBugsTitle')}
            value={bugs.open}
            tone={bugs.openUnassigned > 0 ? 'warn' : 'default'}
            sub={t('admin.unassignedSub', { count: bugs.openUnassigned })}
            to={{ kind: 'bugs-open' }}
          />
          <Kpi
            testId="kpi-rate"
            label={t('admin.resolutionRate')}
            value={`%${bugs.resolutionRate}`}
            tone={bugs.total > 0 && bugs.resolutionRate >= 70 ? 'good' : 'default'}
            sub={t('admin.resolvedTotal', { resolved: bugs.resolved, total: bugs.total })}
            icon={<CheckCircle2 className="size-3.5" aria-hidden />}
            to={{ kind: 'bugs-all' }}
          />
          <Kpi
            testId="kpi-avg"
            label={t('admin.avgResolution')}
            value={duration(bugs.avgResolutionHours)}
            sub={t('admin.last30')}
            to={{ kind: 'bugs-resolved-week' }}
          />
          <Kpi
            testId="kpi-inbox"
            label={t('admin.inboxPending')}
            value={bugs.inboxPending}
            tone={bugs.inboxPending > 0 ? 'warn' : 'default'}
            sub={t('admin.inboxSub')}
            icon={<Inbox className="size-3.5" aria-hidden />}
            to={{ kind: 'bugs-inbox' }}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-300">
          {t('admin.supportSection')}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            testId="kpi-first-response"
            label={t('admin.firstResponse')}
            value={duration(bugs.avgFirstResponseHours)}
            sub={t('admin.firstResponseSub')}
            icon={<Clock className="size-3.5" aria-hidden />}
            to={{ kind: 'bugs-email' }}
          />
          <Kpi
            testId="kpi-awaiting"
            label={t('admin.awaitingReply')}
            value={bugs.awaitingReply}
            tone={bugs.awaitingReply > 0 ? 'warn' : 'good'}
            sub={t('admin.awaitingSub')}
            icon={<Mail className="size-3.5" aria-hidden />}
            to={{ kind: 'bugs-awaiting' }}
          />
          <Kpi
            testId="kpi-oldest"
            label={t('admin.oldestOpen')}
            value={bugs.oldestOpen ? t('admin.days', { value: bugs.oldestOpen.ageDays }) : '—'}
            sub={bugs.oldestOpen ? `${bugs.oldestOpen.key} · ${bugs.oldestOpen.title}` : undefined}
            tone={bugs.oldestOpen && bugs.oldestOpen.ageDays >= 7 ? 'bad' : 'default'}
            {...(bugs.oldestOpen ? { to: { item: bugs.oldestOpen.key } } : {})}
          />
          <Kpi
            testId="kpi-unassigned-bugs"
            label={t('admin.unassignedBugs')}
            value={bugs.openUnassigned}
            tone={bugs.openUnassigned > 0 ? 'warn' : 'good'}
            sub={t('admin.unassignedBugsSub')}
            icon={<UserX className="size-3.5" aria-hidden />}
            to={{ kind: 'bugs-unassigned' }}
          />
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <Panel title={t('admin.agingTitle')} hint={t('admin.agingHint')}>
            {bugs.open === 0 ? (
              <Empty text={t('admin.noOpenBugs')} />
            ) : (
              <div className="h-44" data-testid="chart-aging">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aging} margin={{ top: 14, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                    <Bar
                      dataKey="count"
                      name={t('admin.count')}
                      radius={[4, 4, 0, 0]}
                      cursor="pointer"
                      label={{ position: 'top', fontSize: 11, fill: AXIS }}
                      onClick={(d: unknown) =>
                        pick(d, 'bucket', (v) => go({ kind: 'bugs-age', value: v }))
                      }
                    >
                      {aging.map((a, i) => (
                        <Cell key={a.bucket} fill={['#16a34a', '#ca8a04', '#ea580c', RED][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
          <Panel title={t('admin.routingTitle')} hint={t('admin.routingHint')}>
            {routedTotal === 0 ? (
              <Empty text={t('admin.noEmailBugs')} />
            ) : (
              <div className="flex items-center gap-4" data-testid="chart-routing">
                <div className="size-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={routing}
                        dataKey="value"
                        innerRadius={30}
                        outerRadius={50}
                        paddingAngle={2}
                        stroke="none"
                        cursor="pointer"
                        onClick={(d: unknown) =>
                          pick(d, 'key', (v) => go({ kind: 'bugs-route', value: v }))
                        }
                      >
                        {routing.map((r) => (
                          <Cell key={r.key} fill={r.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {routing.map((r) => (
                    <li key={r.key}>
                      <Link
                        to="/admin-list"
                        search={{ kind: 'bugs-route', value: r.key }}
                        className="hover:bg-accent flex items-center gap-2 rounded px-1"
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: r.color }}
                          aria-hidden
                        />
                        {r.name}
                        <span className="text-muted-foreground tabular-nums">{r.value}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
          <Panel title={t('admin.companiesTitle')} hint={t('admin.companiesHint')}>
            {companies.length === 0 && bugs.noCompany === 0 ? (
              <Empty text={t('admin.noEmailBugs')} />
            ) : (
              <div className="flex flex-col gap-2" data-testid="chart-companies">
                {companies.length > 0 && (
                  <div style={{ height: Math.max(companies.length * 30, 80) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={companies}
                        layout="vertical"
                        margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                      >
                        <XAxis type="number" allowDecimals={false} hide />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={100}
                          tick={{ fill: AXIS, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                        <Bar
                          dataKey="open"
                          stackId="c"
                          name={t('admin.openLabel')}
                          fill={RED}
                          cursor="pointer"
                          onClick={(d: unknown) =>
                            pick(d, 'id', (v) => go({ kind: 'bugs-company', value: v }))
                          }
                        />
                        <Bar
                          dataKey="resolved"
                          stackId="c"
                          name={t('admin.resolved')}
                          fill={GREEN}
                          radius={[0, 4, 4, 0]}
                          cursor="pointer"
                          onClick={(d: unknown) =>
                            pick(d, 'id', (v) => go({ kind: 'bugs-company', value: v }))
                          }
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {bugs.noCompany > 0 && (
                  <Link
                    to="/admin-list"
                    search={{ kind: 'bugs-company', value: 'none' }}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                    data-testid="no-company-link"
                  >
                    {t('admin.noCompany', { count: bugs.noCompany })}
                  </Link>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                      cursor="pointer"
                      label={{ position: 'right', fontSize: 11, fill: AXIS }}
                      onClick={(d: unknown) =>
                        pick(d, 'severity', (v) => go({ kind: 'bugs-severity', value: v }))
                      }
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
                        cursor="pointer"
                        onClick={(d: unknown) =>
                          pick(d, 'kind', (v) => go({ kind: v as 'bugs-email' | 'bugs-manual' }))
                        }
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
                    <li key={s.name}>
                      <Link
                        to="/admin-list"
                        search={{ kind: s.kind }}
                        className="hover:bg-accent flex items-center gap-2 rounded px-1"
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: s.color }}
                          aria-hidden
                        />
                        {s.name}
                        <span className="text-muted-foreground tabular-nums">{s.value}</span>
                      </Link>
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            testId="kpi-open-work"
            label={t('admin.openWork')}
            value={totals.openItems}
            to={{ kind: 'open-work' }}
          />
          <Kpi
            testId="kpi-overdue"
            label={t('admin.overdueWork')}
            value={totals.overdueItems}
            tone={totals.overdueItems > 0 ? 'bad' : 'good'}
            icon={<AlertTriangle className="size-3.5" aria-hidden />}
            to={{ kind: 'overdue' }}
          />
          <Kpi
            testId="kpi-completed-week"
            label={t('admin.completedWeek')}
            value={totals.completedThisWeek}
            tone="good"
            to={{ kind: 'completed-week' }}
          />
          <Kpi
            testId="kpi-unassigned-work"
            label={t('admin.unassignedWork')}
            value={totals.unassignedOpen}
            tone={totals.unassignedOpen > 0 ? 'warn' : 'good'}
            sub={t('admin.unassignedWorkSub')}
            icon={<UserX className="size-3.5" aria-hidden />}
            to={{ kind: 'unassigned-work' }}
          />
          <Kpi label={t('admin.projects')} value={totals.projects} />
          <Kpi
            label={t('admin.members')}
            value={totals.members}
            sub={t('admin.idleSub', { count: totals.idleMembers })}
          />
          <Kpi
            testId="kpi-emails"
            label={t('admin.emails')}
            value={tickets.emailsToday}
            sub={t('admin.emailsSub', {
              week: tickets.emailsThisWeek,
              replies: tickets.repliesThisWeek,
            })}
            icon={<Mail className="size-3.5" aria-hidden />}
            to={{ kind: 'bugs-email' }}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    <Bar
                      dataKey="onTime"
                      stackId="a"
                      name={t('admin.onTime')}
                      fill={BLUE}
                      cursor="pointer"
                      onClick={(d: unknown) =>
                        pick(d, 'userId', (v) => go({ kind: 'person', value: v }))
                      }
                    />
                    <Bar
                      dataKey="overdue"
                      stackId="a"
                      name={t('admin.overdue')}
                      fill={AMBER}
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={(d: unknown) =>
                        pick(d, 'userId', (v) => go({ kind: 'person', value: v }))
                      }
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-wrap gap-2">
                {load.map((p) => (
                  <li key={p.userId}>
                    <Link
                      to="/admin-list"
                      search={{ kind: 'person', value: p.userId }}
                      className="bg-muted hover:bg-accent flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs"
                      title={t('admin.completed30', { count: p.completed30 })}
                    >
                      <UserAvatar
                        id={p.userId}
                        name={p.name}
                        size={20}
                        avatarVersion={p.avatarVersion}
                      />
                      {p.name}
                      <span className="tabular-nums">{p.open}</span>
                      <span className="text-muted-foreground tabular-nums">
                        · {t('admin.completed30Short', { count: p.completed30 })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {velocity.length > 0 && (
        <Panel title={t('admin.velocityTitle')} hint={t('admin.velocityHint')}>
          <div className="h-60" data-testid="chart-velocity">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocity} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="committed"
                  name={t('admin.committed')}
                  fill="#94a3b8"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="completed"
                  name={t('admin.completedPoints')}
                  fill={GREEN}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
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
      ) : query.data ? (
        <>
          {/* Arka plandaki yenileme düşerse (ağ/sunucu yeniden başlıyor) eldeki veri silinmez. */}
          {query.isError && (
            <p
              role="status"
              className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
              data-testid="admin-refresh-failed"
            >
              {t('admin.refreshFailed')}
            </p>
          )}
          <Dashboard data={query.data} />
        </>
      ) : (
        <NotFoundState />
      )}
    </div>
  );
}
