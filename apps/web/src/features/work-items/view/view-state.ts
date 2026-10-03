import {
  PRIORITIES,
  WORK_ITEM_TYPES,
  type Priority,
  type StatusCategory,
  type WorkItemSummary,
  type WorkItemType,
} from '@scrum/shared';
import { z } from 'zod';
import { SWIMLANES } from '@/features/board/board-model';

/** Görünüm durumu adreste tutulur (ADR-052); şema router'ın `validateSearch`'ünde kullanılır. */
export const VIEW_KINDS = ['list', 'table', 'board', 'calendar'] as const;
export const SORT_KEYS = [
  'manual',
  'title',
  'key',
  'status',
  'priority',
  'due',
  'start',
  'estimate',
  'created',
] as const;
export const GROUP_KEYS = ['none', 'status', 'assignee', 'priority', 'type', 'due'] as const;
export const DUE_FILTERS = ['overdue', 'week', 'none'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type GroupKey = (typeof GROUP_KEYS)[number];
export type DueFilter = (typeof DUE_FILTERS)[number];

/** Atanmamış öğeleri seçmek için özel değer. */
export const UNASSIGNED = 'none';

export const ViewSearchSchema = z.object({
  item: z.string().optional(),
  view: z.enum(VIEW_KINDS).optional(),
  q: z.string().optional(),
  status: z.array(z.string()).optional(),
  priority: z.array(z.enum(PRIORITIES)).optional(),
  type: z.array(z.enum(WORK_ITEM_TYPES)).optional(),
  assignee: z.array(z.string()).optional(),
  label: z.array(z.string()).optional(),
  due: z.enum(DUE_FILTERS).optional(),
  sort: z.enum(SORT_KEYS).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  group: z.enum(GROUP_KEYS).optional(),
  /** Board satır gruplaması. */
  lane: z.enum(SWIMLANES).optional(),
});
export type ViewSearch = z.infer<typeof ViewSearchSchema>;

export type ViewFilters = Pick<
  ViewSearch,
  'q' | 'status' | 'priority' | 'type' | 'assignee' | 'label' | 'due'
>;

export interface ViewContext {
  /** Durum id → sıra, kategori, ad ve renk (Space'e özel). */
  statuses: ReadonlyMap<
    string,
    { name: string; color: string; category: StatusCategory; order: number }
  >;
  labels: ReadonlyMap<string, { name: string }>;
  /** Bugün, YYYY-MM-DD (yerel). Testlerde sabitlenir. */
  today: string;
}

const addDays = (day: string, days: number): string => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

/** Bitiş tarihinin kovası. Tamamlanmış öğe gecikmiş sayılmaz. */
export function dueBucket(
  item: WorkItemSummary,
  category: StatusCategory,
  today: string,
): DueBucket {
  if (!item.dueDate) return 'none';
  // Geçmiş tarihli tamamlanmış öğe aciliyet taşımaz.
  if (item.dueDate < today) return category === 'DONE' ? 'later' : 'overdue';
  if (item.dueDate === today) return 'today';
  if (item.dueDate <= addDays(today, 7)) return 'week';
  return 'later';
}

const categoryOf = (item: WorkItemSummary, ctx: ViewContext): StatusCategory =>
  ctx.statuses.get(item.statusId)?.category ?? 'NOT_STARTED';

/** Süzgeçler VE ile birleşir; aynı süzgeçteki seçenekler VEYA ile. */
export function filterItems(
  items: WorkItemSummary[],
  filters: ViewFilters,
  ctx: ViewContext,
): WorkItemSummary[] {
  const q = filters.q?.trim().toLocaleLowerCase('tr');
  return items.filter((item) => {
    if (q && !`${item.key} ${item.title}`.toLocaleLowerCase('tr').includes(q)) return false;
    if (filters.status?.length && !filters.status.includes(item.statusId)) return false;
    if (filters.priority?.length && !filters.priority.includes(item.priority)) return false;
    if (filters.type?.length && !filters.type.includes(item.type)) return false;
    if (filters.assignee?.length) {
      const wantsNone = filters.assignee.includes(UNASSIGNED);
      const match =
        (wantsNone && item.assignees.length === 0) ||
        item.assignees.some((a) => filters.assignee!.includes(a.id));
      if (!match) return false;
    }
    if (filters.label?.length && !item.labelIds.some((id) => filters.label!.includes(id))) {
      return false;
    }
    if (filters.due) {
      const bucket = dueBucket(item, categoryOf(item, ctx), ctx.today);
      if (filters.due === 'none' && bucket !== 'none') return false;
      if (filters.due === 'overdue' && bucket !== 'overdue') return false;
      if (filters.due === 'week' && !['overdue', 'today', 'week'].includes(bucket)) return false;
    }
    return true;
  });
}

const PRIORITY_ORDER = new Map<Priority, number>(PRIORITIES.map((p, i) => [p, i]));
const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

/** `manual` = API'den gelen rank sırası (dokunulmaz). Boş değerler her yönde sonda kalır. */
export function sortItems(
  items: WorkItemSummary[],
  sort: SortKey,
  dir: 'asc' | 'desc',
  ctx: ViewContext,
): WorkItemSummary[] {
  if (sort === 'manual') return items;
  const sign = dir === 'asc' ? 1 : -1;
  const value = (item: WorkItemSummary): string | number | null => {
    switch (sort) {
      case 'title':
        return item.title;
      case 'key':
        return item.key;
      case 'status':
        return ctx.statuses.get(item.statusId)?.order ?? null;
      case 'priority':
        return PRIORITY_ORDER.get(item.priority) ?? null;
      case 'due':
        return item.dueDate;
      case 'start':
        return item.startDate;
      case 'estimate':
        return item.points ?? item.estimateHours;
      case 'created':
        return item.createdAt;
    }
  };
  return [...items].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const cmp =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : collator.compare(String(x), String(y));
    return cmp * sign;
  });
}

