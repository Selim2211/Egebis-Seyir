import type { WorkItemSummary } from '@scrum/shared';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { PriorityIcon, WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { cn } from '@/lib/utils';
import type { BoardStatus } from './board-model';

const MAX_AVATARS = 3;

/**
 * Board kartı. Sürükleme dinleyicileri dış sarmalayıcıdadır; başlığa/kimliğe tıklamak
 * (sürüklemeden) öğeyi açar. Klavye ve dokunmatik için "Durumu değiştir" menüsü vardır.
 */
export function BoardCard({
  item,
  statuses,
  canMove,
  onStatus,
  dragging,
  overlay,
}: {
  item: WorkItemSummary;
  statuses: readonly BoardStatus[];
  canMove: boolean;
  onStatus?: (itemId: string, statusId: string) => void;
  dragging?: boolean;
  /** Sürüklerken imlecin altında görünen kopya: etkileşimsiz. */
  overlay?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'bg-card rounded-md border p-2.5 text-sm shadow-xs',
        canMove && !overlay && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-40',
        overlay && 'rotate-1 shadow-lg',
      )}
    >
      <div className="flex items-center gap-1.5">
        <WorkItemTypeIcon type={item.type} />
        <ItemOpenLink
          itemKey={item.key}
          className="text-muted-foreground font-mono text-xs hover:underline"
        >
          {item.key}
        </ItemOpenLink>
        {canMove && onStatus && !overlay && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6"
                aria-label={t('items.changeStatus', { key: item.key })}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={item.statusId}
                onValueChange={(id) => onStatus(item.id, id)}
              >
                {statuses.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id}>
                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <ItemOpenLink
        itemKey={item.key}
        className="mt-1 line-clamp-2 block font-medium hover:underline"
      >
        {item.title}
      </ItemOpenLink>
      <div className="mt-2 flex items-center gap-2">
        <PriorityIcon priority={item.priority} />
        {item.points !== null && (
          <span
            title={t('backlog.points')}
            className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
          >
            {item.points}
          </span>
        )}
        {item.points === null && item.estimateHours !== null && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('backlog.hours', { count: item.estimateHours })}
          </span>
        )}
        <span className="ml-auto flex -space-x-1.5">
          {item.assignees.slice(0, MAX_AVATARS).map((a) => (
            <UserAvatar
              key={a.id}
              id={a.id}
              name={a.name}
              size={22}
              avatarVersion={a.avatarVersion}
              className="ring-card ring-2"
            />
          ))}
          {item.assignees.length > MAX_AVATARS && (
            <span className="bg-muted text-muted-foreground ring-card flex size-5.5 items-center justify-center rounded-full text-[10px] ring-2">
              +{item.assignees.length - MAX_AVATARS}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
