import { describe, expect, it } from 'vitest';
import { dayKey } from './analytics-util';

/** Yavaş ama referans: Intl ile Europe/Istanbul günü. */
const reference = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

describe('dayKey (hızlı sabit +03:00)', () => {
  it('2017–2035 arası her gün sınırında Intl ile aynı sonucu verir', () => {
    // 2016 sonrası Türkiye kalıcı +03:00; gün sınırları (21:00 UTC) ve çevresi taranır.
    const start = Date.UTC(2017, 0, 1);
    const end = Date.UTC(2035, 11, 31);
    for (let t = start; t < end; t += 6 * 3_600_000 + 17 * 60_000) {
      const d = new Date(t);
      expect(dayKey(d), d.toISOString()).toBe(reference(d));
    }
    for (const iso of [
      '2026-11-13T20:59:59.999Z',
      '2026-11-13T21:00:00.000Z',
      '2026-12-31T21:00:00Z',
      '2028-02-29T20:59:59Z',
    ]) {
      expect(dayKey(new Date(iso))).toBe(reference(new Date(iso)));
    }
  });
});
