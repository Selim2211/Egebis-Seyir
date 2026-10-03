import { describe, expect, it } from 'vitest';
import { DOC_MAX_DEPTH, DOC_VERSION_WINDOW_MS } from '../constants/doc';
import { checkDocMove, docDepth, isInSubtree, startsNewVersion, subtreeHeight } from './docs';

const tree = [
  { id: 'a', parentId: null },
  { id: 'b', parentId: 'a' },
  { id: 'c', parentId: 'b' },
  { id: 'd', parentId: null },
];

describe('sayfa ağacı', () => {
  it('alt dal üyeliğini bulur (kendisi dahil)', () => {
    expect(isInSubtree(tree, 'a', 'c')).toBe(true);
    expect(isInSubtree(tree, 'a', 'a')).toBe(true);
    expect(isInSubtree(tree, 'b', 'a')).toBe(false);
    expect(isInSubtree(tree, 'a', 'd')).toBe(false);
  });

  it('derinlik ve dal yüksekliği', () => {
    expect(docDepth(tree, 'a')).toBe(1);
    expect(docDepth(tree, 'c')).toBe(3);
    expect(subtreeHeight(tree, 'a')).toBe(3);
    expect(subtreeHeight(tree, 'd')).toBe(1);
  });
});

describe('taşıma kuralı', () => {
  it('köke taşımak her zaman geçerli', () => {
    expect(checkDocMove(tree, 'c', null)).toBe('OK');
  });

  it('kendi alt dalına taşımak döngüdür', () => {
    expect(checkDocMove(tree, 'a', 'c')).toBe('CYCLE');
    expect(checkDocMove(tree, 'a', 'a')).toBe('CYCLE');
  });

  it('başka dala taşımak geçerli', () => {
    expect(checkDocMove(tree, 'c', 'd')).toBe('OK');
  });

  it('derinlik sınırı aşılırsa reddedilir', () => {
    const chain = Array.from({ length: DOC_MAX_DEPTH }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 ? null : `n${i - 1}`,
    }));
    const docs = [...chain, { id: 'x', parentId: null }];
    expect(checkDocMove(docs, 'x', `n${DOC_MAX_DEPTH - 1}`)).toBe('TOO_DEEP');
    expect(checkDocMove(docs, 'x', `n${DOC_MAX_DEPTH - 2}`)).toBe('OK');
  });
});

describe('sürüm birleştirme (ADR-069)', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('sürüm yoksa yeni sürüm açar', () => {
    expect(startsNewVersion(null, 'u1', now)).toBe(true);
  });

  it('aynı yazar pencere içinde birleşir', () => {
    expect(startsNewVersion({ authorId: 'u1', createdAt: ago(60_000) }, 'u1', now)).toBe(false);
  });

  it('yazar değişirse ya da pencere dolarsa yeni sürüm', () => {
    expect(startsNewVersion({ authorId: 'u2', createdAt: ago(1_000) }, 'u1', now)).toBe(true);
    expect(
      startsNewVersion({ authorId: 'u1', createdAt: ago(DOC_VERSION_WINDOW_MS + 1) }, 'u1', now),
    ).toBe(true);
  });
});
