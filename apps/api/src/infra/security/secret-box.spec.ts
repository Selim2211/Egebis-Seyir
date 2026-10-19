import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openWith, sealWith } from './secret-box';

describe('secret-box', () => {
  const key = randomBytes(32);

  it('şifreler ve geri çözer; her seferinde farklı çıktı verir', () => {
    const a = sealWith(key, 'abcd efgh ijkl mnop');
    const b = sealWith(key, 'abcd efgh ijkl mnop');
    expect(a).not.toBe(b);
    expect(a).not.toContain('abcd');
    expect(openWith(key, a)).toBe('abcd efgh ijkl mnop');
  });

  it('yanlış anahtar ya da bozulmuş veri çözülmez', () => {
    const sealed = sealWith(key, 'gizli');
    expect(() => openWith(randomBytes(32), sealed)).toThrow();
    expect(() => openWith(key, sealed.slice(0, -2) + 'xx')).toThrow();
    expect(() => openWith(key, 'duz-metin')).toThrow();
  });
});
