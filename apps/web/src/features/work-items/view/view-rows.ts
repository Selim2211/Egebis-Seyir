import type { WorkItemSummary } from '@scrum/shared';
import { buildRows } from '../item-tree';
import {
  filterItems,
  groupItems,
  isFlatView,
  sortItems,
  type ViewContext,
  type ViewRow,
  type ViewSearch,
} from './view-state';

/**
 * Görünümün satırlarını üretir (ADR-052). Süzgeç/sıralama/gruplama yoksa hiyerarşik ağaç,
 * varsa düz liste. Gruplu görünümde her grubun başlığı ve (daraltılmamışsa) öğeleri gelir.
 */
export function buildViewRows(
  items: WorkItemSummary[],
  search: ViewSearch,
  ctx: ViewContext,
  collapsedItems: ReadonlySet<string>,
  collapsedGroups: ReadonlySet<string>,
): ViewRow[] {
  if (!isFlatView(search)) {
    return buildRows(items, collapsedItems).map(({ item, depth, children }) => ({
      kind: 'item' as const,
      key: item.id,
      item,
      depth,
      children,
    }));
  }

  const filtered = filterItems(items, search, ctx);
  const sorted = sortItems(filtered, search.sort ?? 'manual', search.dir ?? 'asc', ctx);
  const groups = groupItems(sorted, search.group ?? 'none', ctx);
  const grouped = (search.group ?? 'none') !== 'none';

  return groups.flatMap<ViewRow>((group) => {
    const collapsed = collapsedGroups.has(group.id);
    const header: ViewRow[] = grouped ? [{ kind: 'group', id: group.id, group, collapsed }] : [];
    if (collapsed) return header;
    return [
      ...header,
      ...group.items.map<ViewRow>((item) => ({
        kind: 'item',
        key: `${group.id}:${item.id}`,
        item,
        depth: 0,
        children: 0,
      })),
    ];
  });
}

/** Satırlardaki öğeler (seçim ve "tümünü seç" için; aynı öğe birden çok grupta tekrarlanabilir). */
export const itemsOf = (rows: ViewRow[]): WorkItemSummary[] => {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (row.kind !== 'item' || seen.has(row.item.id)) return [];
    seen.add(row.item.id);
    return row.item;
  });
};
