import { PRIORITIES, type WorkItemSummary } from '@scrum/shared';

/** Board satır gruplaması (brief §5.9). */
export const SWIMLANES = ['none', 'assignee', 'epic', 'priority'] as const;
export type Swimlane = (typeof SWIMLANES)[number];

export interface BoardStatus {
  id: string;
  name: string;
  color: string;
  category: 'NOT_STARTED' | 'ACTIVE' | 'DONE';
}

export type LaneKind = 'all' | 'assignee' | 'unassigned' | 'epic' | 'noEpic' | 'priority';

export interface BoardLane<T> {
  id: string;
  kind: LaneKind;
  /** Kişi veya Epic adı. */
  title?: string;
  userId?: string;
  avatarVersion?: string | null;
  priority?: WorkItemSummary['priority'];
  /** Durum kimliği → o satırdaki kartlar (girdi sırası korunur). */
  cells: Map<string, T[]>;
  count: number;
}

/** Öğenin Epic'i: en yakın Epic atası, yoksa en üst atanın (listede olmayan) Epic üstü. */
export function epicOf(
  item: WorkItemSummary,
  byId: ReadonlyMap<string, WorkItemSummary>,
  epicTitles: ReadonlyMap<string, string>,
): string | null {
  let current = item;
  for (let depth = 0; depth < 8 && current.parentId; depth += 1) {
    const parent = byId.get(current.parentId);
    if (!parent) return epicTitles.has(current.parentId) ? current.parentId : null;
    if (parent.type === 'EPIC') return parent.id;
    current = parent;
  }
  return null;
}

/**
 * Board verisi: satırlar (swimlane) × durum sütunları. Durum sırası `statuses` sırasıdır;
 * boş satırlar gösterilmez ("none" hariç: boş Board da sütunlarını gösterir).
 */
export function buildBoard<T extends WorkItemSummary>(
  items: readonly T[],
  statuses: readonly BoardStatus[],
  swimlane: Swimlane,
  epicTitles: ReadonlyMap<string, string>,
): BoardLane<T>[] {
  const byId = new Map<string, WorkItemSummary>(items.map((i) => [i.id, i]));
  const lanes = new Map<string, BoardLane<T>>();

  const lane = (seed: Omit<BoardLane<T>, 'cells' | 'count'>): BoardLane<T> => {
    let found = lanes.get(seed.id);
    if (!found) {
      found = { ...seed, cells: new Map(statuses.map((s) => [s.id, []])), count: 0 };
      lanes.set(seed.id, found);
    }
    return found;
  };

  if (swimlane === 'none') lane({ id: 'all', kind: 'all' });

  for (const item of items) {
    let target: BoardLane<T>;
    if (swimlane === 'none') {
      target = lane({ id: 'all', kind: 'all' });
    } else if (swimlane === 'assignee') {
      const first = item.assignees[0];
      target = first
        ? lane({
            id: `u:${first.id}`,
            kind: 'assignee',
            title: first.name,
            userId: first.id,
            avatarVersion: first.avatarVersion,
          })
        : lane({ id: 'unassigned', kind: 'unassigned' });
    } else if (swimlane === 'epic') {
      const epic = epicOf(item, byId, epicTitles);
      target = epic
        ? lane({ id: `e:${epic}`, kind: 'epic', title: epicTitles.get(epic) ?? epic })
        : lane({ id: 'noEpic', kind: 'noEpic' });
    } else {
      target = lane({ id: `p:${item.priority}`, kind: 'priority', priority: item.priority });
    }
    // Bilinmeyen (silinmiş) durumdaki öğe ilk sütuna düşer; kart kaybolmaz.
    const cell = target.cells.get(item.statusId) ?? target.cells.get(statuses[0]?.id ?? '');
    cell?.push(item);
    target.count += 1;
  }

  const all = [...lanes.values()];
  const rank = (l: BoardLane<T>): number => {
    if (l.kind === 'priority') return PRIORITIES.indexOf(l.priority!);
    return l.kind === 'unassigned' || l.kind === 'noEpic' ? 1 : 0;
  };
  return all.sort(
    (a, b) => rank(a) - rank(b) || (a.title ?? '').localeCompare(b.title ?? '', 'tr'),
  );
}

export interface ColumnTotal {
  count: number;
  points: number;
}

/** Sütun başlığı için kart sayısı ve toplam puan (tüm satırlar). */
export function columnTotals<T extends WorkItemSummary>(
  lanes: readonly BoardLane<T>[],
  statusId: string,
): ColumnTotal {
  let count = 0;
  let points = 0;
  for (const lane of lanes) {
    for (const item of lane.cells.get(statusId) ?? []) {
      count += 1;
      points += item.points ?? 0;
    }
  }
  return { count, points };
}
