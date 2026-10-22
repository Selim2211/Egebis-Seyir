/**
 * Toplu taşıma listesinde gösterilecek hızlı sprint hedefleri (en çok 3). Sprint'ler başlangıç tarihine göre
 * sıralı gelir. Merkez: seçilenler tek bir sprint'teyse o sprint, değilse aktif sprint (yoksa ilk sprint).
 * Öncelik: merkez (yalnızca seçilenlerin bulunduğu sprint değilse), sonraki, ondan sonraki, önceki.
 * Böylece kaynak sprint'ten bakınca "1 önceki, 2 sonraki" çıkar. Sonuç listede tarih sırasıyla döner.
 */
export function quickSprintTargets<T extends { id: string; status: string }>(
  sprints: readonly T[],
  sourceSprintId: string | null,
  max = 3,
): T[] {
  if (sprints.length === 0) return [];
  const sourceIndex = sourceSprintId ? sprints.findIndex((s) => s.id === sourceSprintId) : -1;
  const activeIndex = sprints.findIndex((s) => s.status === 'ACTIVE');
  const pivot = sourceIndex >= 0 ? sourceIndex : activeIndex >= 0 ? activeIndex : 0;
  const order = [pivot, pivot + 1, pivot + 2, pivot - 1];
  const picked = order
    .filter((i) => i >= 0 && i < sprints.length && i !== sourceIndex)
    .slice(0, max);
  return picked.sort((a, b) => a - b).map((i) => sprints[i]!);
}
