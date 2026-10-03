import type { SprintSummary, WorkItemRow } from '@scrum/shared';
import type { ReactNode } from 'react';
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BacklogRow } from './backlog-row';

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
  /** Başlat / Tamamla / İptal düğmeleri (SprintActions). */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const active = sprint.status === 'ACTIVE';
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
        {actions}
        {canPlan && (
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
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil />
                {t('sprints.edit')}
              </DropdownMenuItem>
              {sprint.status === 'PLANNED' && (
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
      {sprint.goal && !collapsed && (
        <p className="text-muted-foreground px-4 pb-2 text-sm">
          <span className="font-medium">{t('sprints.goal')}:</span> {sprint.goal}
        </p>
      )}
      {!collapsed && (
        <div className="border-t">
          {loading ? (
            <p className="text-muted-foreground px-4 py-3 text-sm">{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              {t('sprints.empty')}
            </p>
          ) : (
            items.map((item) => (
              <BacklogRow
                key={item.id}
                item={item}
                epicTitle={item.parentId ? epicTitles.get(item.parentId) : undefined}
                targets={targets.filter((s) => s.id !== sprint.id)}
                canPlan={canPlan}
                onMove={(sprintId) => onMove(item.id, sprintId)}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}
