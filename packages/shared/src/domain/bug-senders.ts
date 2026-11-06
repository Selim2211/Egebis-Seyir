/**
 * Projeye Bug gönderebilecek gelen e-posta adresleri. Adresin isim kısmında `*` (her uzunlukta) ve
 * `?` (tek karakter) joker olarak kullanılabilir; alan adı birebir eşleşir. Büyük/küçük harf önemsizdir.
 */
export const BUG_SENDER_PATTERN = /^[A-Za-z0-9._%+\-*?]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function localRegex(local: string): RegExp {
  const source = [...local]
    .map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\-]/g, '\\$&')))
    .join('');
  return new RegExp(`^${source}$`, 'i');
}

/** Gönderen adres, kalıplardan en az birine uyuyor mu? Boş liste: kısıtlama yok. */
export function senderAllowed(patterns: readonly string[], email: string): boolean {
  if (patterns.length === 0) return true;
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  return patterns.some((pattern) => {
    const p = pattern.trim().toLowerCase();
    const pAt = p.lastIndexOf('@');
    if (pAt < 1) return false;
    return p.slice(pAt + 1) === domain && localRegex(p.slice(0, pAt)).test(local);
  });
}
