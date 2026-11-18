import { describe, expect, it } from 'vitest';
import {
  decryptBackup,
  encryptBackup,
  generateBackupKey,
  isEncryptedBackup,
  keyFingerprint,
} from './backup-crypto';

describe('yedek şifreleme (AES-256-GCM)', () => {
  const plain = Buffer.from('PK\u0003\u0004 örnek yedek içeriği '.repeat(50), 'utf8');

  it('şifreleyip aynı anahtarla çözer; şifreli dosya düz içeriği barındırmaz', () => {
    const key = generateBackupKey();
    const sealed = encryptBackup(plain, key);
    expect(isEncryptedBackup(sealed)).toBe(true);
    expect(isEncryptedBackup(plain)).toBe(false);
    expect(sealed.includes(Buffer.from('örnek yedek'))).toBe(false);
    expect(decryptBackup(sealed, key)?.equals(plain)).toBe(true);
  });

  it('yanlış anahtar ya da değiştirilmiş dosyada null döner', () => {
    const sealed = encryptBackup(plain, generateBackupKey());
    expect(decryptBackup(sealed, generateBackupKey())).toBeNull();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    expect(decryptBackup(tampered, 'x'.repeat(20))).toBeNull();
  });

  it('her şifreleme farklı tuz/iv kullanır', () => {
    const key = generateBackupKey();
    expect(encryptBackup(plain, key).equals(encryptBackup(plain, key))).toBe(false);
  });

  it('anahtar 256 bit (8×8 hex), parmak izi sabit ve 8 karakter', () => {
    const key = generateBackupKey();
    expect(key).toMatch(/^([0-9a-f]{8}-){7}[0-9a-f]{8}$/);
    expect(keyFingerprint(key)).toBe(keyFingerprint(`  ${key} `));
    expect(keyFingerprint(key)).toHaveLength(8);
  });

  it('şifreli olmayan dosyayı çözmeye çalışınca null döner', () => {
    expect(decryptBackup(plain, generateBackupKey())).toBeNull();
  });
});
