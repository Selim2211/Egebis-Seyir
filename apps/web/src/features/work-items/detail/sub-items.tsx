import { statusName } from '@/lib/default-names';
import { SPLIT_MAX_TASKS, type SpaceDetail, type WorkItemDetail } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Scissors } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { FormError } from '@/components/form';
import { cn } from '@/lib/utils';
import { ItemOpenLink } from './item-nav';
import { creatableTypes } from '../item-tree';
import { QuickCreate } from '../quick-create';
import { itemQuery, useSplitItem } from '../queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';

/** Alt öğeler: liste, hızlı ekleme ve Story için "Task'lara böl" (ADR-051). */
export function SubItems({
  item,
  space,
  canWrite,
}: {
  item: WorkItemDetail;
  space: SpaceDetail;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [splitting, setSplitting] = useState(false);
  const statuses = new Map(space.statuses.map((s) => [s.id, s]));
  const canAdd = canWrite && creatableTypes(space.scrumEnabled, item.type).length > 0;
  const done = item.children.filter((c) => statuses.get(c.statusId)?.category === 'DONE').length;

  if (item.children.length === 0 && !canAdd) return null;

  return (
    <section aria-labelledby="sub-items-title">
      <div className="mb-1 flex items-center gap-2">
        <h3 id="sub-items-title" className="text-sm font-semibold">
          {t('detail.subItems')}
        </h3>
        {item.children.length > 0 && (
          <span className="text-muted-foreground text-xs">
            {done}/{item.children.length}
          </span>
        )}
        {canWrite && item.type === 'TASK' && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSplitting(true)}>
            <Scissors />
            {t('detail.split')}
          </Button>
        )}
      </div>
      {item.children.length > 0 && (
        <ul className="divide-y rounded-md border">
          {item.children.map((child) => (
            <ChildRow
              key={child.id}
              child={child}
              statuses={statuses}
              // Epic'in altındaki Task'ların Sub-Task'ları da (anneleriyle birlikte) görünür.
              expandable={item.type === 'EPIC' && child.childCount > 0}
            />
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="mt-1 rounded-md border border-dashed">
          <QuickCreate
            listId={item.listId}
            scrumEnabled={space.scrumEnabled}
            parent={{ id: item.id, type: item.type }}
          />
        </div>
      )}
      {splitting && <SplitDialog itemId={item.id} onClose={() => setSplitting(false)} />}
    </section>
  );
}

type Statuses = Map<string, SpaceDetail['statuses'][number]>;

/** Alt öğe satırı; Epic altındaki Task'ın Sub-Task'ları girintili olarak açılıp kapanır (varsayılan açık). */
function ChildRow({
  child,
  statuses,
  expandable,
  depth = 0,
}: {
  child: WorkItemDetail['children'][number];
  statuses: Statuses;
  expandable: boolean;
  depth?: number;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const [open, setOpen] = useState(true);
  const nested = useQuery({ ...itemQuery(workspaceId, child.id), enabled: expandable && open });
  const status = statuses.get(child.statusId);
  return (
    <li>
      <div className="hover:bg-accent/50 flex items-center" style={{ paddingLeft: depth * 20 }}>
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={t(open ? 'backlog.collapseSubtasks' : 'backlog.expandSubtasks')}
            className="text-muted-foreground hover:bg-accent ml-1 flex shrink-0 items-center gap-0.5 rounded px-0.5 text-xs tabular-nums"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
            {child.childCount}
          </button>
        ) : (
          depth === 0 && <span className="w-1.5" />
        )}
        <ItemOpenLink
          itemKey={child.key}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-sm"
        >
          <WorkItemTypeIcon type={child.type} />
          <span className="text-muted-foreground font-mono text-xs">{child.key}</span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              status?.category === 'DONE' && 'text-muted-foreground line-through',
            )}
          >
            {child.title}
          </span>
          {status && (
            <StatusBadge
              category={status.category}
              label={statusName(status.name)}
              color={status.color}
            />
          )}
        </ItemOpenLink>
      </div>
      {expandable && open && (
        <ul className="bg-muted/30 divide-y border-t">
          {(nested.data?.children ?? []).map((sub) => (
            <ChildRow key={sub.id} child={sub} statuses={statuses} expandable={false} depth={2} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SplitDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const split = useSplitItem();
  const [text, setText] = useState('');
  const titles = text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  const tooMany = titles.length > SPLIT_MAX_TASKS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (titles.length === 0 || tooMany) return;
    split.mutate(
      { itemId, titles },
      {
        onSuccess: ({ items }) => {
          toast.success(t('detail.splitDone', { count: items.length }));
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t('detail.split')}</DialogTitle>
            <DialogDescription>{t('detail.splitHelp', { max: SPLIT_MAX_TASKS })}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Textarea
              autoFocus
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('detail.splitPlaceholder')}
              aria-label={t('detail.splitTitles')}
            />
            <p className={cn('text-xs', tooMany ? 'text-destructive' : 'text-muted-foreground')}>
              {t('detail.splitCount', { count: titles.length })}
            </p>
            {split.error ? <FormError error={split.error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={titles.length === 0 || tooMany || split.isPending}>
              {t('detail.splitSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
