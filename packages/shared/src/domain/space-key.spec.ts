import { describe, expect, it } from 'vitest';
import { suggestSpaceKey } from './space-key';

describe('suggestSpaceKey (ADR-043)', () => {
  it.each([
    ['Mobil Uygulama', 'MOB'],
    ['Web Portalı', 'WEB'],
    ['Operasyon', 'OPE'],
    ['İnsan Kaynakları Departmanı', 'IKD'],
    ['Çağrı Merkezi', 'CAG'],
    ['şube', 'SUB'],
    ['AI', 'AI'],
    ['QA Ekibi', 'QAE'],
    ['2026 Kampanya', 'KAM'],
    ['Ürün', 'URU'],
    ['  ', ''],
    ['X', ''],
    ['123', ''],
  ])('%j → %j', (name, key) => {
    expect(suggestSpaceKey(name)).toBe(key);
  });

  it('çok kelimeli adlarda baş harfler en fazla 10 karakter', () => {
    expect(suggestSpaceKey('a b c d e f g h i j k l')).toBe('ABCDEFGHIJ');
  });
});
