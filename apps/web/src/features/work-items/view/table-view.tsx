import type { WorkItemSummary } from '@scrum/shared';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { formatShortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ItemOpenLink } from '../detail/item-nav';
import { AssigneeStack, DueCell, EstimateCell, PriorityCell, StatusCell } from './cells';
import { isOverdue } from './cell-utils';
import { GroupHeader, RowMenu, SelectBox } from './row-parts';
import { TABLE_COLUMNS, type TableColumnId } from './table-columns';
import type { ViewProps } from './view-types';
import type { SortKey, ViewRow } from './view-state';
import { VirtualRows } from './virtual-rows';

const KEY_WIDTH = 84;
const TITLE_WIDTH = 320;
const SELECT_WIDTH = 36;
const MENU_WIDTH = 40;

interface TableProps extends ViewProps {
  columns: TableColumnId[];
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}

/** Table görünümü: seçilebilir sütunlar, sütun başlığından sıralama, satır içi düzenleme. */
export function TableView(props: TableProps) {
  const { t } = useTranslation();
  const { rows, columns, sort, dir, onSort } = props;
  const defs = TABLE_COLUMNS.filter((c) => columns.includes(c.id));
  const width =
    SELECT_WIDTH + KEY_WIDTH + TITLE_WIDTH + MENU_WIDTH + defs.reduce((sum, c) => sum + c.width, 0);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: width }} role="table" aria-label={t('view.table')}>
        <div
          role="row"
          className="text-muted-foreground bg-muted/30 flex items-center border-b text-[11px] font-semibold tracking-wide uppercase"
        >
          <div
            role="columnheader"
            className="flex shrink-0 items-center px-3 py-1.5"
            style={{ width: SELECT_WIDTH }}
          >
            <SelectBox
              checked={props.allSelected}
              onChange={props.onSelectAll}
              label={t('view.selectAll')}
            />
          </div>
          <HeaderCell
            label={t('view.columns.key')}
            width={KEY_WIDTH}
            sortKey="key"
            {...{ sort, dir, onSort }}
          />
          <HeaderCell
            label={t('view.columns.title')}
            width={TITLE_WIDTH}
            sortKey="title"
            {...{ sort, dir, onSort }}
          />
          {defs.map((c) => (
            <HeaderCell
              key={c.id}
              label={t(`view.columns.${c.id}`)}
              width={c.width}
              sortKey={c.sort}
              {...{ sort, dir, onSort }}
            />
          ))}
          <div className="shrink-0" style={{ width: MENU_WIDTH }} />
        </div>
        <VirtualRows
          rows={rows}
          estimate={36}
          getKey={(row) => (row.kind === 'group' ? `g:${row.id}` : row.key)}
          render={(row) => <TableRow row={row} props={props} defs={defs} />}
        />
      </div>
    </div>
  );
}

function HeaderCell({
  label,
  width,
  sortKey,
  sort,
  dir,
  onSort,
}: {
  label: string;
  width: number;
  sortKey: SortKey | null;
  sort: SortKey;
  dir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey !== null && sort === sortKey;
  return (
    <div
      role="columnheader"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className="shrink-0 px-2 py-1.5"
      style={{ width }}
    >
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="hover:text-foreground flex items-center gap-1 uppercase"
        >
          {label}
          {active &&
            (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      ) : (
        label
      )}
    </div>
  );
}

function TableRow({
  row,
  props,
  defs,
}: {
  row: ViewRow;
  props: TableProps;
  defs: Array<(typeof TABLE_COLUMNS)[number]>;
}) {
  if (row.kind === 'group') {
    return (
      <GroupHeader
        group={row.group}
        collapsed={row.collapsed}
        onToggle={() => props.onToggleGroup(row.id)}
      />
    );
  }
  const { item, depth, children } = row;
  return (
    <>
      <ItemTableRow item={item} depth={depth} children={children} props={props} defs={defs} />
      {props.addingUnder === item.id && (
        <div className="bg-muted/30 border-b" style={{ paddingLeft: SELECT_WIDTH + depth * 16 }}>
          {props.renderAddChild(item)}
        </div>
      )}
    </>
  );
}

function ItemTableRow({
  item,
  depth,
  children,
  props,
  defs,
}: {
  item: WorkItemSummary;
  depth: number;
  children: number;
  props: TableProps;
  defs: Array<(typeof TABLE_COLUMNS)[number]>;
}) {
  const { t } = useTranslation();
  const { cells, labels, selected, collapsedItems } = props;
  const status = cells.space.statuses.find((s) => s.id === item.statusId);
  const done = status?.category === 'DONE';
  const collapsed = collapsedItems.has(item.id);

  const cell = (id: TableColumnId) => {
    switch (id) {
      case 'type':
        return (
          <span className="flex items-center gap-1.5 text-xs">
            <WorkItemTypeIcon type={item.type} />
            {t(`workItemType.${item.type}`)}
          </span>
        );
      case 'status':
        return <StatusCell item={item} ctx={cells} />;
      case 'priority':
        return <PriorityCell item={item} ctx={cells} />;
      case 'assignees':
        return <AssigneeStack item={item} />;
      case 'labels':
        return (
          <span className="flex flex-wrap gap-1">
            {item.labelIds
              .flatMap((labelId) => labels.get(labelId) ?? [])
              .map((label) => (
                <span
                  key={label.id}
                  className="rounded-full border px-1.5 text-[11px]"
                  style={{ borderColor: label.color, color: label.color }}
                >
                  {label.name}
                </span>
              ))}
          </span>
        );
      case 'start':
        return (
          <DueCell
            item={item}
            field="startDate"
            editable={cells.canWrite}
            onChange={(startDate) => cells.onPatch(item.id, { startDate })}
          />
        );
      case 'due':
        return (
          <DueCell
            item={item}
            overdue={isOverdue(item, !!done)}
            editable={cells.canWrite}
            onChange={(dueDate) => cells.onPatch(item.id, { dueDate })}
          />
        );
      case 'estimate':
        return <EstimateCell item={item} ctx={cells} editable />;
      case 'created':
        return (
          <span className="text-muted-foreground text-xs">
            {formatShortDate(item.createdAt.slice(0, 10))}
          </span>
        );
    }
  };

  return (
    <div
      role="row"
      className={cn(
        'group/item hover:bg-accent/50 flex items-center border-b',
        selected.has(item.id) && 'bg-primary/5',
      )}
    >
      <div className="flex shrink-0 items-center px-3 py-1.5" style={{ width: SELECT_WIDTH }}>
        <SelectBox
          checked={selected.has(item.id)}
          onChange={(value) => props.onSelect(item.id, value)}
          label={t('view.select', { key: item.key })}
        />
      </div>
      <div
        className="text-muted-foreground shrink-0 px-2 font-mono text-xs"
        style={{ width: KEY_WIDTH }}
      >
        {item.key}
      </div>
      <div
        className="flex shrink-0 items-center gap-1 px-2 py-1"
        style={{ width: TITLE_WIDTH, paddingLeft: 8 + depth * 16 }}
      >
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
        <ItemOpenLink
          itemKey={item.key}
          className={cn(
            'truncate text-sm hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {item.title}
        </ItemOpenLink>
      </div>
      {defs.map((c) => (
        <div key={c.id} role="cell" className="shrink-0 px-2 py-1" style={{ width: c.width }}>
          {cell(c.id)}
        </div>
      ))}
      <div className="flex shrink-0 justify-end px-1" style={{ width: MENU_WIDTH }}>
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
