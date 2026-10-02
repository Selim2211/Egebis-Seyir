import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Kesirli sıralama anahtarları (ADR-014). Sıralama değişince yalnızca taşınan kaydın
 * anahtarı güncellenir. Anahtarlar bayt sırasıyla karşılaştırılır (JS `<`, PostgreSQL `COLLATE "C"`).
 */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** Sona eklenecek `count` anahtar. */
export function ranksAfter(last: string | null, count: number): string[] {
  return generateNKeysBetween(last, null, count);
}

/**
 * Sıralı kardeşler arasında `afterId`'nin hemen arkasına yerleştirme anahtarı.
 * `afterId = null` → en başa. Taşınan öğe (`movingId`) kardeşler arasındaysa yok sayılır.
 * `afterId` kardeşlerde yoksa null döner.
 */
export function rankForPlacement(
  siblings: ReadonlyArray<{ id: string; rank: string }>,
  movingId: string | null,
  afterId: string | null,
): string | null {
  const others = siblings.filter((s) => s.id !== movingId);
  if (afterId === null) return rankBetween(null, others[0]?.rank ?? null);
  const index = others.findIndex((s) => s.id === afterId);
  if (index === -1) return null;
  return rankBetween(others[index]!.rank, others[index + 1]?.rank ?? null);
}

/** Bayt sırasıyla karşılaştırma (Array.sort için). */
export const compareRank = (a: { rank: string }, b: { rank: string }): number =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
