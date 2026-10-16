import { describe, expect, it } from 'vitest';
import {
  averageVelocity,
  checkSprintDates,
  sprintDays,
  sprintAssigneeBreakdown,
  sprintEligibility,
  sprintMoveReason,
  sprintTotals,
} from './sprint';

describe('sprintEligibility (ADR-061)', () => {
  const base = { type: 'TASK', parentType: null, category: 'NOT_STARTED' } as const;

  it('üst düzey Task ve Bug girer; Epic altındakiler de', () => {
    expect(sprintEligibility(base)).toBeNull();
    expect(sprintEligibility({ ...base, type: 'BUG' })).toBeNull();
    expect(sprintEligibility({ ...base, parentType: 'EPIC' })).toBeNull();
  });

  it('Epic ve Sub-task girmez', () => {
    expect(sprintEligibility({ ...base, type: 'EPIC' })).toBe('TYPE');
    expect(sprintEligibility({ ...base, type: 'SUBTASK', parentType: 'TASK' })).toBe('TYPE');
  });

  it("Task'ın altındaki Bug üstünü izler, ayrı girmez", () => {
    expect(sprintEligibility({ ...base, type: 'BUG', parentType: 'TASK' })).toBe('NESTED');
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
  it('puanları, biteni ve tahminsiz Task/Bug sayısını toplar', () => {
    const totals = sprintTotals([
      { type: 'TASK', points: 5, category: 'DONE' },
      { type: 'TASK', points: 3, category: 'ACTIVE' },
      { type: 'BUG', points: null, category: 'NOT_STARTED' },
      { type: 'EPIC', points: null, category: 'NOT_STARTED' }, // Epic tahminsiz sayılmaz
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

describe('averageVelocity', () => {
  const done = (endDate: string, completedPoints: number | null) => ({
    status: 'COMPLETED' as const,
    endDate,
    completedPoints,
  });

  it("son üç tamamlanmış sprint'in ortalaması", () => {
    const sprints = [
      done('2026-07-01', 100), // pencere dışı
      done('2026-08-01', 20),
      done('2026-09-01', 25),
      done('2026-10-01', 30),
    ];
    expect(averageVelocity(sprints)).toBe(25);
  });

  it("tamamlanmamış ve puansız sprint'ler sayılmaz; hiç yoksa null", () => {
    expect(averageVelocity([])).toBeNull();
    expect(
      averageVelocity([
        { status: 'ACTIVE', endDate: '2026-10-01', completedPoints: null },
        { status: 'CANCELLED', endDate: '2026-09-01', completedPoints: 4 },
        done('2026-08-01', null),
      ]),
    ).toBeNull();
  });

  it('bir ondalığa yuvarlar', () => {
    expect(averageVelocity([done('2026-09-01', 7), done('2026-10-01', 8)])).toBe(7.5);
  });
});

describe('sprintAssigneeBreakdown (ADR-107)', () => {
  const ayse = { id: 'a', name: 'Ayşe' };
  const can = { id: 'c', name: 'Can' };

  it('puanı kişilere dağıtır; çok kişili işin puanı eşit bölünür, atanmamış sonda', () => {
    const rows = sprintAssigneeBreakdown([
      { points: 8, percentDone: 50, category: 'ACTIVE', assignees: [ayse] },
      { points: 5, percentDone: null, category: 'DONE', assignees: [ayse, can] },
      { points: 3, percentDone: null, category: 'NOT_STARTED', assignees: [] },
    ]);
    expect(rows.map((r) => [r.userId, r.points, r.donePoints, r.percentDone])).toEqual([
      ['a', 10.5, 2.5, 62],
      ['c', 2.5, 2.5, 100],
      [null, 3, 0, 0],
    ]);
    const total = rows.reduce((sum, r) => sum + r.points, 0);
    expect(total).toBe(16);
  });
});