/** Çevrilebilen grup başlıkları (tip güvenli anahtar). */
export type GroupLabelKey =
  | 'detail.unassigned'
  | `priority.${Priority}`
  | `workItemType.${WorkItemType}`
  | `groups.due.${DueBucket}`;

export interface ItemGroup {
  id: string;
  label: string;
  /** Çevrilecek anahtar (varsa `label` yerine kullanılır). */
  labelKey?: GroupLabelKey;
  color?: string;
  items: WorkItemSummary[];
}

const DUE_ORDER: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];

/**
 * Öğeleri gruplar. Birden çok kişiye atanmış öğe her atananın altında görünür.
 * Boş gruplar atılır; grup sırası alanın doğal sırasıdır (durum akışı, öncelik, tip…).
 */
export function groupItems(
  items: WorkItemSummary[],
  group: GroupKey,
  ctx: ViewContext,
): ItemGroup[] {
  if (group === 'none') return [{ id: 'all', label: '', items }];
  const map = new Map<string, ItemGroup>();
  const add = (id: string, make: () => Omit<ItemGroup, 'id' | 'items'>, item: WorkItemSummary) => {
    const existing = map.get(id) ?? { id, ...make(), items: [] };
    existing.items.push(item);
    map.set(id, existing);
  };

  for (const item of items) {
    switch (group) {
      case 'status': {
        const s = ctx.statuses.get(item.statusId);
        add(item.statusId, () => ({ label: s?.name ?? '?', color: s?.color }), item);
        break;
      }
      case 'priority':
        add(
          item.priority,
          () => ({ label: item.priority, labelKey: `priority.${item.priority}` }),
          item,
        );
        break;
      case 'type':
        add(item.type, () => ({ label: item.type, labelKey: `workItemType.${item.type}` }), item);
        break;
      case 'due': {
        const bucket = dueBucket(item, categoryOf(item, ctx), ctx.today);
        add(bucket, () => ({ label: bucket, labelKey: `groups.due.${bucket}` }), item);
        break;
      }
      case 'assignee':
        if (item.assignees.length === 0) {
          add(UNASSIGNED, () => ({ label: '', labelKey: 'detail.unassigned' }), item);
        }
        for (const a of item.assignees) add(a.id, () => ({ label: a.name }), item);
        break;
    }
  }

  const groups = [...map.values()];
  const rank = (g: ItemGroup): number | string => {
    switch (group) {
      case 'status':
        return ctx.statuses.get(g.id)?.order ?? 999;
      case 'priority':
        return PRIORITY_ORDER.get(g.id as Priority) ?? 999;
      case 'type':
        return WORK_ITEM_TYPES.indexOf(g.id as WorkItemType);
      case 'due':
        return DUE_ORDER.indexOf(g.id as DueBucket);
      case 'assignee':
        return g.id === UNASSIGNED ? '￿' : g.label;
      default:
        return 0;
    }
  };
  return groups.sort((a, b) => {
    const x = rank(a);
    const y = rank(b);
    return typeof x === 'number' && typeof y === 'number'
      ? x - y
      : collator.compare(String(x), String(y));
  });
}

export type ViewRow =
  | { kind: 'group'; id: string; group: ItemGroup; collapsed: boolean }
  | { kind: 'item'; key: string; item: WorkItemSummary; depth: number; children: number };

/** Süzgeç, sıralama veya gruplama açık mı (açıksa hiyerarşi yerine düz liste gösterilir, ADR-052). */
export const isFlatView = (search: ViewSearch): boolean =>
  !!(
    search.q?.trim() ||
    search.status?.length ||
    search.priority?.length ||
    search.type?.length ||
    search.assignee?.length ||
    search.label?.length ||
    search.due ||
    (search.sort && search.sort !== 'manual') ||
    (search.group && search.group !== 'none')
  );

export const activeFilterCount = (search: ViewSearch): number =>
  [
    search.q?.trim(),
    search.status?.length,
    search.priority?.length,
    search.type?.length,
    search.assignee?.length,
    search.label?.length,
    search.due,
  ].filter(Boolean).length;
