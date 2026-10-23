import '@xyflow/react/dist/style.css';
import {
  SPACE_PERMISSIONS as S,
  type MapNode,
  type ProjectMap,
  ProjectMapSchema,
} from '@scrum/shared';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, Maximize2, Search, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/user-avatar';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { ScrumTabs } from '@/features/sprints/scrum-tabs';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { cn } from '@/lib/utils';
import { autoLayout, type MapPos } from './map-layout';

const mapQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'map'],
    queryFn: () => apiRequest(`/workspaces/${workspaceId}/spaces/${spaceId}/map`, ProjectMapSchema),
    // Konumlar sayfada yerel tutulur; arka plan yenilemesi sürüklemeyi bozmasın.
    refetchOnWindowFocus: false,
  });

const NODE_WIDTH = { EPIC: 280, TASK: 240, SUBTASK: 210, BUG: 240 } as const;

interface ItemData extends Record<string, unknown> {
  item: MapNode;
  dim: boolean;
}

const CATEGORY_RING: Record<string, string> = {
  NOT_STARTED: 'border-slate-300 dark:border-slate-600',
  IN_PROGRESS: 'border-blue-500',
  DONE: 'border-emerald-500',
};

/** Haritadaki bir iş kutusu. */
const MapItemNode = memo(function MapItemNode({ data }: NodeProps<Node<ItemData>>) {
  const { item, dim } = data;
  const epic = item.type === 'EPIC';
  const bug = item.type === 'BUG';
  return (
    <div
      data-testid="map-node"
      data-key={item.key}
      style={{
        width: NODE_WIDTH[item.type] ?? 230,
        ...(epic && item.color ? { borderLeftColor: item.color } : null),
      }}
      className={cn(
        'bg-card cursor-pointer rounded-lg border-2 px-3 py-2 shadow-sm transition-opacity hover:shadow-md',
        epic && 'border-l-[6px] py-3 shadow-md',
        bug ? 'border-red-500' : CATEGORY_RING[item.status.category],
        item.status.category === 'DONE' && 'bg-emerald-50/60 dark:bg-emerald-950/20',
        item.type === 'SUBTASK' && 'text-[13px]',
        dim && 'opacity-20',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !size-1.5" />
      <div className="flex items-center gap-1.5">
        <WorkItemTypeIcon type={item.type} />
        <span className="text-muted-foreground font-mono text-[11px]">{item.key}</span>
        <span
          className="ml-auto flex max-w-[55%] items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: item.status.color }}
        >
          {item.status.name}
        </span>
      </div>
      <p
        className={cn(
          'mt-1 line-clamp-2 leading-snug break-words',
          epic ? 'text-[15px] font-bold' : 'font-medium',
        )}
      >
        {item.title}
      </p>
      {(item.assignees.length > 0 || item.sprint) && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {item.assignees.slice(0, 3).map((a) => (
              <UserAvatar
                key={a.id}
                id={a.id}
                name={a.name}
                size={18}
                avatarVersion={a.avatarVersion}
                className="ring-card ring-2"
              />
            ))}
          </span>
          {item.sprint && (
            <span className="bg-primary/10 text-primary ml-auto max-w-[60%] truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              {item.sprint.name}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !size-1.5" />
    </div>
  );
});
const nodeTypes = { item: MapItemNode };

const SAVE_DELAY_MS = 600;

interface Filters {
  q: string;
  sprint: string;
  assignee: string;
  category: string;
  subtasks: boolean;
  bugs: boolean;
}
const NO_FILTERS: Filters = {
  q: '',
  sprint: '',
  assignee: '',
  category: '',
  subtasks: true,
  bugs: true,
};

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark')),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function MapCanvas({ spaceId, data }: { spaceId: string; data: ProjectMap }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const navigate = useNavigate();
  const flow = useReactFlow();
  const dark = useDarkMode();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // Kullanıcının taşıdığı kutular; kaydedilmişse sunucudan gelir, yoksa otomatik düzen kullanılır.
  const [moved, setMoved] = useState<Record<string, MapPos>>(data.positions);

  const save = useMutation({
    mutationFn: (positions: Record<string, MapPos>) =>
      apiRequest(`/workspaces/${workspaceId}/spaces/${spaceId}/map/layout`, NoContent, {
        method: 'PUT',
        body: { positions },
      }),
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSoon = useCallback(
    (positions: Record<string, MapPos>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save.mutate(positions), SAVE_DELAY_MS);
    },
    [save],
  );
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const shown = useMemo(
    () =>
      data.nodes.filter(
        (n) => (filters.subtasks || n.type !== 'SUBTASK') && (filters.bugs || n.type !== 'BUG'),
      ),
    [data.nodes, filters.subtasks, filters.bugs],
  );
  const auto = useMemo(() => autoLayout(shown), [shown]);

  const sprints = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of data.nodes) if (n.sprint) map.set(n.sprint.id, n.sprint.name);
    return [...map];
  }, [data.nodes]);
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of data.nodes) for (const a of n.assignees) map.set(a.id, a.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.nodes]);

  const active = !!(filters.q || filters.sprint || filters.assignee || filters.category);
  const matches = useCallback(
    (n: MapNode) => {
      const q = filters.q.trim().toLowerCase();
      return (
        (!q || n.title.toLowerCase().includes(q) || n.key.toLowerCase().includes(q)) &&
        (!filters.sprint || n.sprint?.id === filters.sprint) &&
        (!filters.assignee || n.assignees.some((a) => a.id === filters.assignee)) &&
        (!filters.category || n.status.category === filters.category)
      );
    },
    [filters],
  );
  const dimmed = useMemo(
    () => new Set(active ? shown.filter((n) => !matches(n)).map((n) => n.id) : []),
    [active, shown, matches],
  );

  const nodes = useMemo<Node<ItemData>[]>(
    () =>
      shown.map((item) => ({
        id: item.id,
        type: 'item',
        position: moved[item.id] ?? auto[item.id] ?? { x: 0, y: 0 },
        data: { item, dim: dimmed.has(item.id) },
      })),
    [shown, moved, auto, dimmed],
  );
  const edges = useMemo<Edge[]>(() => {
    const byId = new Map(shown.map((n) => [n.id, n]));
    return shown.flatMap((n) => {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      if (!parent) return [];
      const color = parent.type === 'EPIC' && parent.color ? parent.color : '#94a3b8';
      return [
        {
          id: `${parent.id}>${n.id}`,
          source: parent.id,
          target: n.id,
          type: 'smoothstep',
          style: {
            stroke: color,
            strokeWidth: 2,
            opacity: dimmed.has(n.id) || dimmed.has(parent.id) ? 0.15 : 0.9,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        },
      ];
    });
  }, [shown, dimmed]);

  const onNodesChange = useCallback((changes: NodeChange<Node<ItemData>>[]) => {
    const next: Record<string, MapPos> = {};
    for (const c of changes) if (c.type === 'position' && c.position) next[c.id] = c.position;
    if (Object.keys(next).length > 0) setMoved((m) => ({ ...m, ...next }));
  }, []);

  const resetLayout = () => {
    setMoved({});
    if (saveTimer.current) clearTimeout(saveTimer.current);
    save.mutate({});
    requestAnimationFrame(() => void flow.fitView({ duration: 300, padding: 0.15 }));
  };
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t('projectMap.search')}
            aria-label={t('projectMap.search')}
            className="h-8 pl-8"
          />
        </div>
        <NativeSelect
          value={filters.sprint}
          onChange={(e) => set({ sprint: e.target.value })}
          aria-label={t('projectMap.sprint')}
          className="h-8 max-w-44"
        >
          <option value="">{t('projectMap.allSprints')}</option>
          {sprints.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.assignee}
          onChange={(e) => set({ assignee: e.target.value })}
          aria-label={t('projectMap.person')}
          className="h-8 max-w-44"
        >
          <option value="">{t('projectMap.allPeople')}</option>
          {people.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.category}
          onChange={(e) => set({ category: e.target.value })}
          aria-label={t('projectMap.status')}
          className="h-8 max-w-44"
        >
          <option value="">{t('projectMap.allStatuses')}</option>
          <option value="NOT_STARTED">{t('projectMap.notStarted')}</option>
          <option value="IN_PROGRESS">{t('projectMap.inProgress')}</option>
          <option value="DONE">{t('projectMap.done')}</option>
        </NativeSelect>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.subtasks}
            onChange={(e) => set({ subtasks: e.target.checked })}
            className="size-4"
          />
          {t('projectMap.showSubtasks')}
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={filters.bugs}
            onChange={(e) => set({ bugs: e.target.checked })}
            className="size-4"
          />
          {t('projectMap.showBugs')}
        </label>
        {(active || !filters.subtasks || !filters.bugs) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
            <X />
            {t('view.clear')}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void flow.fitView({ duration: 300, padding: 0.15 })}
          >
            <Maximize2 />
            {t('projectMap.fit')}
          </Button>
          <Button variant="outline" size="sm" onClick={resetLayout}>
            <LayoutDashboard />
            {t('projectMap.autoLayout')}
          </Button>
        </div>
      </div>

      <div
        className="bg-card h-[calc(100vh-15rem)] min-h-[28rem] overflow-hidden rounded-lg border"
        data-testid="project-map"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, __, all) => {
            const positions = { ...moved };
            for (const n of all) positions[n.id] = n.position;
            saveSoon(positions);
          }}
          onNodeClick={(_, node) =>
            void navigate({ to: '/items/$key', params: { key: node.data.item.key } })
          }
          colorMode={dark ? 'dark' : 'light'}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={2}
          nodesConnectable={false}
          deleteKeyCode={null}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const item = (n.data as ItemData).item;
              return item.type === 'BUG' ? '#ef4444' : (item.color ?? item.status.color);
            }}
          />
        </ReactFlow>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items = [
    ['border-slate-300 dark:border-slate-600', t('projectMap.notStarted')],
    ['border-blue-500', t('projectMap.inProgress')],
    ['border-emerald-500', t('projectMap.done')],
    ['border-red-500', 'Bug'],
  ] as const;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span>{t('projectMap.legend')}</span>
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn('bg-card size-3 rounded-sm border-2', cls)} aria-hidden />
          {label}
        </span>
      ))}
      <span>{t('projectMap.hint')}</span>
    </div>
  );
}

/** Proje Kuş Bakışı (ADR-136): Epic → Task → Sub-Task ağacı; yakınlaştır, kaydır, kutuları taşı. */
export function ProjectMapPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const map = useQuery(mapQuery(workspaceId, spaceId));

  if (space.isPending || map.isPending) return <LoadingState />;
  if (space.isError || map.isError) return <NotFoundState />;

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="map" />
      </ContainerHeader>
      {map.data.nodes.length === 0 ? (
        <p className="text-muted-foreground bg-card mx-auto mt-6 max-w-5xl rounded-lg border px-4 py-10 text-center text-sm">
          {t('projectMap.empty')}
        </p>
      ) : (
        <ReactFlowProvider>
          <MapCanvas spaceId={spaceId} data={map.data} />
        </ReactFlowProvider>
      )}
    </>
  );
}
