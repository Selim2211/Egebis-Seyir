/**
 * Tek aralıklı HTTP Range başlığını çözer (video oynatıcı ileri sarınca `bytes=START-` ister).
 * `null`: başlık yok → tüm dosya; `'invalid'`: karşılanamaz → 416.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size === 0) return 'invalid';
  const [, from, to] = match;
  if (from === '' && to === '') return 'invalid';
  if (from === '') {
    // Son N bayt.
    const suffix = Number(to);
    if (suffix === 0) return 'invalid';
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(from);
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return 'invalid';
  return { start, end };
}
