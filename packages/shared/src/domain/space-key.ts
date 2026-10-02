import { SPACE_KEY_PATTERN } from '../constants/space';

const TURKISH: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  Ç: 'C',
  Ğ: 'G',
  İ: 'I',
  Ö: 'O',
  Ş: 'S',
  Ü: 'U',
};

/**
 * Space adından anahtar önerir (ADR-043): "Mobil Uygulama" → "MOB",
 * "İnsan Kaynakları Departmanı" → "IKD". Geçerli öneri üretilemezse boş döner.
 */
export function suggestSpaceKey(name: string): string {
  const words = name
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TURKISH[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => /^[A-Z]/.test(w));
  if (words.length === 0) return '';

  const first = words[0]!;
  const key =
    words.length >= 3
      ? words.map((w) => w[0]).join('')
      : first.length >= 3
        ? first.slice(0, 3)
        : words.join('').slice(0, 3);
  const trimmed = key.slice(0, 10);
  return SPACE_KEY_PATTERN.test(trimmed) ? trimmed : '';
}
