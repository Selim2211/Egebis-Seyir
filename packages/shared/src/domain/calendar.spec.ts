import { describe, expect, it } from 'vitest';
import { calendarWeeks, daysCovered, moveItemDates, shiftMonth, weekdayIndex } from './calendar';

describe('takvim ızgarası', () => {
  it('Pazartesi başlar', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // Pazartesi
    expect(weekdayIndex('2026-10-04')).toBe(6); // Pazar
  });

  it('ekim 2026: 5 hafta, ilk hafta eylül günleriyle başlar', () => {
    const weeks = calendarWeeks('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]![0]).toEqual({ day: '2026-09-28', inMonth: false });
    expect(weeks[0]![3]).toEqual({ day: '2026-10-01', inMonth: true });
    expect(weeks.at(-1)![6]!.day).toBe('2026-11-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('ayın ilk günü Pazartesi ise önceki aydan gün eklenmez', () => {
    const weeks = calendarWeeks('2026-06'); // 1 Haziran 2026 Pazartesi
    expect(weeks[0]![0]).toEqual({ day: '2026-06-01', inMonth: true });
  });

  it('ay kaydırma yıl sınırını geçer', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(shiftMonth('2026-10', -3)).toBe('2026-07');
  });
});

describe('daysCovered', () => {
  it('aralık, tek tarih ve tarihsiz', () => {
    expect(daysCovered({ startDate: '2026-10-05', dueDate: '2026-10-07' })).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    expect(daysCovered({ startDate: null, dueDate: '2026-10-09' })).toEqual(['2026-10-09']);
    expect(daysCovered({ startDate: '2026-10-09', dueDate: null })).toEqual(['2026-10-09']);
    expect(daysCovered({ startDate: null, dueDate: null })).toEqual([]);
  });
});

describe('moveItemDates', () => {
  it('süreyi koruyarak kaydırır', () => {
    expect(
      moveItemDates({ startDate: '2026-10-05', dueDate: '2026-10-07' }, '2026-10-06', '2026-10-13'),
    ).toEqual({ startDate: '2026-10-12', dueDate: '2026-10-14' });
  });

  it('yalnızca bitiş varsa onu taşır; geriye de kayar', () => {
    expect(
      moveItemDates({ startDate: null, dueDate: '2026-10-10' }, '2026-10-10', '2026-10-03'),
    ).toEqual({ startDate: null, dueDate: '2026-10-03' });
  });
});
