import { describe, expect, it } from 'vitest';
import { configFromSearch, sameConfig, searchFromConfig } from './saved-view-config';

describe('kayıtlı görünüm ayarı', () => {
  it('adres durumundan açık paneli ve boş değerleri çıkarır', () => {
    expect(
      configFromSearch({ item: 'MOB-1', view: 'table', status: [], q: 'rapor', sort: 'due' }),
    ).toEqual({ view: 'table', q: 'rapor', sort: 'due' });
  });

  it('ayarı adres durumuna çevirir; bozuk anahtarı atlar, geçerlileri korur', () => {
    expect(searchFromConfig({ view: 'board', sort: 'yok', status: ['a'], bilinmeyen: 1 })).toEqual({
      view: 'board',
      status: ['a'],
    });
  });

  it('sıradan bağımsız karşılaştırır; tanımsız ile eksik aynıdır', () => {
    expect(sameConfig({ q: 'a', sort: 'due' }, { sort: 'due', q: 'a' })).toBe(true);
    expect(sameConfig({ q: 'a', dir: undefined }, { q: 'a' })).toBe(true);
    expect(sameConfig({ q: 'a' }, { q: 'b' })).toBe(false);
  });
});
