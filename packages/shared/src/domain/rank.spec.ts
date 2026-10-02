import { describe, expect, it } from 'vitest';
import { compareRank, rankBetween, rankForPlacement, ranksAfter } from './rank';

describe('kesirli sıralama (ADR-014)', () => {
  const [a, b, c] = ranksAfter(null, 3) as [string, string, string];
  const siblings = [
    { id: 'a', rank: a },
    { id: 'b', rank: b },
    { id: 'c', rank: c },
  ];
  const place = (id: string, afterId: string | null) =>
    siblings
      .map((s) => (s.id === id ? { id, rank: rankForPlacement(siblings, id, afterId)! } : s))
      .sort(compareRank)
      .map((s) => s.id);

  it('art arda anahtarlar artan sırada', () => {
    expect(a < b && b < c).toBe(true);
    const mid = rankBetween(a, b);
    expect(mid > a && mid < b).toBe(true);
  });

  it('en başa, araya ve sona yerleştirir', () => {
    expect(place('c', null)).toEqual(['c', 'a', 'b']);
    expect(place('a', 'b')).toEqual(['b', 'a', 'c']);
    expect(place('a', 'c')).toEqual(['b', 'c', 'a']);
    expect(place('b', 'a')).toEqual(['a', 'b', 'c']);
  });

  it('yeni öğeyi araya ekler', () => {
    const rank = rankForPlacement(siblings, null, 'a')!;
    expect(rank > a && rank < b).toBe(true);
  });

  it('boş listede ilk anahtarı üretir', () => {
    expect(rankForPlacement([], null, null)).toBe(rankBetween(null, null));
  });

  it('bilinmeyen komşu → null', () => {
    expect(rankForPlacement(siblings, 'a', 'x')).toBeNull();
  });
});
