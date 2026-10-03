import { describe, expect, it } from 'vitest';
import { capacityOf } from './capacity';

describe('capacityOf', () => {
  it('referans velocity yoksa değerlendirme yapılmaz', () => {
    expect(capacityOf(20, null)).toEqual({ state: 'none', percent: null });
    expect(capacityOf(20, 0)).toEqual({ state: 'none', percent: null });
  });

  it('velocity altı: rahat; %90 ve üstü: sınırda; üstü: aşım', () => {
    expect(capacityOf(10, 30)).toEqual({ state: 'under', percent: 33 });
    expect(capacityOf(27, 30)).toEqual({ state: 'near', percent: 90 });
    expect(capacityOf(30, 30)).toEqual({ state: 'near', percent: 100 });
    expect(capacityOf(31, 30)).toEqual({ state: 'over', percent: 103 });
  });

  it('boş sprint rahattır', () => {
    expect(capacityOf(0, 25)).toEqual({ state: 'under', percent: 0 });
  });
});
