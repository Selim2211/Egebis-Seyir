import { useQuery } from '@tanstack/react-query';
import { ChevronRight, GripVertical } from 'lucide-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/user-avatar';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { itemQuery } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';
import { SortableRow } from './backlog-dnd-view';
import { BacklogRow } from './backlog-row';
import { subtaskRegistry } from './subtask-registry';

/** Satırın solundaki aç/kapat oku: alt öğesi olan Task'ta görünür. */
export function ExpandToggle({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  if (count === 0) return <span className="w-5 shrink-0" />;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={t(open ? 'backlog.collapseSubtasks' : 'backlog.expandSubtasks')}
      className="text-muted-foreground hover:bg-accent flex shrink-0 items-center gap-0.5 rounded px-0.5 text-xs tabular-nums"
    >
      <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
      {count}
    </button>
  );
}

/**
 * Bir Task'ın alt öğeleri (Backlog ve sprint listelerinde, Task'ın altında girintili). Tutulup bir sprint'e
 * ya da Backlog'a bırakılan alt öğe üst öğesinden ayrılır (`data-subtask`, ADR-125).
 */
export function SubtaskRows({ parentId, enabled }: { parentId: string; enabled: boolean }) {
  const { id: workspaceId } = useCurrentWorkspace();
  const { t } = useTranslation();
  const detail = useQuery(itemQuery(workspaceId, parentId));
  if (detail.isPending) {
    return <p className="text-muted-foreground border-b py-1.5 pl-14 text-xs">…</p>;
  }
  return (
    <>
      {(detail.data?.children ?? []).map((child) => {
        subtaskRegistry.set(child.id, child);
        return (
          <SortableRow key={child.id} id={child.id} enabled={enabled} subtask>
            {(handle) => (
              <div className="bg-muted/30 hover:bg-accent/40 flex items-center gap-2 border-b py-1.5 pr-3 pl-12 text-sm">
                {handle && (
                  <button
                    type="button"
                    {...handle}
                    aria-label={t('backlog.dragSubtask', { key: child.key })}
                    className="text-muted-foreground cursor-grab rounded md:opacity-40 md:hover:opacity-100"
                  >
                    <GripVertical className="size-4" />
                  </button>
                )}
                <WorkItemTypeIcon type={child.type} />
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {child.key}
                </span>
                <ItemOpenLink
                  itemKey={child.key}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {child.title}
                </ItemOpenLink>
                <span className="flex shrink-0 -space-x-1.5">
                  {child.assignees.slice(0, 3).map((a) => (
                    <UserAvatar
                      key={a.id}
                      id={a.id}
                      name={a.name}
                      size={20}
                      avatarVersion={a.avatarVersion}
                      className="ring-background ring-2"
                    />
                  ))}
                </span>
              </div>
            )}
          </SortableRow>
        );
      })}
    </>
  );
}

/** Backlog/sprint satırı + (açıksa) alt öğeleri. Sürüklenebilir satır yalnızca Task'ın kendisidir. */
export function ItemWithSubtasks({
  enabled,
  ...row
}: ComponentProps<typeof BacklogRow> & { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const count = row.item.type === 'EPIC' ? 0 : row.item.childCount;
  // Alt öğe eklenince (sürükleyip bırakınca) liste açılır; öğe kaybolmuş gibi görünmesin.
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) setOpen(true);
    previous.current = count;
  }, [count]);
  return (
    <>
      <SortableRow id={row.item.id} enabled={enabled}>
        {(handle) => (
          <BacklogRow
            {...row}
            handle={handle}
            expand={
              count > 0 ? (
                <ExpandToggle count={count} open={open} onToggle={() => setOpen((o) => !o)} />
              ) : undefined
            }
          />
        )}
      </SortableRow>
      {open && count > 0 && <SubtaskRows parentId={row.item.id} enabled={enabled} />}
    </>
  );
}
