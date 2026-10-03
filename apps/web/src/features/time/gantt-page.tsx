import {
  barPlacement,
  daysBetween,
  type Gantt,
  type GanttItem,
  GanttSchema,
  shiftSpan,
  SPACE_PERMISSIONS as S,
  timelineMonths,
  timelineRange,
  todayPosition,
} from '@scrum/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useUpdateItemFields } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { todayDay } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';

const ROW_H = 36;
const LABEL_W = '16rem';

const ganttQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'gantt'],
    queryFn: () => apiRequest(`/workspaces/${workspaceId}/spaces/${spaceId}/gantt`, GanttSchema),
  });

interface Row {
  item: GanttItem;
  depth: number;
}

/** Üst-alt sırasıyla satırlar: kökler başlangıç tarihine göre, çocuklar altlarında. */
function buildRows(items: readonly GanttItem[]): Row[] {
  const ids = new Set(items.map((i) => i.id));
  const children = new Map<string | null, GanttItem[]>();
  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    children.set(key, [...(children.get(key) ?? []), item]);
  }
  const byStart = (a: GanttItem, b: GanttItem) =>
    (a.startDate ?? a.dueDate ?? '9999').localeCompare(b.startDate ?? b.dueDate ?? '9999') ||
    a.key.localeCompare(b.key, undefined, { numeric: true });
  const rows: Row[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const item of (children.get(parent) ?? []).sort(byStart)) {
      rows.push({ item, depth });
      visit(item.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/** Gantt (brief §5.10, ADR-077): tarihli işler, bağımlılık okları, kritik yol; çubuğu sürükleyerek tarih kaydır. */
export function GanttPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const gantt = useQuery(ganttQuery(workspaceId, spaceId));

  if (space.isPending || gantt.isPending) return <LoadingState />;
  if (space.isError || gantt.isError) return <NotFoundState />;

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{t('gantt.title')}</h1>
          <p className="text-muted-foreground text-xs">{t('gantt.hint')}</p>
        </div>
        {gantt.data.items.length === 0 ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('gantt.empty')}
          </p>
        ) : (
          <GanttChart data={gantt.data} />
        )}
      </div>
    </>
  );
}

