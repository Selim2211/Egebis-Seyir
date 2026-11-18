import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';

/**
 * Yedek şifreleme (ADR-171): AES-256-GCM. Dosya düzeni:
 * `SEYIRENC1` (9 bayt) · tuz (16) · iv (12) · kimlik doğrulama etiketi (16) · şifreli veri.
 * Anahtar, Super Admin'in gördüğü gizli metinden scrypt ile (dosyaya özel tuzla) türetilir.
 */
const MAGIC = Buffer.from('SEYIRENC1', 'utf8');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;

/** Bir anahtarın kısa, geri döndürülemez parmak izi (yedeğin hangi anahtarla alındığını ayırt etmek için). */
export const keyFingerprint = (secret: string): string =>
  createHash('sha256').update(secret.trim()).digest('hex').slice(0, 8);

/** 256 bit rastgele anahtar; okunabilirlik için 8'li gruplar: `a1b2c3d4-…` (8 grup). */
export function generateBackupKey(): string {
  return randomBytes(32).toString('hex').match(/.{8}/g)!.join('-');
}

export const isEncryptedBackup = (file: Buffer): boolean =>
  file.length >= HEADER_BYTES && file.subarray(0, MAGIC.length).equals(MAGIC);

const derive = (secret: string, salt: Buffer): Buffer =>
  scryptSync(secret.trim(), salt, 32, { N: 16384, r: 8, p: 1 });

export function encryptBackup(plain: Buffer, secret: string): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', derive(secret, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

/** Anahtar yanlışsa ya da dosya değişmişse `null` döner (GCM etiketi tutmaz). */
export function decryptBackup(file: Buffer, secret: string): Buffer | null {
  if (!isEncryptedBackup(file)) return null;
  let at = MAGIC.length;
  const salt = file.subarray(at, (at += SALT_BYTES));
  const iv = file.subarray(at, (at += IV_BYTES));
  const tag = file.subarray(at, (at += TAG_BYTES));
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(secret, salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(file.subarray(at)), decipher.final()]);
  } catch {
    return null;
  }
}
