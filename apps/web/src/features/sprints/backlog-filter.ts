import type { WorkItemRow } from '@scrum/shared';

export interface BacklogFilter {
  q: string;
  /** '' = hepsi, 'none' = Epic'siz, aksi halde Epic id'si. */
  epic: string;
  /** Yalnızca puanı girilmemiş Story/Bug (brief §5.5). */
  unestimated: boolean;
}

export const NO_FILTER: BacklogFilter = { q: '', epic: '', unestimated: false };

export const isFiltered = (f: BacklogFilter): boolean =>
  f.q.trim() !== '' || f.epic !== '' || f.unestimated;

/** Puan bekleyen öğe: Story ve Bug puanla tahmin edilir, Task saatle (brief §6.2.4). */
export const isUnestimated = (item: Pick<WorkItemRow, 'type' | 'points'>): boolean =>
  (item.type === 'STORY' || item.type === 'BUG') && item.points === null;

/** İstemci tarafı süzme; sıra korunur. */
export function filterBacklog(items: WorkItemRow[], filter: BacklogFilter): WorkItemRow[] {
  const q = filter.q.trim().toLocaleLowerCase('tr');
  return items.filter((item) => {
    if (
      q &&
      !item.title.toLocaleLowerCase('tr').includes(q) &&
      !item.key.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (filter.epic === 'none' && item.parentId !== null) return false;
    if (filter.epic !== '' && filter.epic !== 'none' && item.parentId !== filter.epic) return false;
    if (filter.unestimated && !isUnestimated(item)) return false;
    return true;
  });
}
