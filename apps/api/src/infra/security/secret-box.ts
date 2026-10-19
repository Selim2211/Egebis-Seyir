import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

/** AES-256-GCM ile `v1:<iv>:<etiket>:<şifreli>` (hepsi base64url). Anahtar 32 bayt olmalı. */
export function sealWith(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [PREFIX, iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join(':');
}

export function openWith(key: Buffer, sealed: string): string {
  const [prefix, iv, tag, data] = sealed.split(':');
  if (prefix !== PREFIX || !iv || !tag || !data) throw new Error('Geçersiz şifreli değer');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
