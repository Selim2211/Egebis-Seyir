import { describe, expect, it } from 'vitest';
import { WORK_ITEM_TYPES } from '../constants/work-item';
import { checkEstimate, ESTIMATE_KIND, rollupHours } from './work-item-estimate';
import { formatItemKey, parseItemKey } from './work-item-key';
import { epicProgress, nextCompletedAt } from './work-item-progress';

describe('tahmin kuralları (ADR-045, brief §6.2.4)', () => {
  it('Story Point yalnızca Epic/Story/Bug, saat yalnızca Task/Sub-task', () => {
    for (const type of WORK_ITEM_TYPES) {
      const points = ESTIMATE_KIND[type] === 'POINTS';
      expect(checkEstimate(type, 'FIBONACCI', { points: 3 }).ok).toBe(points);
      expect(checkEstimate(type, 'FIBONACCI', { estimateHours: 4 }).ok).toBe(!points);
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
