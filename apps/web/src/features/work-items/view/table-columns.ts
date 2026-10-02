import type { SortKey } from './view-state';

/** Table sütunları. `key` ve `title` her zaman görünür; diğerleri seçilebilir (brief §5.8). */
export const TABLE_COLUMNS = [
  { id: 'type', width: 90, sort: null },
  { id: 'status', width: 150, sort: 'status' },
  { id: 'priority', width: 70, sort: 'priority' },
  { id: 'assignees', width: 110, sort: null },
  { id: 'labels', width: 160, sort: null },
  { id: 'start', width: 120, sort: 'start' },
  { id: 'due', width: 120, sort: 'due' },
  { id: 'estimate', width: 90, sort: 'estimate' },
  { id: 'created', width: 110, sort: 'created' },
] as const satisfies ReadonlyArray<{ id: string; width: number; sort: SortKey | null }>;

export type TableColumnId = (typeof TABLE_COLUMNS)[number]['id'];

export const DEFAULT_TABLE_COLUMNS: TableColumnId[] = [
  'type',
  'status',
  'priority',
  'assignees',
  'due',
  'estimate',
];

/** Kayıtlı sütun seçimini geçerli sütunlara indirger (eski/bilinmeyen kimlikler atılır). */
export function resolveColumns(saved: string[] | null): TableColumnId[] {
  const valid = new Set<string>(TABLE_COLUMNS.map((c) => c.id));
  const chosen = saved === null ? DEFAULT_TABLE_COLUMNS : saved.filter((id) => valid.has(id));
  return TABLE_COLUMNS.map((c) => c.id).filter((id) => chosen.includes(id));
}
