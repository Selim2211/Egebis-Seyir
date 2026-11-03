import { describe, expect, it } from 'vitest';
import { countSentences } from './sentences';

describe('countSentences (ADR-155)', () => {
  it('noktalama ile biten cümleleri sayar', () => {
    expect(countSentences('Kullanıcı giriş yapar. Şifre hatalıysa uyarı görür! Neden?')).toBe(2);
  });

  it('satır ve madde işaretli satırları ayrı cümle sayar', () => {
    expect(countSentences('- Ödeme sayfası açılır\n- Kart bilgisi girilir\n3) Onay gelir')).toBe(3);
  });

  it('tek kelimelik parçalar ve boş metin sayılmaz', () => {
    expect(countSentences('Tamam. Evet.')).toBe(0);
    expect(countSentences('')).toBe(0);
  });

  it('ondalık sayıdaki nokta cümleyi bölmez', () => {
    expect(countSentences('Sürüm 2.5 yayınlanacak.')).toBe(1);
  });
});
