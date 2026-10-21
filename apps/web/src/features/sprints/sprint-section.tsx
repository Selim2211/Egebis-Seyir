import type { SprintSummary, WorkItemRow } from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import {
  Archive,
  BarChart3,
  ChevronRight,
  Copy,
  FileJson,
  FileSpreadsheet,
  Kanban,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sprintBackupUrl } from '@/features/backup/backup';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { containerId } from './backlog-dnd';
import { DropContainerView, SortableRow } from './backlog-dnd-view';
import { BacklogRow } from './backlog-row';
import { SprintStats } from './sprint-stats';

/** Sprint bölümü: başlık (ad, tarih, hedef, toplamlar), menü ve öğe satırları (ADR-061). */
export function SprintSection({
  sprint,
  items,
  loading,
  collapsed,
  onToggle,
  epicTitles,
  targets,
  canPlan,
  onMove,
  onEdit,
  onDelete,
  onCopy,
  dnd,
  selected,
  onSelect,
  actions,
}: {
  sprint: SprintSummary;
  items: WorkItemRow[];
  loading: boolean;
  collapsed: boolean;
  onToggle: () => void;
  epicTitles: Map<string, string>;
  targets: SprintSummary[];
  canPlan: boolean;
  onMove: (itemId: string, sprintId: string | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  /** Sürükle-bırak: izin ve alt öğe olarak vurgulanacak satır (ADR-102). */
  dnd: { enabled: boolean };
  /** Çoklu seçim (Backlog sayfasıyla ortak): farklı sprint'lerden seçilebilir. */
  selected: ReadonlySet<string>;
  onSelect: (itemId: string, on: boolean) => void;
  /** Başlat / Tamamla / İptal düğmeleri (SprintActions). */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const active = sprint.status === 'ACTIVE';
  const { id: workspaceId } = useCurrentWorkspace();
  const [showStats, setShowStats] = useState(false);
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/sprints/${sprint.id}`).then(
      () => toast.success(t('detail.linkCopied')),
      () => toast.error(t('copyList.failed')),
    );
  };
  return (
    <section
      className={cn('bg-card rounded-lg border', active && 'border-primary/40')}
      aria-label={sprint.name}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'structure.expand' : 'structure.collapse', {
            name: sprint.name,
          })}
          className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded"
        >
          <ChevronRight className={cn('size-4 transition-transform', !collapsed && 'rotate-90')} />
        </button>
        <h2 className="text-sm font-semibold">{sprint.name}</h2>
        <Badge variant={active ? 'default' : 'outline'}>
          {t(`sprints.status.${sprint.status}`)}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
        </span>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {t('sprints.totals', { count: sprint.itemCount, points: sprint.points })}
          {sprint.unestimatedCount > 0 && (
            <span className="ml-2 text-amber-700 dark:text-amber-400">
              {t('sprints.unestimated', { count: sprint.unestimatedCount })}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowStats((v) => !v)}
          aria-expanded={showStats}
          aria-label={t('sprintStats.toggle', { name: sprint.name })}
          className={cn(
            'text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-xs tabular-nums',
            showStats && 'bg-accent text-foreground',
          )}
        >
          <BarChart3 className="size-3.5" aria-hidden />
          {sprint.percentDone}%
        </button>
        {actions}
        {(canPlan || items.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t('sprints.actions', { name: sprint.name })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onCopy}>
                <Copy />
                {t('copyList.action')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/spaces/$spaceId/board"
                  params={{ spaceId: sprint.spaceId }}
                  search={{ sprint: sprint.id }}
                >
                  <Kanban />
                  {t('sprintStats.openBoard')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 />
                {t('sprintStats.copyLink')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/workspaces/${workspaceId}/sprints/${sprint.id}/export.xlsx`}
                  download
                >
                  <FileSpreadsheet />
                  {t('sprintImport.exportSprint')}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/workspaces/${workspaceId}/sprints/${sprint.id}/export.json`}
                  download
                >
                  <FileJson />
                  {t('sprintStats.exportJson')}
                </a>
              </DropdownMenuItem>
              {canPlan && (
                <DropdownMenuItem asChild>
                  <a href={sprintBackupUrl(workspaceId, sprint.id)} download>
                    <Archive />
                    {t('backup.sprintDownload')}
                  </a>
                </DropdownMenuItem>
              )}
              {canPlan && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  {t('sprints.edit')}
                </DropdownMenuItem>
              )}
              {canPlan && sprint.status === 'PLANNED' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 />
                    {t('structure.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      {showStats && !collapsed && <SprintStats sprint={sprint} />}
      {sprint.goal && !collapsed && (
        <p className="text-muted-foreground px-4 pb-2 text-sm">
          <span className="font-medium">{t('sprints.goal')}:</span> {sprint.goal}
        </p>
      )}
      {!collapsed && (
        <div className="border-t">
          <DropContainerView
            id={containerId(sprint.id)}
            itemIds={items.map((i) => i.id)}
            enabled={dnd.enabled}
          >
            {loading ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">{t('common.loading')}</p>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                {t('sprints.empty')}
              </p>
            ) : (
              items.map((item) => (
                <SortableRow key={item.id} id={item.id} enabled={dnd.enabled}>
                  {(handle) => (
                    <BacklogRow
                      item={item}
                      epicTitle={item.parentId ? epicTitles.get(item.parentId) : undefined}
                      selected={selected.has(item.id)}
                      onSelect={(on) => onSelect(item.id, on)}
                      handle={handle}
                      targets={targets.filter((s) => s.id !== sprint.id)}
                      canPlan={canPlan}
                      onMove={(sprintId) => onMove(item.id, sprintId)}
                    />
                  )}
                </SortableRow>
              ))
            )}
          </DropContainerView>
        </div>
      )}
    </section>
  );
}
