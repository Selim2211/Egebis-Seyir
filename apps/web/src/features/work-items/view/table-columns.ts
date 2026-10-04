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

type StaticColumnId = (typeof TABLE_COLUMNS)[number]['id'];

/** Özel alan sütununun kimliği: `cf:<alanId>` (ADR-082). */
export type CustomColumnId = `cf:${string}`;
export type TableColumnId = StaticColumnId | CustomColumnId;

export const customColumnId = (fieldId: string): CustomColumnId => `cf:${fieldId}`;

export interface ColumnDef {
  id: TableColumnId;
  width: number;
  sort: SortKey | null;
}

export const CUSTOM_COLUMN_WIDTH = 150;

/** Görünen sütunların tanımları: önce yerleşik, sonra özel alan sütunları (alan sırasıyla). */
export function columnDefs(
  columns: readonly TableColumnId[],
  fieldIds: readonly string[],
): ColumnDef[] {
  const builtIn: ColumnDef[] = TABLE_COLUMNS.filter((c) => columns.includes(c.id));
  const custom: ColumnDef[] = fieldIds
    .map(customColumnId)
    .filter((id) => columns.includes(id))
    .map((id) => ({ id, width: CUSTOM_COLUMN_WIDTH, sort: null }));
  return [...builtIn, ...custom];
}

export const DEFAULT_TABLE_COLUMNS: StaticColumnId[] = [
  'type',
  'status',
  'priority',
  'assignees',
  'due',
  'estimate',
];

/** Kayıtlı sütun seçimini geçerli sütunlara indirger (eski/bilinmeyen kimlikler atılır). */
export function resolveColumns(
  saved: string[] | null,
  fieldIds: readonly string[] = [],
): TableColumnId[] {
  const custom = fieldIds.map(customColumnId);
  const valid = new Set<string>([...TABLE_COLUMNS.map((c) => c.id), ...custom]);
  const chosen: readonly string[] =
    saved === null ? DEFAULT_TABLE_COLUMNS : saved.filter((id) => valid.has(id));
  return [...TABLE_COLUMNS.map((c) => c.id), ...custom].filter((id) => chosen.includes(id));
}
