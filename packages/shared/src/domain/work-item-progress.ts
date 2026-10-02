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
