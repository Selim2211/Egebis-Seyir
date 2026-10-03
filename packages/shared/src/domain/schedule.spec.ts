import { describe, expect, it } from 'vitest';
import { analyzeSchedule, durationDays, shiftSpan } from './schedule';

const node = (id: string, startDate: string | null, dueDate: string | null) => ({
  id,
  startDate,
  dueDate,
});

describe('durationDays', () => {
  it('bitiş dahil gün sayısı; tarih eksikse 1', () => {
    expect(durationDays(node('a', '2026-10-05', '2026-10-09'))).toBe(5);
    expect(durationDays(node('a', '2026-10-05', '2026-10-05'))).toBe(1);
    expect(durationDays(node('a', null, '2026-10-09'))).toBe(1);
    expect(durationDays(node('a', '2026-10-09', '2026-10-05'))).toBe(1);
  });
});

describe('analyzeSchedule', () => {
  it('bağımlılık yoksa kritik yol yok', () => {
    const result = analyzeSchedule([node('a', '2026-10-05', '2026-10-06')], []);
    expect(result).toEqual({ hasCycle: false, criticalPath: [], criticalDays: 0, violations: [] });
  });

  it('en uzun zinciri bulur', () => {
    // a(3) → b(2) → d(4)  = 9 gün;  a(3) → c(1) → d(4) = 8 gün
    const nodes = [
      node('a', '2026-10-05', '2026-10-07'),
      node('b', '2026-10-08', '2026-10-09'),
      node('c', '2026-10-08', '2026-10-08'),
      node('d', '2026-10-12', '2026-10-15'),
    ];
    const result = analyzeSchedule(nodes, [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ]);
    expect(result.criticalPath).toEqual(['a', 'b', 'd']);
    expect(result.criticalDays).toBe(9);
    expect(result.violations).toEqual([]);
  });

  it('öncülü bitmeden başlayan ardılı çakışma sayar', () => {
    const result = analyzeSchedule(
      [node('a', '2026-10-05', '2026-10-09'), node('b', '2026-10-09', '2026-10-12')],
      [{ from: 'a', to: 'b' }],
    );
    expect(result.violations).toEqual([{ from: 'a', to: 'b' }]);
    expect(result.criticalPath).toEqual(['a', 'b']);
  });

  it('ertesi gün başlayan ardıl çakışma değildir', () => {
    const result = analyzeSchedule(
      [node('a', '2026-10-05', '2026-10-09'), node('b', '2026-10-10', '2026-10-12')],
      [{ from: 'a', to: 'b' }],
    );
    expect(result.violations).toEqual([]);
  });

  it('döngüyü tanır', () => {
    const result = analyzeSchedule(
      [node('a', null, null), node('b', null, null)],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );
    expect(result).toMatchObject({ hasCycle: true, criticalPath: [] });
  });

  it('bilinmeyen düğüme giden ve kendine kenarları yok sayar', () => {
    const result = analyzeSchedule(
      [node('a', '2026-10-05', '2026-10-06')],
      [
        { from: 'a', to: 'x' },
        { from: 'a', to: 'a' },
      ],
    );
    expect(result.criticalPath).toEqual([]);
  });
});

describe('shiftSpan', () => {
  it('iki tarihi kaydırır, boşu korur', () => {
    expect(shiftSpan({ startDate: '2026-10-05', dueDate: '2026-10-07' }, 3)).toEqual({
      startDate: '2026-10-08',
      dueDate: '2026-10-10',
    });
    expect(shiftSpan({ startDate: null, dueDate: '2026-10-07' }, -2)).toEqual({
      startDate: null,
      dueDate: '2026-10-05',
    });
  });
});
