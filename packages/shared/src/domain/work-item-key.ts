import { SPACE_KEY_PATTERN } from '../constants/space';

/** `MOB`, 142 → `MOB-142` (ADR-033). */
export const formatItemKey = (prefix: string, number: number): string => `${prefix}-${number}`;

/** `mob-142` → { prefix: 'MOB', number: 142 }; geçersizse null. Büyük/küçük harf duyarsız. */
export function parseItemKey(text: string): { prefix: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,9})$/.exec(text.trim());
  if (!match) return null;
  const prefix = match[1]!.toUpperCase();
  const number = Number(match[2]);
  if (!SPACE_KEY_PATTERN.test(prefix) || number < 1) return null;
  return { prefix, number };
}
