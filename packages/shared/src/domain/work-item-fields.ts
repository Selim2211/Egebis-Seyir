import type { WorkItemType } from '../constants/work-item';
import { SIMPLE_MODE_TYPES } from '../constants/work-item';
import { ERROR_CODES } from '../errors/codes';

const BUG_FIELDS = [
  'severity',
  'stepsToReproduce',
  'expectedResult',
  'actualResult',
  'environment',
  'foundInVersion',
] as const;
const EPIC_FIELDS = ['goal', 'tshirtSize', 'color'] as const;

export type FieldsCheck =
  { ok: true } | { ok: false; code: typeof ERROR_CODES.WORK_ITEM_FIELD_NOT_ALLOWED };

/**
 * Tipe özel alanlar (ADR-044): Bug alanları yalnızca Bug'da, Epic alanları yalnızca Epic'te
 * dolu olabilir. `null` ve `undefined` "boş" sayılır (alanı temizlemek her tipte serbest).
 */
export function checkTypeFields(
  type: WorkItemType,
  fields: Readonly<Record<string, unknown>>,
): FieldsCheck {
  const forbidden = [
    ...(type === 'BUG' ? [] : BUG_FIELDS),
    ...(type === 'EPIC' ? [] : EPIC_FIELDS),
  ];
  const violated = forbidden.some((name) => fields[name] != null);
  return violated ? { ok: false, code: ERROR_CODES.WORK_ITEM_FIELD_NOT_ALLOWED } : { ok: true };
}

export type TypeInSpaceCheck =
  { ok: true } | { ok: false; code: typeof ERROR_CODES.WORK_ITEM_TYPE_NOT_ALLOWED };

/** Basit liste modundaki Space'lerde Epic ve Story kullanılamaz (ADR-044). */
export function checkTypeInSpace(type: WorkItemType, scrumEnabled: boolean): TypeInSpaceCheck {
  return scrumEnabled || SIMPLE_MODE_TYPES.includes(type)
    ? { ok: true }
    : { ok: false, code: ERROR_CODES.WORK_ITEM_TYPE_NOT_ALLOWED };
}
