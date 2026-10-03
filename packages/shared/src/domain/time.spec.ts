import { describe, expect, it } from 'vitest';
import { buildTimesheet, formatMinutes, parseDuration, timerMinutes } from './time';

describe('parseDuration', () => {
  it.each([
    ['90', 90],
    ['45m', 45],
    ['1h', 60],
    ['1.5h', 90],
    ['1,5s', 90],
    ['1h 30m', 90],
    ['1s 30dk', 90],
    ['2saat', 120],
    ['1:30', 90],
    ['0:45', 45],
    ['  2h  ', 120],
  ])('%s → %i dk', (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it.each(['', 'abc', '0', '0m', '25h', '1441', '1h 30', '-5', '1:75'])('%s geçersiz', (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('saat ve dakikayı yazar', () => {
    expect(formatMinutes(90)).toBe('1s 30dk');
    expect(formatMinutes(45, 'en')).toBe('45m');
    expect(formatMinutes(120, 'en')).toBe('2h');
    expect(formatMinutes(0)).toBe('0');
  });
});

describe('timerMinutes', () => {
  const start = new Date('2026-10-05T09:00:00Z');
  it('yukarı yuvarlar, en az 1 dk', () => {
    expect(timerMinutes(start, new Date('2026-10-05T09:00:05Z'))).toBe(1);
    expect(timerMinutes(start, new Date('2026-10-05T09:01:01Z'))).toBe(2);
    expect(timerMinutes(start, new Date('2026-10-05T10:30:00Z'))).toBe(90);
  });

  it('bir günle sınırlar; saat geriye giderse 1 dk', () => {
    expect(timerMinutes(start, new Date('2026-10-09T09:00:00Z'))).toBe(1440);
    expect(timerMinutes(start, new Date('2026-10-05T08:00:00Z'))).toBe(1);
  });
});

describe('buildTimesheet', () => {
  it('kişi × gün toplar, aralık dışını atar, toplama göre sıralar', () => {
    const sheet = buildTimesheet(
      [
        { userId: 'a', day: '2026-10-05', minutes: 60 },
        { userId: 'a', day: '2026-10-05', minutes: 30 },
        { userId: 'b', day: '2026-10-06', minutes: 120 },
        { userId: 'b', day: '2026-10-20', minutes: 999 },
      ],
      '2026-10-05',
      '2026-10-07',
    );
    expect(sheet.days).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(sheet.rows.map((r) => r.userId)).toEqual(['b', 'a']);
    expect(sheet.rows[1]).toEqual({ userId: 'a', perDay: [90, 0, 0], total: 90 });
    expect(sheet.dayTotals).toEqual([90, 120, 0]);
    expect(sheet.total).toBe(210);
  });
});
