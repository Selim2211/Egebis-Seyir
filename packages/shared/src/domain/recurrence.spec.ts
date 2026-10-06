import { describe, expect, it } from 'vitest';
import { addMonths, nextOccurrence, nextSchedule } from './recurrence';

describe('tekrarlayan görev tarihleri (Faz 7.1)', () => {
  it('günlük, haftalık, aylık ve yıllık bir sonraki tarih', () => {
    expect(nextOccurrence('2026-10-06', { freq: 'DAILY', interval: 3 })).toBe('2026-10-09');
    expect(nextOccurrence('2026-10-06', { freq: 'WEEKLY', interval: 2 })).toBe('2026-10-20');
    expect(nextOccurrence('2026-10-06', { freq: 'MONTHLY', interval: 1 })).toBe('2026-11-06');
    expect(nextOccurrence('2026-10-06', { freq: 'YEARLY', interval: 1 })).toBe('2027-10-06');
  });

  it('ay sonu: hedef ayda gün yoksa ayın son gününe oturur; yıl sınırı aşılır', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // artık yıl
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(nextOccurrence('2028-02-29', { freq: 'YEARLY', interval: 1 })).toBe('2029-02-28');
  });

  it('yeni örnek bitişi kayar, başlangıç süreyi korur', () => {
    expect(
      nextSchedule(
        { startDate: '2026-10-05', dueDate: '2026-10-07' },
        { freq: 'WEEKLY', interval: 1 },
        '2026-10-07',
      ),
    ).toEqual({ startDate: '2026-10-12', dueDate: '2026-10-14' });
    expect(
      nextSchedule(
        { startDate: null, dueDate: '2026-10-07' },
        { freq: 'DAILY', interval: 1 },
        '2026-10-07',
      ),
    ).toEqual({ startDate: null, dueDate: '2026-10-08' });
  });

  it('geç kapatılan görev geçmişte doğmaz', () => {
    expect(
      nextSchedule(
        { startDate: null, dueDate: '2026-09-01' },
        { freq: 'WEEKLY', interval: 1 },
        '2026-10-06',
      ).dueDate,
    ).toBe('2026-10-06');
    expect(
      nextSchedule(
        { startDate: null, dueDate: '2026-09-01' },
        { freq: 'WEEKLY', interval: 1 },
        '2026-10-07',
      ).dueDate,
    ).toBe('2026-10-13');
  });
});
