import {
  SPACE_PERMISSIONS as S,
  type SpaceDetail,
  type WorkItemSummary,
  type WorkItemsResponse,
} from '@scrum/shared';
import { Inbox, SearchX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useMe } from '@/features/auth/queries';
import { todayDay } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { creatableTypes } from './item-tree';
import { type ItemAction, useCopyItem, useItemLifecycle, useUpdateItem } from './queries';
import { QuickCreate } from './quick-create';
import { QUICK_CREATE_INPUT_ID } from './quick-create-id';
import { useStatusGuard } from './status-guard';
import { BulkBar } from './view/bulk-bar';
import type { CellContext } from './view/cells';
import { ListView } from './view/list-view';
import { resolveColumns } from './view/table-columns';
import { TableView } from './view/table-view';
import { ViewToolbar } from './view/toolbar';
import { buildViewRows, itemsOf } from './view/view-rows';
import type { ViewProps } from './view/view-types';
import {
  activeFilterCount,
  type SortKey,
  type ViewContext,
  type ViewSearch,
} from './view/view-state';

/**
 * List sayfasının iş öğesi görünümü (ADR-052): araç çubuğu, List/Table, toplu düzenleme.
 * Görünüm durumu adres parametrelerindedir; `onSearch` bunları günceller.
 */
