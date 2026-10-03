import { describe, expect, it } from 'vitest';
import {
  barPlacement,
  daysBetween,
  nextMonthStart,
  timelineMonths,
  timelineRange,
  todayPosition,
} from './timeline';

describe('gün ve ay yardımcıları', () => {
  it('gün farkı ve ay başı', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(nextMonthStart('2026-12-15')).toBe('2027-01-01');
    expect(nextMonthStart('2026-10-31')).toBe('2026-11-01');
  });
});

describe('timelineRange', () => {
  it('tarih yoksa bugünün ayından başlayarak en az 4 ay', () => {
    const range = timelineRange([], '2026-10-15');
    expect(range).toMatchObject({ start: '2026-10-01', end: '2027-02-01' });
    expect(range.days).toBe(123);
  });

  it('geçmiş ve gelecek tarihleri kapsar', () => {
    const range = timelineRange([{ startDate: '2026-08-20', dueDate: '2027-04-10' }], '2026-10-15');
    expect(range.start).toBe('2026-08-01');
    expect(range.end).toBe('2027-05-01');
  });

  it('ek günleri (sprint) de kapsar', () => {
    const range = timelineRange([], '2026-10-15', ['2026-07-03']);
    expect(range.start).toBe('2026-07-01');
  });
});

describe('timelineMonths', () => {
  it('ay sütunları ekseni tam kaplar', () => {
    const range = timelineRange([], '2026-10-15');
    const months = timelineMonths(range);
    expect(months.map((m) => m.key)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(months.reduce((sum, m) => sum + m.width, 0)).toBeCloseTo(100);
    expect(months[0]!.left).toBe(0);
  });
});

describe('barPlacement', () => {
  const range = timelineRange([], '2026-10-15'); // 2026-10-01 → 2027-02-01
  it('başlangıç ve bitiş bitiş günü dahil aralık verir', () => {
    const bar = barPlacement(range, { startDate: '2026-10-01', dueDate: '2026-10-31' })!;
    expect(bar.marker).toBe(false);
    expect(bar.left).toBe(0);
    expect(bar.width).toBeCloseTo((31 / range.days) * 100);
  });

  it('tek tarih işaret olur, tarihsiz null', () => {
    const marker = barPlacement(range, { startDate: null, dueDate: '2026-11-10' })!;
    expect(marker.marker).toBe(true);
    expect(marker.width).toBeCloseTo((1 / range.days) * 100);
    expect(barPlacement(range, { startDate: null, dueDate: null })).toBeNull();
  });

  it('aralık dışına taşan kısım kırpılır; tamamen dışarıdaysa null', () => {
    const clipped = barPlacement(range, { startDate: '2026-09-01', dueDate: '2026-10-10' })!;
    expect(clipped.left).toBe(0);
    expect(clipped.width).toBeCloseTo((10 / range.days) * 100);
    expect(barPlacement(range, { startDate: '2025-01-01', dueDate: '2025-02-01' })).toBeNull();
  });
});

describe('todayPosition', () => {
  const range = timelineRange([], '2026-10-15');
  it('aralık içinde yüzde, dışında null', () => {
    expect(todayPosition(range, '2026-10-01')).toBeCloseTo((0.5 / range.days) * 100);
    expect(todayPosition(range, '2026-09-30')).toBeNull();
    expect(todayPosition(range, '2027-02-01')).toBeNull();
  });
});
