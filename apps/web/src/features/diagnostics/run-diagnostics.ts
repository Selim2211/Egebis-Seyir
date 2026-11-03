/**
 * Tanılama ölçümleri (ADR-159). Sunucu raporu + tarayıcıdan yapılan ağ ölçümleri. Sonuç yöneticinin
 * kopyalayıp geliştiriciye göndermesi içindir; kişisel veri ya da sır içermez.
 */

type Json = Record<string, unknown>;

export interface DiagnosticsReport {
  server: Json | { error: string };
  client: {
    measuredAt: string;
    page: {
      url: string;
      protocol: string | null;
      assetFiles: number;
      assetKb: number;
      loadMs: number | null;
    };
    browser: {
      userAgent: string;
      timezone: string;
      effectiveType: string | null;
      browserRttMs: number | null;
      downlinkMbps: number | null;
    };
    ping: { totalMs: number[]; serverMs: number[]; networkMedianMs: number | null };
    parallel: { count: number; wallMs: number; slowestMs: number };
    download: Array<{ kb: number; ms: number; mbps: number }>;
  };
  verdicts: Array<{ level: 'ok' | 'warn' | 'bad'; key: string; values?: Json }>;
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const round = (n: number) => Math.round(n * 10) / 10;

function serverTiming(res: Response): number {
  const header = res.headers.get('server-timing') ?? '';
  return Number(/dur=([\d.]+)/.exec(header)?.[1] ?? 0);
}

async function timed(url: string): Promise<{ total: number; server: number; bytes: number }> {
  const start = performance.now();
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  const body = await res.arrayBuffer();
  return { total: performance.now() - start, server: serverTiming(res), bytes: body.byteLength };
}

export async function runDiagnostics(workspaceId: string): Promise<DiagnosticsReport> {
  const base = `/api/workspaces/${workspaceId}/diagnostics`;

  // Sayfanın yüklenişi (oturumun başından beri).
  const nav = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  const assets = performance
    .getEntriesByType('resource')
    .filter((e) => e.name.includes('/assets/')) as PerformanceResourceTiming[];

  // Gidiş-dönüş: ilk istek bağlantıyı ısıtır, sayılmaz.
  await timed(`${base}/ping`);
  const pings = [];
  for (let i = 0; i < 10; i++) pings.push(await timed(`${base}/ping`));
  const network = pings.map((p) => p.total - p.server);

  // Paralel: sayfa açılışı gibi 12 istek birden (HTTP/1.1'de tarayıcı aynı anda 6 açar).
  const parallelStart = performance.now();
  const parallel = await Promise.all(Array.from({ length: 12 }, () => timed(`${base}/ping`)));
  const wallMs = performance.now() - parallelStart;

  // İndirme: küçük ve büyük, sıkıştırılamayan veri.
  const download = [];
  for (const kb of [64, 1024]) {
    for (let i = 0; i < 2; i++) {
      const r = await timed(`${base}/payload?kb=${kb}&r=${Math.random()}`);
      download.push({
        kb,
        ms: round(r.total),
        mbps: round((r.bytes * 8) / 1e6 / (r.total / 1000)),
      });
    }
  }

  let server: DiagnosticsReport['server'];
  try {
    const res = await fetch(base, { cache: 'no-store', credentials: 'same-origin' });
    server = res.ok ? ((await res.json()) as Json) : { error: `HTTP ${res.status}` };
  } catch (e) {
    server = { error: (e as Error).message };
  }

  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; rtt?: number; downlink?: number };
    }
  ).connection;
  const client: DiagnosticsReport['client'] = {
    measuredAt: new Date().toISOString(),
    page: {
      url: location.origin,
      protocol: nav?.nextHopProtocol || null,
      assetFiles: assets.length,
      assetKb: Math.round(assets.reduce((s, e) => s + (e.encodedBodySize || 0), 0) / 1024),
      loadMs: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) : null,
    },
    browser: {
      userAgent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      effectiveType: connection?.effectiveType ?? null,
      browserRttMs: connection?.rtt ?? null,
      downlinkMbps: connection?.downlink ?? null,
    },
    ping: {
      totalMs: pings.map((p) => round(p.total)),
      serverMs: pings.map((p) => round(p.server)),
      networkMedianMs: median(network) === null ? null : round(median(network)!),
    },
    parallel: {
      count: parallel.length,
      wallMs: round(wallMs),
      slowestMs: round(Math.max(...parallel.map((p) => p.total))),
    },
    download,
  };
  return { server, client, verdicts: verdicts(server, client) };
}

