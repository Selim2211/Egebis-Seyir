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
