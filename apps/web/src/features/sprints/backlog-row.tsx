import type { SprintSummary, WorkItemRow } from '@scrum/shared';
import { ArrowRight, GripVertical, MoreHorizontal, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import type { DragHandleProps } from '@/features/spaces/sortable';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { cn } from '@/lib/utils';
import { isUnestimated } from './backlog-filter';

const MAX_AVATARS = 3;

/** Backlog / sprint satırı: seçim, sürükleme, tip, kimlik, başlık, Epic, tahmin, atananlar, menü. */
export function BacklogRow({
  item,
  epicTitle,
  selected,
  onSelect,
  handle,
  targets,
  canPlan,
  onMove,
}: {
  item: WorkItemRow;
  epicTitle?: string;
  /** Seçim kutusu yoksa (sprint bölümleri) undefined. */
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  handle?: DragHandleProps | null;
  /** Taşınabilecek açık sprint'ler (öğenin bulunduğu hariç). */
  targets: SprintSummary[];
  canPlan: boolean;
  /** `null` = Backlog'a geri al. */
  onMove: (sprintId: string | null) => void;
}) {
  const { t } = useTranslation();
  const unestimated = isUnestimated(item);
  const inSprint = item.sprintId !== null;
  const hasMenu = canPlan && (targets.length > 0 || inSprint);

  return (
    <div
      className={cn(
        'group/item hover:bg-accent/40 flex items-center gap-2 border-b px-3 py-1.5 text-sm',
        selected && 'bg-accent/60',
      )}
    >
      {handle !== undefined && (
        <span className="flex w-4 shrink-0 justify-center">
          {handle && (
            <button
              type="button"
              {...handle}
              aria-label={t('backlog.dragHandle', { key: item.key })}
              className="text-muted-foreground cursor-grab rounded focus-visible:opacity-100 md:opacity-0 md:group-hover/item:opacity-100"
            >
              <GripVertical className="size-4" />
            </button>
          )}
        </span>
      )}
      {onSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={t('backlog.select', { key: item.key })}
          className="size-4 shrink-0"
        />
      )}
      <WorkItemTypeIcon type={item.type} />
      <button
        type="button"
        title={t('detail.copyLink')}
        aria-label={t('backlog.copyKeyLink', { key: item.key })}
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}/items/${item.key}`).then(
            () => toast.success(t('detail.linkCopied')),
            () => toast.error(t('copyList.failed')),
          );
        }}
        className="text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0 cursor-copy rounded px-1 font-mono text-xs"
      >
        {item.key}
      </button>
      <ItemOpenLink itemKey={item.key} className="min-w-0 flex-1 truncate hover:underline">
        {item.title}
      </ItemOpenLink>
      {epicTitle && (
        <span className="bg-muted text-muted-foreground hidden max-w-40 shrink-0 truncate rounded px-1.5 py-0.5 text-xs sm:inline">
          {epicTitle}
        </span>
      )}
      {item.dor && item.dor.checked < item.dor.total && (
        <span
          title={t('readiness.notReady')}
          className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 tabular-nums dark:bg-amber-500/20 dark:text-amber-300"
        >
          {t('readiness.dorBadge', { checked: item.dor.checked, total: item.dor.total })}
        </span>
      )}
      <Estimate item={item} unestimated={unestimated} />
      <span className="flex shrink-0 -space-x-1.5">
        {item.assignees.slice(0, MAX_AVATARS).map((a) => (
          <UserAvatar
            key={a.id}
            id={a.id}
            name={a.name}
            size={22}
            avatarVersion={a.avatarVersion}
            className="ring-background ring-2"
          />
        ))}
        {item.assignees.length > MAX_AVATARS && (
          <span className="bg-muted text-muted-foreground ring-background flex size-5.5 items-center justify-center rounded-full text-[10px] ring-2">
            +{item.assignees.length - MAX_AVATARS}
          </span>
        )}
      </span>
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
              aria-label={t('items.actions', { key: item.key })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {targets.map((sprint) => (
              <DropdownMenuItem key={sprint.id} onSelect={() => onMove(sprint.id)}>
                <ArrowRight />
                {t('backlog.moveToSprint', { name: sprint.name })}
              </DropdownMenuItem>
            ))}
            {inSprint && targets.length > 0 && <DropdownMenuSeparator />}
            {inSprint && (
              <DropdownMenuItem onSelect={() => onMove(null)}>
                <Undo2 />
                {t('backlog.moveToBacklog')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-7 shrink-0" aria-hidden />
      )}
    </div>
  );
}

/** Story/Bug: puan (yoksa vurgulu "?"); Task: saat tahmini. */
function Estimate({ item, unestimated }: { item: WorkItemRow; unestimated: boolean }) {
  const { t } = useTranslation();
  if (unestimated) {
    return (
      <span
        title={t('backlog.unestimated')}
        aria-label={t('backlog.unestimated')}
        className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
      >
        ?
      </span>
    );
  }
  if (item.points !== null) {
    return (
      <span
        title={t('backlog.points')}
        className="bg-muted shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
      >
        {item.points}
      </span>
    );
  }
  if (item.estimateHours !== null) {
    return (
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {t('backlog.hours', { count: item.estimateHours })}
      </span>
    );
  }
  return null;
}
