import type { WorkItemSummary } from '@scrum/shared';
import { ChevronRight, CornerDownRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { cn } from '@/lib/utils';
import { ItemOpenLink } from '../detail/item-nav';
import { AssigneeStack, DueCell, EstimateCell, PriorityCell, StatusCell } from './cells';
import { isOverdue } from './cell-utils';
import { GroupHeader, RowMenu, SelectBox } from './row-parts';
import type { ViewProps } from './view-types';
import { VirtualRows } from './virtual-rows';
import type { ViewRow } from './view-state';

/** List görünümü: hiyerarşik veya gruplu satırlar, satır içi durum/öncelik, sanal kaydırma. */
export function ListView(props: ViewProps) {
  const { t } = useTranslation();
  const { rows, allSelected, onSelectAll } = props;
  const hasItems = rows.some((r) => r.kind === 'item');

  return (
    <div>
      {hasItems && (
        <div className="text-muted-foreground hidden items-center gap-3 border-b px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase md:flex">
          <SelectBox checked={allSelected} onChange={onSelectAll} label={t('view.selectAll')} />
          <span className="flex-1 pl-6">{t('items.columns.title')}</span>
          <span className="w-32">{t('items.columns.status')}</span>
          <span className="w-8 text-center">{t('items.columns.priority')}</span>
          <span className="w-20">{t('items.columns.assignees')}</span>
          <span className="w-16">{t('items.columns.due')}</span>
          <span className="w-12 text-right">{t('items.columns.estimate')}</span>
          <span className="w-8" />
        </div>
      )}
      <VirtualRows
        rows={rows}
        estimate={44}
        getKey={(row) => (row.kind === 'group' ? `g:${row.id}` : row.key)}
        render={(row) => <RowView row={row} props={props} />}
      />
    </div>
  );
}

function RowView({ row, props }: { row: ViewRow; props: ViewProps }) {
  if (row.kind === 'group') {
    return (
      <GroupHeader
        group={row.group}
        collapsed={row.collapsed}
        onToggle={() => props.onToggleGroup(row.id)}
      />
    );
  }
  return (
    <>
      <ItemRow item={row.item} depth={row.depth} children={row.children} props={props} />
      {props.addingUnder === row.item.id && (
        <div className="bg-muted/30 border-b" style={{ paddingLeft: 28 + row.depth * 20 }}>
          {props.renderAddChild(row.item)}
        </div>
      )}
    </>
  );
}

function ItemRow({
  item,
  depth,
  children,
  props,
}: {
  item: WorkItemSummary;
  depth: number;
  children: number;
  props: ViewProps;
}) {
  const { t } = useTranslation();
  const { cells, labels, selected, collapsedItems } = props;
  const status = cells.space.statuses.find((s) => s.id === item.statusId);
  const done = status?.category === 'DONE';
  const collapsed = collapsedItems.has(item.id);
  const itemLabels = item.labelIds.flatMap((id) => labels.get(id) ?? []);

  return (
    <div
      className={cn(
        'group/item hover:bg-accent/50 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 md:flex-nowrap md:py-1.5',
        selected.has(item.id) && 'bg-primary/5',
      )}
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 md:basis-auto">
        <SelectBox
          checked={selected.has(item.id)}
          onChange={(value) => props.onSelect(item.id, value)}
          label={t('view.select', { key: item.key })}
        />
        {children > 0 ? (
          <button
            type="button"
            onClick={() => props.onToggleItem(item.id)}
            aria-expanded={!collapsed}
            aria-label={t(collapsed ? 'items.expand' : 'items.collapse', { key: item.key })}
            className="text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <WorkItemTypeIcon type={item.type} />
        <span className="text-muted-foreground shrink-0 font-mono text-xs">{item.key}</span>
        <ItemOpenLink
          itemKey={item.key}
          className={cn(
            'min-w-0 truncate text-sm hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </ItemOpenLink>
        {itemLabels.slice(0, 2).map((label) => (
          <span
            key={label.id}
            className="hidden shrink-0 rounded-full border px-1.5 text-[11px] sm:inline"
            style={{ borderColor: label.color, color: label.color }}
          >
            {label.name}
          </span>
        ))}
        {item.childCount > 0 && (
          <span className="text-muted-foreground shrink-0 text-xs">
            <CornerDownRight className="mr-0.5 inline size-3" aria-hidden />
            {item.childCount}
          </span>
        )}
      </div>

      <div className="w-32 shrink-0">
        <StatusCell item={item} ctx={cells} />
      </div>
      <div className="flex w-8 shrink-0 justify-center">
        <PriorityCell item={item} ctx={cells} />
      </div>
      <div className="w-20 shrink-0">
        <AssigneeStack item={item} />
      </div>
      <div className="w-16 shrink-0">
        <DueCell item={item} overdue={isOverdue(item, !!done)} />
      </div>
      <div className="w-12 shrink-0 text-right">
        <EstimateCell item={item} ctx={cells} />
      </div>
      <div className="flex w-8 shrink-0 justify-end">
        {cells.canWrite && (
          <RowMenu
            item={item}
            canAddChild={props.canAddChild(item)}
            onAddChild={() => props.onAddChild(item.id)}
            onCopy={() => props.onCopy(item.id)}
            onArchive={() => props.onArchive(item)}
            onDelete={() => props.onDelete(item)}
          />
        )}
      </div>
    </div>
  );
}
