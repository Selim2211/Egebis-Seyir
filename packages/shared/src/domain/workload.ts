import { addDays } from './reports';

export interface WorkloadItem {
  id: string;
  points: number | null;
  estimateHours: number | null;
  dueDate: string | null;
  assigneeIds: readonly string[];
}

export interface WorkloadRow {
  /** null = kimseye atanmamış işler. */
  userId: string | null;
  itemCount: number;
  /** Atananlar arasında eşit paylaştırılmış puan. */
  points: number;
  /** Kalan tahmin: (saat tahmini − harcanan) öğe başına en az 0; atananlar arasında eşit paylaşılır. */
  remainingMinutes: number;
  overdue: number;
  /** Bugünden itibaren 7 gün içinde (bugün dahil) bitmesi gerekenler. */
  dueSoon: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Kişi bazlı iş yükü (brief §14 Faz 4). Girdi yalnızca **açık** (Done olmayan) işlerdir.
 * Birden çok kişiye atanmış iş her kişinin sayısına tam girer; puan ve kalan süre eşit bölünür.
 * Atanmamış işler `userId: null` satırında toplanır. Satırlar kalan süre, puan ve adede göre azalan.
 */
export function buildWorkload(
  items: readonly WorkloadItem[],
  loggedMinutesByItem: ReadonlyMap<string, number>,
  today: string,
): WorkloadRow[] {
  const soonEnd = addDays(today, 7);
  const rows = new Map<string | null, WorkloadRow>();
  const row = (userId: string | null): WorkloadRow => {
    let existing = rows.get(userId);
    if (!existing) {
      existing = { userId, itemCount: 0, points: 0, remainingMinutes: 0, overdue: 0, dueSoon: 0 };
      rows.set(userId, existing);
    }
    return existing;
  };

  for (const item of items) {
    const owners: Array<string | null> =
      item.assigneeIds.length > 0 ? [...item.assigneeIds] : [null];
    const share = 1 / owners.length;
    const remaining =
      item.estimateHours === null
        ? 0
        : Math.max(0, item.estimateHours * 60 - (loggedMinutesByItem.get(item.id) ?? 0));
    for (const owner of owners) {
      const r = row(owner);
      r.itemCount += 1;
      r.points += (item.points ?? 0) * share;
      r.remainingMinutes += remaining * share;
      if (item.dueDate !== null) {
        if (item.dueDate < today) r.overdue += 1;
        else if (item.dueDate < soonEnd) r.dueSoon += 1;
      }
    }
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      points: round1(r.points),
      remainingMinutes: Math.round(r.remainingMinutes),
    }))
    .sort(
      (a, b) =>
        b.remainingMinutes - a.remainingMinutes ||
        b.points - a.points ||
        b.itemCount - a.itemCount ||
        (a.userId === null ? 1 : b.userId === null ? -1 : 0),
    );
}