/** Basit kurallarla yorum: hangi katman şüpheli. Eşikler ölçümlerden (ADR-158) türetildi. */
function verdicts(server: DiagnosticsReport['server'], client: DiagnosticsReport['client']) {
  const out: DiagnosticsReport['verdicts'] = [];
  const s = server as {
    error?: string;
    host?: {
      memFreeMb?: number;
      memTotalMb?: number;
      swapUsedMb?: number | null;
      cpuStealPct?: number | null;
      loadAvg?: number[];
      cpuCount?: number;
    };
    app?: { eventLoopDelayMs?: { p99?: number }; rssMb?: number };
    database?: { ok?: boolean; selectOneMs?: number[] };
    disk?: { usedPct?: number } | null;
    requests?: { p95Ms?: number | null; errors5xx?: number };
    network?: { mtu?: Record<string, number>; tcpMtuProbing?: string | null };
  };
  if (s.error) {
    out.push({ level: 'bad', key: 'serverUnreachable', values: { error: s.error } });
    return out;
  }

  const net = client.ping.networkMedianMs ?? 0;
  const srv = median(client.ping.serverMs) ?? 0;
  out.push(
    net > 60
      ? { level: 'bad', key: 'networkHigh', values: { ms: net } }
      : net > 25
        ? { level: 'warn', key: 'networkMedium', values: { ms: net } }
        : { level: 'ok', key: 'networkOk', values: { ms: net } },
  );
  if (srv > 20) out.push({ level: 'warn', key: 'serverSlowPing', values: { ms: srv } });

  const small = client.download.filter((d) => d.kb === 64).map((d) => d.ms);
  const big = client.download.filter((d) => d.kb === 1024);
  const bigMbps = median(big.map((d) => d.mbps)) ?? 0;
  if (bigMbps < 5) out.push({ level: 'bad', key: 'downloadSlow', values: { mbps: bigMbps } });
  else if (bigMbps < 20)
    out.push({ level: 'warn', key: 'downloadMedium', values: { mbps: bigMbps } });
  else out.push({ level: 'ok', key: 'downloadOk', values: { mbps: bigMbps } });
  // Küçük dosyalar hızlı ama büyükler beklenenden çok yavaşsa: MTU kara deliği ya da vekil denetimi.
  const smallMs = median(small) ?? 0;
  const expectedBig = smallMs + (1024 * 8) / Math.max(bigMbps, 1);
  if (big.some((d) => d.ms > 1500 && d.ms > expectedBig * 3)) {
    out.push({ level: 'bad', key: 'bigTransferStalls' });
  }

  if (client.page.protocol === 'http/1.1') {
    out.push({ level: 'warn', key: 'http11', values: { files: client.page.assetFiles } });
  }
  if (client.parallel.wallMs > Math.max(net, 1) * 4 + 200) {
    out.push({ level: 'warn', key: 'parallelQueued', values: { ms: client.parallel.wallMs } });
  }

  const db = median(s.database?.selectOneMs ?? []) ?? 0;
  if (s.database?.ok === false) out.push({ level: 'bad', key: 'dbDown' });
  else if (db > 5) out.push({ level: 'warn', key: 'dbSlow', values: { ms: db } });
  else out.push({ level: 'ok', key: 'dbOk', values: { ms: db } });

  if ((s.app?.eventLoopDelayMs?.p99 ?? 0) > 100) {
    out.push({ level: 'warn', key: 'eventLoop', values: { ms: s.app?.eventLoopDelayMs?.p99 } });
  }
  if ((s.requests?.p95Ms ?? 0) > 500) {
    out.push({ level: 'warn', key: 'apiSlow', values: { ms: s.requests?.p95Ms } });
  }
  if ((s.requests?.errors5xx ?? 0) > 0) {
    out.push({ level: 'warn', key: 'apiErrors', values: { count: s.requests?.errors5xx } });
  }
  if (
    s.host?.memFreeMb !== undefined &&
    s.host.memTotalMb &&
    s.host.memFreeMb / s.host.memTotalMb < 0.1
  ) {
    out.push({
      level: 'warn',
      key: 'memLow',
      values: { free: s.host.memFreeMb, total: s.host.memTotalMb },
    });
  }
  if ((s.host?.swapUsedMb ?? 0) > 200) {
    out.push({ level: 'warn', key: 'swapUsed', values: { mb: s.host?.swapUsedMb } });
  }
  if ((s.host?.cpuStealPct ?? 0) > 5) {
    out.push({ level: 'warn', key: 'cpuSteal', values: { pct: s.host?.cpuStealPct } });
  }
  const load = s.host?.loadAvg?.[0] ?? 0;
  if (s.host?.cpuCount && load > s.host.cpuCount) {
    out.push({ level: 'warn', key: 'cpuBusy', values: { load, cpus: s.host.cpuCount } });
  }
  if ((s.disk?.usedPct ?? 0) > 90) {
    out.push({ level: 'bad', key: 'diskFull', values: { pct: s.disk?.usedPct } });
  }
  const mtus = Object.values(s.network?.mtu ?? {}).filter((m) => m && m !== 65536);
  if (mtus.some((m) => m > 1500) && s.network?.tcpMtuProbing === '0') {
    out.push({ level: 'warn', key: 'mtuRisk' });
  }
  return out;
}
