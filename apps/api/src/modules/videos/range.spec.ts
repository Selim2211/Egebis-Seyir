import { describe, expect, it } from 'vitest';
import { parseRange } from './range';

describe('parseRange', () => {
  it('başlık yoksa tüm dosya', () => {
    expect(parseRange(undefined, 100)).toBeNull();
  });

  it('açık ve kapalı aralıklar', () => {
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  });

  it('karşılanamayan aralıklar', () => {
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=20-10', 100)).toBe('invalid');
    expect(parseRange('bytes=0-1,5-9', 100)).toBe('invalid');
    expect(parseRange('items=0-1', 100)).toBe('invalid');
    expect(parseRange('bytes=-', 100)).toBe('invalid');
  });
});
