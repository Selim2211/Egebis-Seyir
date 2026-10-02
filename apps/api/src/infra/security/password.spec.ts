import { describe, expect, it } from 'vitest';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';
import { generateToken, hashToken, safeEqual } from './tokens';

describe('şifre özeti', () => {
  it('doğru şifreyi doğrular, yanlışı reddeder', async () => {
    const hash = await hashPassword('gizli-şifre');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(verifyPassword('gizli-şifre', hash)).resolves.toBe(true);
    await expect(verifyPassword('gizli-sifre', hash)).resolves.toBe(false);
  });

  it('aynı şifre için her seferinde farklı tuz kullanır', async () => {
    expect(await hashPassword('a')).not.toEqual(await hashPassword('a'));
  });

  it('bozuk veya sahte özette false döner', async () => {
    await expect(verifyPassword('x', 'düz-metin')).resolves.toBe(false);
    await expect(verifyPassword('x', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});

describe('token yardımcıları', () => {
  it('token yeterince uzun ve URL güvenli', () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toEqual(t);
  });

  it("özet deterministik ve token'dan farklı", () => {
    expect(hashToken('abc')).toEqual(hashToken('abc'));
    expect(hashToken('abc')).not.toContain('abc');
  });

  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
