import { ERROR_CODES } from '../errors/codes';
import type { StatusCategory } from '../constants/work-item';

/** Bir Space'te en çok kaç etkin durum olabilir (ADR-081). */
export const MAX_STATUSES = 20;

export type WorkflowCheck =
  | { ok: true }
  | {
      ok: false;
      code: typeof ERROR_CODES.STATUS_WORKFLOW_INVALID | typeof ERROR_CODES.STATUS_LIMIT;
    };

/**
 * Durum akışı kuralı (sıralı etkin durumlar): en az bir Done ve bir Done-dışı durum olmalı;
 * yeni işler ilk durumda başladığı için ilk durum Done olamaz.
 */
export function checkWorkflow(
  statuses: ReadonlyArray<{ category: StatusCategory }>,
): WorkflowCheck {
  if (statuses.length > MAX_STATUSES) return { ok: false, code: ERROR_CODES.STATUS_LIMIT };
  const hasDone = statuses.some((s) => s.category === 'DONE');
  const hasOpen = statuses.some((s) => s.category !== 'DONE');
  if (!hasDone || !hasOpen || statuses[0]?.category === 'DONE') {
    return { ok: false, code: ERROR_CODES.STATUS_WORKFLOW_INVALID };
  }
  return { ok: true };
}
