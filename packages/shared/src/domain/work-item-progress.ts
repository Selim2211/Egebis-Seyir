import type { StatusCategory } from '../constants/work-item';

/**
 * Epic ilerlemesi, 0–100 (brief §6.2.3): altındaki öğelerin point ağırlıklı tamamlanma oranı;
 * hiçbirinde point yoksa adet bazlı. Alt öğe yoksa 0.
 */
export function epicProgress(
  children: ReadonlyArray<{ points: number | null; category: StatusCategory }>,
): number {
  if (children.length === 0) return 0;
  const estimated = children.filter((c) => c.points != null && c.points > 0);
  const [done, total] =
    estimated.length > 0
      ? [
          estimated.filter((c) => c.category === 'DONE').reduce((s, c) => s + c.points!, 0),
          estimated.reduce((s, c) => s + c.points!, 0),
        ]
      : [children.filter((c) => c.category === 'DONE').length, children.length];
  return Math.round((done / total) * 100);
}

/** Tamamlanma tarihi kuralı (brief §6.2.5): DONE'a girerken yazılır, çıkınca silinir. */
export function nextCompletedAt(
  from: StatusCategory,
  to: StatusCategory,
  current: Date | null,
  now: Date,
): Date | null {
  if (to === 'DONE') return from === 'DONE' && current ? current : now;
  return null;
}

export interface EpicStats {
  points: number;
  donePoints: number;
  itemCount: number;
  doneCount: number;
  activeCount: number;
  /** Puanı girilmemiş alt öğe sayısı (ilerleme adet bazına düşmesin diye görünür kılınır). */
  unestimatedCount: number;
}

/** Epic özeti: doğrudan alt öğelerin (Story/Task/Bug) puan ve adet toplamları (brief §5.7). */
export function epicStats(
  children: ReadonlyArray<{ points: number | null; category: StatusCategory }>,
): EpicStats {
  const stats: EpicStats = {
    points: 0,
    donePoints: 0,
    itemCount: children.length,
    doneCount: 0,
    activeCount: 0,
    unestimatedCount: 0,
  };
  for (const child of children) {
    const points = child.points ?? 0;
    stats.points += points;
    if (child.category === 'DONE') {
      stats.doneCount += 1;
      stats.donePoints += points;
    } else if (child.category === 'ACTIVE') {
      stats.activeCount += 1;
    }
    if (child.points == null) stats.unestimatedCount += 1;
  }
  return stats;
}

/** Kullanıcının girdiği yüzde sınırları (ADR-107). */
export const PERCENT_DONE = { min: 0, max: 100, step: 5 } as const;

export interface PercentInput {
  points: number | null;
  percentDone: number | null;
  category: StatusCategory;
}

/** Tek öğenin etkin yüzdesi: Done → 100, aksi halde girilen yüzde (yoksa 0). */
export function ownPercent(item: Pick<PercentInput, 'percentDone' | 'category'>): number {
  return item.category === 'DONE' ? 100 : (item.percentDone ?? 0);
}

/**
 * Puan ağırlıklı ortalama yüzde (0–100). Hiçbirinde puan yoksa her öğe eşit ağırlıktadır. Öğe yoksa 0.
 * Alt öğeli görev için alt öğelerle, sprint için üst düzey öğelerle çağrılır (ADR-107).
 */
export function weightedPercent(items: ReadonlyArray<PercentInput>): number {
  if (items.length === 0) return 0;
  const weighted = items.some((i) => (i.points ?? 0) > 0);
  let total = 0;
  let done = 0;
  for (const item of items) {
    const weight = weighted ? (item.points ?? 0) : 1;
    total += weight;
    done += weight * ownPercent(item);
  }
  return total === 0 ? 0 : Math.round(done / total);
}
