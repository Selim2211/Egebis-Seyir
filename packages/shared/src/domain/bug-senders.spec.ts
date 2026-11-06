import { describe, expect, it } from 'vitest';
import { BUG_SENDER_PATTERN, senderAllowed } from './bug-senders';

describe('senderAllowed', () => {
  it('liste boşsa herkes geçer', () => {
    expect(senderAllowed([], 'x@y.com')).toBe(true);
  });
  it('tam adres ve büyük/küçük harf', () => {
    expect(senderAllowed(['Ali@firma.com'], 'ali@FIRMA.com')).toBe(true);
    expect(senderAllowed(['ali@firma.com'], 'veli@firma.com')).toBe(false);
  });
  it('* ve ? jokerleri yalnızca isim kısmında çalışır', () => {
    expect(senderAllowed(['destek*@firma.com'], 'destek.ankara@firma.com')).toBe(true);
    expect(senderAllowed(['destek?@firma.com'], 'destek1@firma.com')).toBe(true);
    expect(senderAllowed(['destek?@firma.com'], 'destek12@firma.com')).toBe(false);
    expect(senderAllowed(['*@firma.com'], 'a@baska.com')).toBe(false);
    expect(senderAllowed(['a.b@firma.com'], 'axb@firma.com')).toBe(false);
  });
  it('kalıp biçimi', () => {
    expect(BUG_SENDER_PATTERN.test('destek*@firma.com')).toBe(true);
    expect(BUG_SENDER_PATTERN.test('destek@*.com')).toBe(false);
    expect(BUG_SENDER_PATTERN.test('firma.com')).toBe(false);
  });
});
