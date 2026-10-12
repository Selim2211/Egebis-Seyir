import { describe, expect, it } from 'vitest';
import { WORK_ITEM_TYPES } from '../constants/work-item';
import { checkEstimate, ESTIMATE_KIND, rollupHours } from './work-item-estimate';
import { formatItemKey, parseItemKey } from './work-item-key';
import { epicProgress, nextCompletedAt, ownPercent, weightedPercent } from './work-item-progress';

describe('tahmin kuralları (ADR-045, brief §6.2.4)', () => {
  it('Story Point her tipte girilir, saat yalnızca Task/Sub-task (ADR-107)', () => {
    for (const type of WORK_ITEM_TYPES) {
      const hours = ESTIMATE_KIND[type] === 'HOURS';
      expect(checkEstimate(type, 'FIBONACCI', { points: 3 }).ok).toBe(true);
      expect(checkEstimate(type, 'FIBONACCI', { estimateHours: 4 }).ok).toBe(hours);
    }
  });

  it('Fibonacci ölçeği tam olarak 1,2,3,5,8,13,21,34,55', () => {
    for (const n of [1, 2, 3, 5, 8, 13, 21, 34, 55]) {
      expect(checkEstimate('TASK', 'FIBONACCI', { points: n }).ok).toBe(true);
    }
    for (const n of [0, 4, 6, 20, 35, 89]) {
      expect(checkEstimate('TASK', 'FIBONACCI', { points: n }).ok).toBe(false);
    }
  });

  it('girilmemiş tahmin her tipte geçerli', () => {
    for (const type of WORK_ITEM_TYPES) {
      expect(checkEstimate(type, 'FIBONACCI', {})).toEqual({ ok: true });
      expect(checkEstimate(type, 'FIBONACCI', { points: null, estimateHours: null })).toEqual({
        ok: true,
      });
    }
  });

  it('puan ölçeğe uymalı', () => {
    expect(checkEstimate('STORY', 'FIBONACCI', { points: 8 }).ok).toBe(true);
    expect(checkEstimate('STORY', 'FIBONACCI', { points: 4 })).toEqual({
      ok: false,
      code: 'WORK_ITEM_ESTIMATE_INVALID',
    });
    expect(checkEstimate('STORY', 'TSHIRT', { points: 5 }).ok).toBe(true);
    expect(checkEstimate('STORY', 'TSHIRT', { points: 13 }).ok).toBe(false);
    expect(checkEstimate('STORY', 'NUMBER', { points: 0.5 }).ok).toBe(true);
    expect(checkEstimate('STORY', 'NUMBER', { points: 1001 }).ok).toBe(false);
    expect(checkEstimate('STORY', 'NUMBER', { points: Number.NaN }).ok).toBe(false);
  });

  it('saat negatif veya aşırı büyük olamaz', () => {
    expect(checkEstimate('TASK', 'FIBONACCI', { estimateHours: 0.5 }).ok).toBe(true);
    expect(checkEstimate('TASK', 'FIBONACCI', { estimateHours: -1 }).ok).toBe(false);
    expect(checkEstimate('TASK', 'FIBONACCI', { estimateHours: 10_001 }).ok).toBe(false);
  });

  it('saat rollup: girilenleri toplar, hiçbiri yoksa null', () => {
    expect(rollupHours([])).toBeNull();
    expect(rollupHours([{ estimateHours: null }])).toBeNull();
    expect(
      rollupHours([{ estimateHours: 2 }, { estimateHours: null }, { estimateHours: 3.5 }]),
    ).toBe(5.5);
  });
});

describe('okunabilir ID (ADR-033)', () => {
  it('biçimler ve ayrıştırır', () => {
    expect(formatItemKey('MOB', 142)).toBe('MOB-142');
    expect(parseItemKey('MOB-142')).toEqual({ prefix: 'MOB', number: 142 });
    expect(parseItemKey(' mob-7 ')).toEqual({ prefix: 'MOB', number: 7 });
  });

  it.each(['MOB', 'MOB-', 'MOB-0', '1AB-3', 'A-3', 'MOB-1x', 'MOB--1', '', 'ABCDEFGHIJK-1'])(
    'geçersiz: %j',
    (text) => expect(parseItemKey(text)).toBeNull(),
  );
});

describe('Epic ilerlemesi (brief §6.2.3)', () => {
  it('alt öğe yoksa 0', () => expect(epicProgress([])).toBe(0));

  it('point ağırlıklı', () => {
    expect(
      epicProgress([
        { points: 8, category: 'DONE' },
        { points: 2, category: 'ACTIVE' },
      ]),
    ).toBe(80);
  });

  it('point yoksa adet bazlı', () => {
    expect(
      epicProgress([
        { points: null, category: 'DONE' },
        { points: null, category: 'NOT_STARTED' },
        { points: null, category: 'NOT_STARTED' },
        { points: null, category: 'ACTIVE' },
      ]),
    ).toBe(25);
  });

  it('tahminsiz öğeler point varken yok sayılır', () => {
    expect(
      epicProgress([
        { points: 5, category: 'DONE' },
        { points: null, category: 'NOT_STARTED' },
      ]),
    ).toBe(100);
  });
});

describe('tamamlanma tarihi (brief §6.2.5)', () => {
  const now = new Date('2026-10-02T10:00:00Z');
  const before = new Date('2026-09-30T10:00:00Z');

  it('DONE durumuna girince yazılır, çıkınca silinir', () => {
    expect(nextCompletedAt('ACTIVE', 'DONE', null, now)).toEqual(now);
    expect(nextCompletedAt('DONE', 'ACTIVE', before, now)).toBeNull();
    expect(nextCompletedAt('NOT_STARTED', 'ACTIVE', null, now)).toBeNull();
  });

  it('DONE içinde durum değişirse eski tarih korunur', () => {
    expect(nextCompletedAt('DONE', 'DONE', before, now)).toEqual(before);
  });
});

describe('tamamlanma yüzdesi (ADR-107)', () => {
  it('Done durumundaki öğe 100, diğerleri girilen yüzde (yoksa 0)', () => {
    expect(ownPercent({ percentDone: 30, category: 'ACTIVE' })).toBe(30);
    expect(ownPercent({ percentDone: null, category: 'NOT_STARTED' })).toBe(0);
    expect(ownPercent({ percentDone: 10, category: 'DONE' })).toBe(100);
  });

  it('puan ağırlıklı ortalama; puan yoksa eşit ağırlık', () => {
    expect(
      weightedPercent([
        { points: 8, percentDone: 50, category: 'ACTIVE' },
        { points: 2, percentDone: null, category: 'DONE' },
      ]),
    ).toBe(60);
    expect(
      weightedPercent([
        { points: null, percentDone: 40, category: 'ACTIVE' },
        { points: null, percentDone: 0, category: 'NOT_STARTED' },
      ]),
    ).toBe(20);
    expect(weightedPercent([])).toBe(0);
  });
});
