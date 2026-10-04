import {
  PRIORITIES,
  WORK_ITEM_TYPES,
  type CustomField,
  type Label,
  type SpaceDetail,
  type WorkItemSummary,
} from '@scrum/shared';
import { ChevronDown, Columns3, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { customColumnId, TABLE_COLUMNS, type TableColumnId, resolveColumns } from './table-columns';
import {
  activeFilterCount,
  DUE_FILTERS,
  GROUP_KEYS,
  SORT_KEYS,
  UNASSIGNED,
  type ViewSearch,
} from './view-state';

/** Çoklu seçim süzgeci: düğme üzerinde seçili sayı gösterilir. */
function MultiFilter({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[] | undefined;
  options: Array<{ value: string; label: ReactNode }>;
  onChange: (values: string[] | undefined) => void;
}) {
  const count = selected?.length ?? 0;
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={count > 0 ? 'secondary' : 'outline'} size="sm" className="h-8">
          {label}
          {count > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px]">
              {count}
            </span>
          )}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected?.includes(option.value) ?? false}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => {
              const next = checked
                ? [...(selected ?? []), option.value]
                : (selected ?? []).filter((v) => v !== option.value);
              onChange(next.length > 0 ? next : undefined);
            }}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Arama kutusu: yazarken adres 250 ms gecikmeyle güncellenir. */
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  // Bu kutunun adrese yazdığı son değer; `value` bundan farklı gelirse değişiklik dışarıdandır
  // (süzgeçleri temizle, kayıtlı görünümü uygula) ve kutu ona eşitlenir.
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => {
      const next = text.trim() ? text : undefined;
      emitted.current = next ?? '';
      onChange(next);
    }, 250);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-8 w-52 items-center gap-1.5 rounded-md border px-2 focus-within:ring-[3px]">
      <Search className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('view.searchInList')}
        aria-label={t('view.searchInList')}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      {text && (
        <button
          type="button"
          aria-label={t('view.clearSearch')}
          onClick={() => {
            setText('');
            onChange(undefined);
          }}
        >
          <X className="text-muted-foreground size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Araç çubuğu: arama, süzgeçler, sıralama, gruplama ve (Table'da) sütun seçimi. */
export function ViewToolbar({
  space,
  items,
  labels,
  search,
  isTable,
  customFields,
  onChange,
  onClear,
}: {
  space: SpaceDetail;
  items: WorkItemSummary[];
  labels: Label[];
  search: ViewSearch;
  isTable: boolean;
  customFields: CustomField[];
  onChange: (patch: Partial<ViewSearch>) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const savedColumns = useUiStore((s) => s.tableColumns);
  const setColumns = useUiStore((s) => s.setTableColumns);
  const visible = resolveColumns(
    savedColumns,
    customFields.map((f) => f.id),
  );
  const filterCount = activeFilterCount(search);
  const assignees = new Map(items.flatMap((i) => i.assignees).map((a) => [a.id, a.name]));
  const flat =
    filterCount > 0 ||
    (search.sort ?? 'manual') !== 'manual' ||
    (search.group ?? 'none') !== 'none';

  const toggleColumn = (id: TableColumnId, checked: boolean) =>
    setColumns(checked ? [...visible, id] : visible.filter((c) => c !== id));

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-6"
      role="toolbar"
      aria-label={t('view.toolbar')}
    >
      <SearchBox value={search.q ?? ''} onChange={(q) => onChange({ q })} />

      <MultiFilter
        label={t('items.columns.status')}
        selected={search.status}
        options={space.statuses.map((s) => ({
          value: s.id,
          label: (
            <>
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </>
          ),
        }))}
        onChange={(status) => onChange({ status })}
      />
      <MultiFilter
        label={t('items.columns.priority')}
        selected={search.priority}
        options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
        onChange={(priority) => onChange({ priority: priority as ViewSearch['priority'] })}
      />
      <MultiFilter
        label={t('items.type')}
        selected={search.type}
        options={WORK_ITEM_TYPES.filter((type) => space.scrumEnabled || type !== 'EPIC').map(
          (type) => ({
            value: type,
            label: t(`workItemType.${type}`),
          }),
        )}
        onChange={(type) => onChange({ type: type as ViewSearch['type'] })}
      />
      <MultiFilter
        label={t('items.columns.assignees')}
        selected={search.assignee}
        options={[
          { value: UNASSIGNED, label: t('detail.unassigned') },
          ...[...assignees].map(([value, name]) => ({ value, label: name })),
        ]}
        onChange={(assignee) => onChange({ assignee })}
      />
      <MultiFilter
        label={t('detail.labels')}
        selected={search.label}
        options={labels.map((l) => ({
          value: l.id,
          label: (
            <>
              <span className="size-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </>
          ),
        }))}
        onChange={(label) => onChange({ label })}
      />
      <NativeSelect
        aria-label={t('items.columns.due')}
        value={search.due ?? ''}
        className={cn('h-8 w-36', search.due && 'border-primary')}
        onChange={(e) => onChange({ due: (e.target.value || undefined) as ViewSearch['due'] })}
      >
        <option value="">{t('view.dueAny')}</option>
        {DUE_FILTERS.map((d) => (
          <option key={d} value={d}>
            {t(`view.due.${d}`)}
          </option>
        ))}
      </NativeSelect>

      <span className="bg-border mx-1 hidden h-5 w-px sm:block" aria-hidden />

      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{t('view.sort')}</span>
        <NativeSelect
          aria-label={t('view.sort')}
          value={search.sort ?? 'manual'}
          className="h-8 w-36"
          onChange={(e) => onChange({ sort: e.target.value as ViewSearch['sort'] })}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`view.sortKeys.${key}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
      {(search.sort ?? 'manual') !== 'manual' && (
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => onChange({ dir: search.dir === 'desc' ? 'asc' : 'desc' })}
          aria-label={t('view.direction')}
        >
          {search.dir === 'desc' ? '↓' : '↑'}
        </Button>
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{t('view.group')}</span>
        <NativeSelect
          aria-label={t('view.group')}
          value={search.group ?? 'none'}
          className="h-8 w-36"
          onChange={(e) => onChange({ group: e.target.value as ViewSearch['group'] })}
        >
          {GROUP_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`view.groupKeys.${key}`)}
            </option>
          ))}
        </NativeSelect>
      </label>

      {isTable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Columns3 />
              {t('view.columnsMenu')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t('view.columnsMenu')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TABLE_COLUMNS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={visible.includes(c.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => toggleColumn(c.id, checked)}
              >
                {t(`view.columns.${c.id}`)}
              </DropdownMenuCheckboxItem>
            ))}
            {customFields.map((field) => (
              <DropdownMenuCheckboxItem
                key={field.id}
                checked={visible.includes(customColumnId(field.id))}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => toggleColumn(customColumnId(field.id), checked)}
              >
                {field.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {flat && (
        <Button variant="ghost" size="sm" className="h-8" onClick={onClear}>
          <X />
          {t('view.clear')}
        </Button>
      )}
    </div>
  );
}
