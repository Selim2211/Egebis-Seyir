import {
  type EstimationScale,
  FIBONACCI_SCALE,
  MAX_FREE_POINTS,
  TSHIRT_POINTS,
} from '../constants/estimation';
import type { WorkItemType } from '../constants/work-item';
import { ERROR_CODES } from '../errors/codes';

/** Hangi tip hangi tahmini taşır (ADR-045, brief §6.2.4). */
export const ESTIMATE_KIND: Record<WorkItemType, 'POINTS' | 'HOURS'> = {
  EPIC: 'POINTS',
  STORY: 'POINTS',
  BUG: 'POINTS',
  TASK: 'HOURS',
  SUBTASK: 'HOURS',
};

export type EstimateCheck =
  | { ok: true }
  | {
      ok: false;
      code:
        | typeof ERROR_CODES.WORK_ITEM_ESTIMATE_NOT_ALLOWED
        | typeof ERROR_CODES.WORK_ITEM_ESTIMATE_INVALID;
    };

const MAX_HOURS = 10_000;

export function isValidPoints(scale: EstimationScale, points: number): boolean {
  if (!Number.isFinite(points)) return false;
  switch (scale) {
    case 'FIBONACCI':
      return (FIBONACCI_SCALE as readonly number[]).includes(points);
    case 'TSHIRT':
      return Object.values(TSHIRT_POINTS).includes(points);
    case 'NUMBER':
      return points >= 0 && points <= MAX_FREE_POINTS;
  }
}

/**
 * Tip ve Space ölçeğine göre tahmin doğrular. `undefined`/`null` = girilmemiş (her zaman geçerli).
 */
export function checkEstimate(
  type: WorkItemType,
  scale: EstimationScale,
  estimate: { points?: number | null; estimateHours?: number | null },
): EstimateCheck {
  const { points, estimateHours } = estimate;
  const kind = ESTIMATE_KIND[type];
  if ((points != null && kind !== 'POINTS') || (estimateHours != null && kind !== 'HOURS')) {
    return { ok: false, code: ERROR_CODES.WORK_ITEM_ESTIMATE_NOT_ALLOWED };
  }
  if (points != null && !isValidPoints(scale, points)) {
    return { ok: false, code: ERROR_CODES.WORK_ITEM_ESTIMATE_INVALID };
  }
  if (estimateHours != null && !(estimateHours >= 0 && estimateHours <= MAX_HOURS)) {
    return { ok: false, code: ERROR_CODES.WORK_ITEM_ESTIMATE_INVALID };
  }
  return { ok: true };
}

/** Alt öğelerin saat toplamı; hiçbirinde saat yoksa null (rollup, brief §6.2.4). */
export function rollupHours(
  children: ReadonlyArray<{ estimateHours: number | null }>,
): number | null {
  const withHours = children.filter((c) => c.estimateHours != null);
  if (withHours.length === 0) return null;
  return withHours.reduce((sum, c) => sum + c.estimateHours!, 0);
}
