import { describe, expect, it } from 'vitest';
import { LINK_TYPES } from '../constants/work-item';
import { canonicalLink, relationFor } from './work-item-links';

describe('bağlantı kuralları (ADR-050)', () => {
  it('kendine bağlanamaz', () => {
    for (const type of LINK_TYPES) {
      expect(canonicalLink('a', 'a', type)).toEqual({ ok: false, code: 'WORK_ITEM_LINK_SELF' });
    }
  });

  it('BLOCKS ve DUPLICATES yönünü korur', () => {
    expect(canonicalLink('b', 'a', 'BLOCKS')).toEqual({
      ok: true,
      link: { fromId: 'b', toId: 'a', type: 'BLOCKS' },
    });
  });

  it('RELATES_TO uçları sıralar; iki yönde aynı kayıt', () => {
    expect(canonicalLink('b', 'a', 'RELATES_TO')).toEqual(canonicalLink('a', 'b', 'RELATES_TO'));
  });

  it('ilişki adı öğenin gözünden belirlenir', () => {
    expect(relationFor('BLOCKS', true)).toBe('BLOCKS');
    expect(relationFor('BLOCKS', false)).toBe('BLOCKED_BY');
    expect(relationFor('DUPLICATES', false)).toBe('DUPLICATED_BY');
    expect(relationFor('RELATES_TO', false)).toBe('RELATES_TO');
  });
});
