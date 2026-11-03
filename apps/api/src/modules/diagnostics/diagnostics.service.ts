import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import os from 'node:os';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  eventLoopDelay,
  processStartedAt,
  requestSamples,
} from '../../infra/diagnostics/request-stats';
import { type Env, cookieSecure } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';

const MB = 1024 * 1024;
const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Dosyayı okur; yoksa ya da okunamazsa null (ör. Windows'ta /proc yok). */
function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!);
}

/**
 * Ayarlar → Tanılama raporunun sunucu tarafı (ADR-159). Sunucuya erişimi olmayan yöneticinin yavaşlığın
 * kaynağını (sunucu, veritabanı, ağ) ayırması için. Şifre, bağlantı adresi, anahtar gibi sırlar
 * rapora girmez; yalnızca ayarın açık/kapalı ya da tanımlı olup olmadığı yazılır.
 */
@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async report(req: Request) {
    const [database, disk] = await Promise.all([this.database(), this.disk()]);
    return {
      generatedAt: new Date().toISOString(),
      app: this.app(),
      host: this.host(),
      container: this.container(),
      network: this.network(),
      disk,
      database,
      requests: this.requests(),
      connection: {
        // İsteğin sunucuya nasıl ulaştığı: araya giren vekiller ve HTTP sürümü.
        httpVersion: req.httpVersion,
        protocolSeenByApi: req.protocol,
        forwardedProto: req.get('x-forwarded-proto') ?? null,
        forwardedForHops: (req.get('x-forwarded-for') ?? '').split(',').filter(Boolean).length,
        via: req.get('via') ?? null,
        clientIp: req.ip ?? null,
        acceptEncoding: req.get('accept-encoding') ?? null,
      },
    };
  }

  private app() {
    const mem = process.memoryUsage();
    return {
      version: process.env.npm_package_version ?? null,
      node: process.version,
      env: this.config.get('NODE_ENV', { infer: true }),
      uptimeMin: round((Date.now() - processStartedAt()) / 60_000),
      rssMb: round(mem.rss / MB),
      heapUsedMb: round(mem.heapUsed / MB),
      heapTotalMb: round(mem.heapTotal / MB),
      eventLoopDelayMs: {
        mean: round(eventLoopDelay.mean / 1e6),
        p99: round(eventLoopDelay.percentile(99) / 1e6),
        max: round(eventLoopDelay.max / 1e6),
      },
      settings: {
        appUrl: this.config.get('APP_URL', { infer: true }),
        cookieSecure: cookieSecure({
          COOKIE_SECURE: this.config.get('COOKIE_SECURE', { infer: true }),
          NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
        }),
        trustProxy: this.config.get('TRUST_PROXY', { infer: true }),
        queueEnabled: this.config.get('QUEUE_ENABLED', { infer: true }),
        logLevel: this.config.get('LOG_LEVEL', { infer: true }),
        maxUploadMb: this.config.get('MAX_UPLOAD_MB', { infer: true }),
        aiConfigured: !!this.config.get('ANTHROPIC_API_KEY', { infer: true }),
      },
    };
  }

  private host() {
    const cpus = os.cpus();
    return {
      platform: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model ?? null,
      loadAvg: os.loadavg().map((n) => round(n, 2)),
      memTotalMb: round(os.totalmem() / MB, 0),
      memFreeMb: round(os.freemem() / MB, 0),
      uptimeHours: round(os.uptime() / 3600),
      // /proc/meminfo: takas kullanımı (Linux).
      swapUsedMb: (() => {
        const info = read('/proc/meminfo');
        if (!info) return null;
        const kb = (key: string) => Number(new RegExp(`${key}:\\s+(\\d+)`).exec(info)?.[1] ?? 0);
        return round((kb('SwapTotal') - kb('SwapFree')) / 1024, 0);
      })(),
      // CPU çalınması (sanal makine kotası): /proc/stat'taki steal oranı, açılıştan beri.
      cpuStealPct: (() => {
        const line = read('/proc/stat')?.split('\n')[0];
        if (!line) return null;
        const v = line.split(/\s+/).slice(1).map(Number);
        const total = v.reduce((a, b) => a + b, 0);
        return total > 0 ? round(((v[7] ?? 0) / total) * 100, 2) : null;
      })(),
    };
  }

  private container() {
    const memMax = read('/sys/fs/cgroup/memory.max');
    const cpuMax = read('/sys/fs/cgroup/cpu.max');
    return {
      docker: existsSync('/.dockerenv'),
      memoryLimitMb: memMax && memMax !== 'max' ? round(Number(memMax) / MB, 0) : null,
      cpuLimit:
        cpuMax && !cpuMax.startsWith('max')
          ? round(Number(cpuMax.split(' ')[0]) / Number(cpuMax.split(' ')[1]), 2)
          : null,
    };
  }

  private network() {
    let interfaces: Record<string, number | null>;
    try {
      interfaces = Object.fromEntries(
        readdirSync('/sys/class/net').map((n) => [n, Number(read(`/sys/class/net/${n}/mtu`))]),
      );
    } catch {
      interfaces = {};
    }
    return {
      mtu: interfaces,
      tcpMtuProbing: read('/proc/sys/net/ipv4/tcp_mtu_probing'),
      tcpSlowStartAfterIdle: read('/proc/sys/net/ipv4/tcp_slow_start_after_idle'),
      tcpCongestion: read('/proc/sys/net/ipv4/tcp_congestion_control'),
    };
  }

  private async disk() {
    try {
      const s = await statfs(this.config.get('UPLOAD_DIR', { infer: true }));
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      return {
        totalGb: round(total / 1024 / MB),
        freeGb: round(free / 1024 / MB),
        usedPct: round(((total - free) / total) * 100),
      };
    } catch {
      return null;
    }
  }

  private async database() {
    const timings: number[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const t = process.hrtime.bigint();
        await this.prisma.$queryRaw`SELECT 1`;
        timings.push(round(Number(process.hrtime.bigint() - t) / 1e6, 2));
      }
      const [info] = await this.prisma.$queryRaw<
        Array<{
          version: string;
          size: string;
          connections: number;
          max_connections: string;
          shared_buffers: string;
          items: number;
          users: number;
        }>
      >`SELECT
          split_part(version(), ' on ', 1) AS version,
          pg_size_pretty(pg_database_size(current_database())) AS size,
          (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections,
          current_setting('max_connections') AS max_connections,
          current_setting('shared_buffers') AS shared_buffers,
          (SELECT count(*)::int FROM work_items) AS items,
          (SELECT count(*)::int FROM users) AS users`;
      return { ok: true, selectOneMs: timings, ...info };
    } catch (error) {
      return { ok: false, selectOneMs: timings, error: (error as Error).message.slice(0, 200) };
    }
  }

  private requests() {
    const all = requestSamples().filter((s) => s.route.startsWith('/api/'));
    const recent = all.filter((s) => s.at > Date.now() - 60 * 60_000);
    const sorted = recent.map((s) => s.ms).sort((a, b) => a - b);
    const byRoute = new Map<string, number[]>();
    for (const s of recent) byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s.ms]);
    return {
      lastHourCount: recent.length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      over500ms: recent.filter((s) => s.ms > 500).length,
      errors5xx: recent.filter((s) => s.status >= 500).length,
      slowestRoutes: [...byRoute]
        .map(([route, ms]) => ({
          route,
          count: ms.length,
          avgMs: round(ms.reduce((a, b) => a + b, 0) / ms.length),
          maxMs: round(Math.max(...ms)),
        }))
        .sort((a, b) => b.avgMs - a.avgMs)
        .slice(0, 15),
      recentErrors: recent
        .filter((s) => s.status >= 500)
        .slice(-10)
        .map((s) => ({ route: s.route, status: s.status, at: new Date(s.at).toISOString() })),
    };
  }
}