export function ItemsView({
  listId,
  space,
  data,
  archived,
  search,
  onSearch,
}: {
  listId: string;
  space: SpaceDetail;
  data: WorkItemsResponse;
  archived: boolean;
  search: ViewSearch;
  /** `null` = tüm görünüm ayarlarını temizle (açık öğe paneli korunur). */
  onSearch: (patch: Partial<ViewSearch> | null) => void;
}) {
  const { t } = useTranslation();
  const { user } = useMe();
  const errorMessage = useErrorMessage();
  const update = useUpdateItem(listId);
  const lifecycle = useItemLifecycle();
  const copy = useCopyItem();
  const savedColumns = useUiStore((s) => s.tableColumns);
  const [collapsedItems, setCollapsedItems] = useState<ReadonlySet<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [pickedIds, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{
    count: number;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const isTable = search.view === 'table';
  const canWrite = space.permissions.includes(S.WORK_ITEM_WRITE) && !archived;
  const canEstimate = space.permissions.includes(S.ESTIMATE_WRITE) && !archived;

  const ctx = useMemo<ViewContext>(
    () => ({
      statuses: new Map(
        space.statuses.map((s, order) => [
          s.id,
          { name: s.name, color: s.color, category: s.category, order },
        ]),
      ),
      labels: new Map(data.labels.map((l) => [l.id, { name: l.name }])),
      today: todayDay(),
    }),
    [space.statuses, data.labels],
  );
  const rows = useMemo(
    () => buildViewRows(data.items, search, ctx, collapsedItems, collapsedGroups),
    [data.items, search, ctx, collapsedItems, collapsedGroups],
  );
  const visibleItems = useMemo(() => itemsOf(rows), [rows]);
  const filtered = activeFilterCount(search) > 0;
  // Görünmeyen (süzülmüş/silinmiş) öğelerin seçimi geçersiz sayılır.
  const selected = useMemo(() => {
    const visible = new Set(visibleItems.map((i) => i.id));
    return new Set([...pickedIds].filter((id) => visible.has(id)));
  }, [pickedIds, visibleItems]);

  const guard = useStatusGuard(
    (itemId, statusId, force, handlers) =>
      update.mutate({ itemId, body: { statusId, ...(force && { force }) } }, handlers),
    update.isPending,
  );

  const cells: CellContext = {
    space,
    canWrite,
    canEstimate,
    canChangeStatus: (item) =>
      !archived &&
      (canWrite ||
        (space.permissions.includes(S.WORK_ITEM_STATUS_OWN) &&
          item.assignees.some((a) => a.id === user.id))),
    onStatus: guard.change,
    onPatch: (itemId, body) =>
      update.mutate({ itemId, body }, { onError: (error) => toast.error(errorMessage(error)) }),
  };

  const run = (itemId: string, action: ItemAction, message: string) =>
    lifecycle.mutate(
      { itemId, action },
      {
        onSuccess: () =>
          toast.success(message, {
            action: {
              label: t('structure.undo'),
              onClick: () =>
                lifecycle.mutate({
                  itemId,
                  action: action === 'archive' ? 'unarchive' : 'restore',
                }),
            },
          }),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  // `C`: hızlı oluşturma satırına odaklan (brief §11); metin girişlerinde ve pencerelerde çalışmaz.
  const focusQuickCreate = useCallback((e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
      return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    const input = document.getElementById(QUICK_CREATE_INPUT_ID);
    if (!input) return;
    e.preventDefault();
    input.focus();
  }, []);
  useEffect(() => {
    if (!canWrite) return;
    document.addEventListener('keydown', focusQuickCreate);
    return () => document.removeEventListener('keydown', focusQuickCreate);
  }, [canWrite, focusQuickCreate]);

  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };

  const sortBy = (key: SortKey) =>
    onSearch(
      search.sort === key
        ? { dir: search.dir === 'desc' ? 'asc' : 'desc' }
        : { sort: key, dir: 'asc' },
    );

  const viewProps: ViewProps = {
    rows,
    cells,
    labels: new Map(data.labels.map((l) => [l.id, l])),
    selected,
    onSelect: (id, value) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (value) next.add(id);
        else next.delete(id);
        return next;
      }),
    onSelectAll: (value) => setPicked(value ? new Set(visibleItems.map((i) => i.id)) : new Set()),
    allSelected: visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id)),
    collapsedItems,
    onToggleItem: (id) => setCollapsedItems((prev) => toggle(prev, id)),
    onToggleGroup: (id) => setCollapsedGroups((prev) => toggle(prev, id)),
    canAddChild: (item: WorkItemSummary) =>
      canWrite && creatableTypes(space.scrumEnabled, item.type).length > 0,
    onAddChild: setAddingUnder,
    onCopy: (itemId) =>
      copy.mutate(
        { itemId, body: { includeChildren: true } },
        {
          onSuccess: ({ key }) => toast.success(t('items.copied', { key })),
          onError: (error) => toast.error(errorMessage(error)),
        },
      ),
    onArchive: (item) => run(item.id, 'archive', t('items.archived', { key: item.key })),
    onDelete: (item) => run(item.id, 'delete', t('items.trashed', { key: item.key })),
    addingUnder,
    renderAddChild: (item) => (
      <QuickCreate
        listId={listId}
        scrumEnabled={space.scrumEnabled}
        parent={{ id: item.id, type: item.type }}
        autoFocus
        onDone={() => setAddingUnder(null)}
      />
    ),
  };

  const empty = data.items.length === 0;

  return (
    <div>
      {!empty && (
        <ViewToolbar
          space={space}
          items={data.items}
          labels={data.labels}
          search={search}
          isTable={isTable}
          onChange={(patch) => onSearch(patch)}
          onClear={() => onSearch(null)}
        />
      )}

      <div className={cn('mx-auto max-w-6xl', !isTable && 'sm:px-6 sm:py-4')}>
        <div className={cn('bg-card', !isTable && 'overflow-hidden sm:rounded-lg sm:border')}>
          {empty ? (
            <EmptyState canWrite={canWrite} />
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <SearchX className="text-muted-foreground size-8" aria-hidden />
              <p className="text-sm">{t('view.noMatches')}</p>
            </div>
          ) : isTable ? (
            <TableView
              {...viewProps}
              columns={resolveColumns(savedColumns)}
              sort={search.sort ?? 'manual'}
              dir={search.dir ?? 'asc'}
              onSort={sortBy}
            />
          ) : (
            <ListView {...viewProps} />
          )}
          {canWrite && !filtered && (
            <div className={cn(!empty && 'border-t')}>
              <QuickCreate listId={listId} scrumEnabled={space.scrumEnabled} />
            </div>
          )}
          {canWrite && filtered && (
            <p className="text-muted-foreground border-t px-4 py-2 text-xs">
              {t('view.filteredHint')}
            </p>
          )}
        </div>
      </div>

      {selected.size > 0 && canWrite && (
        <BulkBar
          space={space}
          selected={selected}
          items={visibleItems}
          labels={data.labels}
          onClear={() => setPicked(new Set())}
          confirmForce={(count) => new Promise((resolve) => setBulkConfirm({ count, resolve }))}
        />
      )}

      {guard.dialog}
      <ConfirmDialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            bulkConfirm?.resolve(false);
            setBulkConfirm(null);
          }
        }}
        title={t('items.openChildrenTitle')}
        description={t('items.openChildrenBody', { count: bulkConfirm?.count ?? 0 })}
        confirmLabel={t('items.completeAnyway')}
        onConfirm={() => {
          bulkConfirm?.resolve(true);
          setBulkConfirm(null);
        }}
      />
    </div>
  );
}

function EmptyState({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="text-muted-foreground size-8" aria-hidden />
      <h2 className="text-base font-medium">{t('items.emptyTitle')}</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t(canWrite ? 'items.emptyBodyWrite' : 'items.emptyBodyRead')}
      </p>
    </div>
  );
}
