import { describe, expect, it } from 'vitest';
import {
  checkSprintDates,
  sprintDays,
  sprintEligibility,
  sprintMoveReason,
  sprintTotals,
} from './sprint';

describe('sprintEligibility (ADR-061)', () => {
  const base = { type: 'STORY', parentType: null, category: 'NOT_STARTED' } as const;

  it('üst düzey Story, Bug ve Task girer; Epic altındakiler de', () => {
    expect(sprintEligibility(base)).toBeNull();
    expect(sprintEligibility({ ...base, type: 'BUG' })).toBeNull();
    expect(sprintEligibility({ ...base, type: 'TASK' })).toBeNull();
    expect(sprintEligibility({ ...base, parentType: 'EPIC' })).toBeNull();
  });

  it('Epic ve Sub-task girmez', () => {
    expect(sprintEligibility({ ...base, type: 'EPIC' })).toBe('TYPE');
    expect(sprintEligibility({ ...base, type: 'SUBTASK', parentType: 'TASK' })).toBe('TYPE');
  });

  it("Story'nin altındaki Task üstünü izler, ayrı girmez", () => {
    expect(sprintEligibility({ ...base, type: 'TASK', parentType: 'STORY' })).toBe('NESTED');
  });

  it('tamamlanmış öğe girmez', () => {
    expect(sprintEligibility({ ...base, category: 'DONE' })).toBe('DONE');
  });
});

describe('checkSprintDates', () => {
  it('gün sayımı iki ucu dahil eder', () => {
    expect(sprintDays('2026-10-05', '2026-10-05')).toBe(1);
    expect(sprintDays('2026-10-05', '2026-10-18')).toBe(14);
  });

  it('bitiş başlangıçtan önce olamaz', () => {
    expect(checkSprintDates('2026-10-05', '2026-10-04')).toBe('END_BEFORE_START');
    expect(checkSprintDates('2026-10-05', '2026-10-05')).toBeNull();
  });

  it('8 haftadan uzun olamaz', () => {
    expect(checkSprintDates('2026-10-01', '2026-11-25')).toBeNull(); // 56 gün
    expect(checkSprintDates('2026-10-01', '2026-11-26')).toBe('TOO_LONG');
  });
});

describe('sprintMoveReason', () => {
  it('aktif sprint scope change, planlı sprint planlama', () => {
    expect(sprintMoveReason('ACTIVE')).toBe('SCOPE_CHANGE');
    expect(sprintMoveReason('PLANNED')).toBe('PLANNED');
  });
});

describe('sprintTotals', () => {
  it('puanları, biteni ve tahminsiz Story/Bug sayısını toplar', () => {
    const totals = sprintTotals([
      { type: 'STORY', points: 5, category: 'DONE' },
      { type: 'STORY', points: 3, category: 'ACTIVE' },
      { type: 'BUG', points: null, category: 'NOT_STARTED' },
      { type: 'TASK', points: null, category: 'NOT_STARTED' }, // Task saat tahminli, vurgulanmaz
    ]);
    expect(totals).toEqual({
      itemCount: 4,
      points: 8,
      doneItemCount: 1,
      donePoints: 5,
      unestimatedCount: 1,
    });
  });

  it('boş liste sıfır döner', () => {
    expect(sprintTotals([]).points).toBe(0);
  });
});
