/** Board sütunundaki WIP limiti durumu (brief §5.8, ADR-080). Limit yalnızca uyarır, engellemez. */
export type WipState = 'none' | 'ok' | 'full' | 'over';

/** Limit yoksa `none`; sayı limite ulaştıysa `full` (yeni iş limiti aşar); aştıysa `over`. */
export function wipState(count: number, limit: number | null | undefined): WipState {
  if (limit === null || limit === undefined) return 'none';
  if (count > limit) return 'over';
  if (count === limit) return 'full';
  return 'ok';
}