function GanttChart({ data }: { data: Gantt }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateItemFields();
  const today = todayDay();
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ id: string; days: number } | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => buildRows(data.items), [data.items]);
  const range = useMemo(() => timelineRange(data.items, today, [], 2), [data.items, today]);
  const months = timelineMonths(range);
  const todayAt = todayPosition(range, today);
  const critical = new Set(data.criticalPath);
  const criticalEdges = new Set(
    data.criticalPath.slice(1).map((id, i) => `${data.criticalPath[i]}>${id}`),
  );
  const violated = new Set(data.violations.map((v) => `${v.from}>${v.to}`));
  const rowIndex = new Map(rows.map((r, i) => [r.item.id, i]));
  const px = (percent: number) => (percent / 100) * width;
  const dayPx = width / range.days;

  /** Sürüklenen çubuğun önizleme kaydırması dahil geometrisi (piksel). */
  const geometry = (item: GanttItem) => {
    const shift = drag?.id === item.id ? drag.days : 0;
    const span = shiftSpan(item, shift);
    const bar = barPlacement(range, span);
    return bar
      ? { left: px(bar.left), width: Math.max(px(bar.width), 6), marker: bar.marker }
      : null;
  };

  const startDrag = (e: React.PointerEvent, item: GanttItem) => {
    if (!data.canEdit || e.button !== 0) return;
    const originX = e.clientX;
    let days = 0;
    const move = (ev: PointerEvent) => {
      days = Math.round((ev.clientX - originX) / dayPx);
      setDrag({ id: item.id, days });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (days === 0) return;
      update.mutate(
        { itemId: item.id, body: shiftSpan(item, days) },
        { onError: (error) => toast.error(errorMessage(error)) },
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const arrows = data.dependencies.flatMap((dep) => {
    const from = rowIndex.get(dep.from);
    const to = rowIndex.get(dep.to);
    if (from === undefined || to === undefined) return [];
    const a = geometry(rows[from]!.item);
    const b = geometry(rows[to]!.item);
    if (!a || !b) return [];
    const x1 = a.left + a.width;
    const y1 = from * ROW_H + ROW_H / 2;
    const x2 = b.left;
    const y2 = to * ROW_H + ROW_H / 2;
    const mid = Math.max(x1 + 8, x2 - 8);
    const key = `${dep.from}>${dep.to}`;
    return [
      {
        key,
        path: `M${x1},${y1} H${mid} V${y2} H${x2 - 1}`,
        head: `${x2},${y2} ${x2 - 6},${y2 - 3.5} ${x2 - 6},${y2 + 3.5}`,
        critical: criticalEdges.has(key),
        violated: violated.has(key),
      },
    ];
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {data.criticalPath.length > 0 && (
          <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">
            {t('gantt.critical', { days: data.criticalDays, count: data.criticalPath.length })}
          </span>
        )}
        {data.violations.length > 0 && (
          <span
            role="status"
            className="flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1"
          >
            <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
            {t('gantt.violations', { count: data.violations.length })}
          </span>
        )}
        {data.hasCycle && (
          <span
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md border px-2 py-1"
          >
            {t('gantt.cycle')}
          </span>
        )}
        {!data.canEdit && <span className="text-muted-foreground">{t('gantt.readOnly')}</span>}
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <div className="min-w-[56rem]">
          {/* Ay başlıkları */}
          <div
            className="grid border-b"
            style={{ gridTemplateColumns: `${LABEL_W} minmax(0,1fr)` }}
          >
            <div className="text-muted-foreground px-3 py-2 text-xs font-medium">
              {t('gantt.item')}
            </div>
            <div className="relative h-8 border-l" aria-hidden>
              {months.map((m) => (
                <div
                  key={m.key}
                  className="text-muted-foreground absolute inset-y-0 border-l px-1.5 py-2 text-xs first:border-l-0"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                >
                  {m.key}
                </div>
              ))}
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: `${LABEL_W} minmax(0,1fr)` }}>
            {/* Etiket sütunu */}
            <ul aria-label={t('gantt.items')}>
              {rows.map(({ item, depth }) => (
                <li
                  key={item.id}
                  className="flex items-center gap-1.5 border-b pr-2 text-sm"
                  style={{ height: ROW_H, paddingLeft: 10 + depth * 14 }}
                >
                  <WorkItemTypeIcon type={item.type} />
                  <Link
                    to="/items/$key"
                    params={{ key: item.key }}
                    className="flex min-w-0 items-center gap-1.5 hover:underline"
                  >
                    <span className="text-muted-foreground font-mono text-[11px]">{item.key}</span>
                    <span
                      className={cn(
                        'truncate',
                        item.category === 'DONE' && 'text-muted-foreground line-through',
                      )}
                    >
                      {item.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* İz: çubuklar ve oklar */}
            <div
              ref={trackRef}
              className="relative border-l"
              style={{ height: rows.length * ROW_H }}
            >
              {months.slice(1).map((m) => (
                <div
                  key={m.key}
                  className="bg-border absolute inset-y-0 w-px"
                  style={{ left: `${m.left}%` }}
                  aria-hidden
                />
              ))}
              {rows.map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 border-b"
                  style={{ top: (i + 1) * ROW_H - 1 }}
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

              {rows.map(({ item }, i) => {
                const g = geometry(item);
                if (!g) {
                  return (
                    <span
                      key={item.id}
                      className="text-muted-foreground absolute left-2 text-[11px] italic"
                      style={{ top: i * ROW_H + 10 }}
                    >
                      {t('gantt.noDates')}
                    </span>
                  );
                }
                const isCritical = critical.has(item.id);
                const color = item.color ?? 'var(--primary)';
                return (
                  <div
                    key={item.id}
                    role="img"
                    aria-label={t('gantt.barLabel', {
                      key: item.key,
                      title: item.title,
                      start: item.startDate ?? '—',
                      due: item.dueDate ?? '—',
                      critical: isCritical ? t('gantt.onCritical') : '',
                    })}
                    data-key={item.key}
                    onPointerDown={(e) => startDrag(e, item)}
                    className={cn(
                      'absolute z-20 h-5 overflow-hidden rounded select-none',
                      data.canEdit && 'cursor-grab active:cursor-grabbing',
                      isCritical && 'ring-2 ring-red-500',
                      drag?.id === item.id && 'opacity-80',
                    )}
                    style={{
                      left: g.left,
                      width: g.width,
                      top: i * ROW_H + (ROW_H - 20) / 2,
                      background: `color-mix(in oklab, ${color} 30%, transparent)`,
                      border: `1px solid ${color}`,
                      touchAction: 'none',
                    }}
                  >
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${item.progress}%`, background: color, opacity: 0.85 }}
                      aria-hidden
                    />
                  </div>
                );
              })}

              <svg
                className="pointer-events-none absolute inset-0 z-30"
                width={width}
                height={rows.length * ROW_H}
                aria-hidden
              >
                {arrows.map((a) => {
                  const stroke = a.violated
                    ? '#d97706'
                    : a.critical
                      ? '#ef4444'
                      : 'var(--muted-foreground)';
                  return (
                    <g key={a.key} data-dependency={a.key}>
                      <path
                        d={a.path}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={a.critical ? 2 : 1.25}
                        strokeDasharray={a.violated ? '4 3' : undefined}
                      />
                      <polygon points={a.head} fill={stroke} />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
      {daysBetween(range.start, range.end) > 0 && (
        <p className="text-muted-foreground text-xs">{t('gantt.legend')}</p>
      )}
    </div>
  );
}
