/** Dahili/özel ağ adresi mi (SSRF koruması, ADR-087)? Ana makine adı veya IP literal'i alır. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
    return true;
  if (host === '::1' || host === '::' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) {
    return true;
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  const v4 = mapped?.[1] ?? host;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v4);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** Bulut meta veri uçları gibi her koşulda yasak adresler. */
export function isAlwaysBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host.startsWith('169.254.') || host === 'metadata.google.internal' || host === 'fd00:ec2::254'
  );
}

/** Webhook adresi kabul edilebilir mi? `allowPrivate` kapalıyken dahili adresler de yasak. */
export function checkWebhookUrl(url: string, allowPrivate: boolean): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (isAlwaysBlockedHost(parsed.hostname)) return false;
  return allowPrivate || !isPrivateHost(parsed.hostname);
}
