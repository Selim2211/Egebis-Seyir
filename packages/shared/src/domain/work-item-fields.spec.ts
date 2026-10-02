import { describe, expect, it } from 'vitest';
import { WORK_ITEM_TYPES } from '../constants/work-item';
import { checkTypeFields, checkTypeInSpace } from './work-item-fields';

describe('tipe özel alanlar (ADR-044)', () => {
  it("Bug alanları yalnızca Bug'da dolu olabilir", () => {
    for (const type of WORK_ITEM_TYPES) {
      expect(checkTypeFields(type, { severity: 'MAJOR' }).ok).toBe(type === 'BUG');
      expect(checkTypeFields(type, { stepsToReproduce: '1. Aç' }).ok).toBe(type === 'BUG');
    }
  });

  it("Epic alanları yalnızca Epic'te dolu olabilir", () => {
    for (const type of WORK_ITEM_TYPES) {
      expect(checkTypeFields(type, { goal: 'Hedef' }).ok).toBe(type === 'EPIC');
      expect(checkTypeFields(type, { tshirtSize: 'L', color: '#7C3AED' }).ok).toBe(type === 'EPIC');
    }
  });

  it('boş değerler (null/undefined) her tipte geçerli', () => {
    for (const type of WORK_ITEM_TYPES) {
      expect(checkTypeFields(type, { severity: null, goal: undefined })).toEqual({ ok: true });
    }
  });
});

describe('Space çalışma modu (ADR-044)', () => {
  it('Scrum modunda tüm tipler serbest', () => {
    for (const type of WORK_ITEM_TYPES) expect(checkTypeInSpace(type, true).ok).toBe(true);
  });

  it('basit listede Epic ve Story yok', () => {
    expect(checkTypeInSpace('EPIC', false)).toEqual({
      ok: false,
      code: 'WORK_ITEM_TYPE_NOT_ALLOWED',
    });
    expect(checkTypeInSpace('STORY', false).ok).toBe(false);
    for (const type of ['TASK', 'SUBTASK', 'BUG'] as const) {
      expect(checkTypeInSpace(type, false).ok).toBe(true);
    }
  });
});
