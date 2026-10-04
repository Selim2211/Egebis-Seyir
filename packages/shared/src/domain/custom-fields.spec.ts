import { describe, expect, it } from 'vitest';
import { checkFieldValue, formatFieldValue, isValidDateOnly } from './custom-fields';

const A = '0194ba6a-0001-7000-8000-000000000001';
const B = '0194ba6a-0002-7000-8000-000000000002';
const field = (type: Parameters<typeof checkFieldValue>[0]['type']) => ({
  id: 'f',
  type,
  options: [{ id: A }, { id: B }],
});

describe('checkFieldValue', () => {
  it('null her türde değeri temizler', () => {
    expect(checkFieldValue(field('TEXT'), null)).toEqual({ ok: true, value: null });
  });

  it('metin kırpılır, boş metin temizler, çok uzun reddedilir', () => {
    expect(checkFieldValue(field('TEXT'), '  a ')).toEqual({ ok: true, value: 'a' });
    expect(checkFieldValue(field('TEXT'), '   ')).toEqual({ ok: true, value: null });
    expect(checkFieldValue(field('TEXT'), 'x'.repeat(2001)).ok).toBe(false);
    expect(checkFieldValue(field('TEXT'), 5).ok).toBe(false);
  });

  it('sayı sonlu ve sınırlı olmalı', () => {
    expect(checkFieldValue(field('NUMBER'), 12.5)).toEqual({ ok: true, value: 12.5 });
    for (const v of [NaN, Infinity, '1', 1e13]) {
      expect(checkFieldValue(field('NUMBER'), v).ok).toBe(false);
    }
  });

  it('tarih gerçek bir gün olmalı', () => {
    expect(isValidDateOnly('2026-02-28')).toBe(true);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(checkFieldValue(field('DATE'), '2026-13-01').ok).toBe(false);
  });

  it('URL yalnızca http(s)', () => {
    expect(checkFieldValue(field('URL'), 'https://a.com/x').ok).toBe(true);
    expect(checkFieldValue(field('URL'), 'javascript:alert(1)').ok).toBe(false);
    expect(checkFieldValue(field('URL'), 'a.com').ok).toBe(false);
    expect(checkFieldValue(field('URL'), ' ')).toEqual({ ok: true, value: null });
  });

  it('liste ve çoklu seçim tanımlı seçenekleri ister; çoklu tekrarsız, boş = temizle', () => {
    expect(checkFieldValue(field('DROPDOWN'), A)).toEqual({ ok: true, value: A });
    expect(checkFieldValue(field('DROPDOWN'), 'yok').ok).toBe(false);
    expect(checkFieldValue(field('MULTI_SELECT'), [A, A, B])).toEqual({ ok: true, value: [A, B] });
    expect(checkFieldValue(field('MULTI_SELECT'), [])).toEqual({ ok: true, value: null });
    expect(checkFieldValue(field('MULTI_SELECT'), [A, 'yok']).ok).toBe(false);
  });

  it('onay kutusu boolean, kişi uuid', () => {
    expect(checkFieldValue(field('CHECKBOX'), false)).toEqual({ ok: true, value: false });
    expect(checkFieldValue(field('CHECKBOX'), 'true').ok).toBe(false);
    expect(checkFieldValue(field('PERSON'), A).ok).toBe(true);
    expect(checkFieldValue(field('PERSON'), 'ali').ok).toBe(false);
  });
});

describe('formatFieldValue', () => {
  const options = [
    { id: A, label: 'Yüksek' },
    { id: B, label: 'Düşük' },
  ];

  it('türe göre okunur metin üretir', () => {
    expect(formatFieldValue({ type: 'DROPDOWN', options }, A)).toBe('Yüksek');
    expect(formatFieldValue({ type: 'MULTI_SELECT', options }, [A, B, 'silinmiş'])).toBe(
      'Yüksek, Düşük',
    );
    expect(formatFieldValue({ type: 'CHECKBOX', options: [] }, true)).toBe('✓');
    expect(formatFieldValue({ type: 'PERSON', options: [] }, A, () => 'Elif')).toBe('Elif');
    expect(formatFieldValue({ type: 'NUMBER', options: [] }, undefined)).toBe('');
  });
});
