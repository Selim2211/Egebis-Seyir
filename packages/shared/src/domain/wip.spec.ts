import { describe, expect, it } from 'vitest';
import { wipState } from './wip';

describe('wipState', () => {
  it('limit yoksa none', () => {
    expect(wipState(10, null)).toBe('none');
    expect(wipState(0, undefined)).toBe('none');
  });
  it('limitin altında ok, eşitte full, üstünde over', () => {
    expect(wipState(2, 3)).toBe('ok');
    expect(wipState(3, 3)).toBe('full');
    expect(wipState(4, 3)).toBe('over');
  });
});
