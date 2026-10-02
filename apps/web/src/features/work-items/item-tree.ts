import {
  ALLOWED_PARENT_TYPES,
  checkParent,
  checkTypeInSpace,
  WORK_ITEM_TYPES,
  type WorkItemSummary,
  type WorkItemType,
} from '@scrum/shared';

export interface ItemRow {
  item: WorkItemSummary;
  depth: number;
  /** Doğrudan alt öğe sayısı (listede görünenler). */
  children: number;
}

/**
 * Liste öğelerini hiyerarşik, düzleştirilmiş satırlara çevirir. Üst öğesi bu listede olmayan
 * (başka listeye taşınmış vb.) öğeler kök sayılır. Sıra, API'den gelen rank sırasıdır.
 * `collapsed` içindeki öğelerin alt öğeleri gizlenir.
 */
export function buildRows(items: WorkItemSummary[], collapsed: ReadonlySet<string>): ItemRow[] {
  const ids = new Set(items.map((i) => i.id));
  const byParent = new Map<string | null, WorkItemSummary[]>();
  for (const item of items) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), item]);
  }
  const rows: ItemRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const item of byParent.get(parent) ?? []) {
      const kids = byParent.get(item.id) ?? [];
      rows.push({ item, depth, children: kids.length });
      if (kids.length > 0 && !collapsed.has(item.id)) walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Bu bağlamda oluşturulabilen tipler: kök için üst öğesiz olabilenler, alt öğe için üst tipe uyanlar. */
export function creatableTypes(
  scrumEnabled: boolean,
  parentType: WorkItemType | null,
): WorkItemType[] {
  return WORK_ITEM_TYPES.filter(
    (type) =>
      checkTypeInSpace(type, scrumEnabled).ok &&
      (parentType === null
        ? checkParent(type, null).ok
        : ALLOWED_PARENT_TYPES[type].includes(parentType)),
  );
}
