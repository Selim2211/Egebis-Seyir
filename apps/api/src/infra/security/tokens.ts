import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL'de ve cookie'de güvenle taşınabilen 256 bit rastgele token. */
export const generateToken = (): string => randomBytes(32).toString('base64url');

/** Token'lar DB'de yalnızca özet olarak saklanır; DB sızsa bile kullanılamaz. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Sabit zamanlı metin karşılaştırma. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
