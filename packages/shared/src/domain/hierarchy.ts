import type { WorkItemType } from '../constants/work-item';
import { ERROR_CODES } from '../errors/codes';

/**
 * Bir iş öğesi tipinin bağlanabileceği üst tipler (brief §4.2, §6.2.1).
 * Boş liste = üst öğe alamaz.
 */
export const ALLOWED_PARENT_TYPES: Record<WorkItemType, readonly WorkItemType[]> = {
  EPIC: [],
  STORY: ['EPIC'],
  TASK: ['STORY'],
  SUBTASK: ['TASK', 'STORY', 'BUG'],
  BUG: ['STORY', 'EPIC'],
};

/** Üst öğesiz (bağımsız) var olamayan tipler. Sub-task her zaman bir üst öğeye bağlıdır. */
export const PARENT_REQUIRED_TYPES: readonly WorkItemType[] = ['SUBTASK'];

export type ParentCheckResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | typeof ERROR_CODES.WORK_ITEM_PARENT_REQUIRED
        | typeof ERROR_CODES.WORK_ITEM_PARENT_NOT_ALLOWED;
    };

/** `child` tipindeki öğenin `parent` tipine (veya üst öğesiz) bağlanıp bağlanamayacağını söyler. */
export function checkParent(child: WorkItemType, parent: WorkItemType | null): ParentCheckResult {
  if (parent === null) {
    return PARENT_REQUIRED_TYPES.includes(child)
      ? { ok: false, code: ERROR_CODES.WORK_ITEM_PARENT_REQUIRED }
      : { ok: true };
  }
  return ALLOWED_PARENT_TYPES[child].includes(parent)
    ? { ok: true }
    : { ok: false, code: ERROR_CODES.WORK_ITEM_PARENT_NOT_ALLOWED };
}

export type NestPlan =
  | { ok: true; type: WorkItemType }
  | { ok: false; code: typeof ERROR_CODES.WORK_ITEM_PARENT_NOT_ALLOWED };

/**
 * Bir öğe başka bir öğenin üzerine sürüklenince (ADR-102): tip kuralı izin veriyorsa olduğu gibi
 * alt öğe olur; izin vermiyorsa ve öğe alt öğesiz bir Task ise Sub-task'a dönüşür (Task → Task/Bug).
 * Üst öğenin tipi hiçbir zaman değişmez (hiyerarşi korunur).
 */
export function planNest(
  child: { type: WorkItemType; hasChildren: boolean },
  parentType: WorkItemType,
): NestPlan {
  if (checkParent(child.type, parentType).ok) return { ok: true, type: child.type };
  if (
    child.type === 'TASK' &&
    !child.hasChildren &&
    ALLOWED_PARENT_TYPES.SUBTASK.includes(parentType)
  ) {
    return { ok: true, type: 'SUBTASK' };
  }
  return { ok: false, code: ERROR_CODES.WORK_ITEM_PARENT_NOT_ALLOWED };
}
