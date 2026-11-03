import { monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * Tanılama için son isteklerin süreleri (ADR-159). Bellekte halka tampon: yalnızca yol kalıbı, süre,
 * durum kodu ve zaman tutulur; kimlik, gövde ya da sorgu parametresi tutulmaz.
 */
export interface RequestSample {
  route: string;
  ms: number;
  status: number;
  at: number;
}

const CAPACITY = 2000;
const samples: RequestSample[] = [];
let next = 0;
const startedAt = Date.now();

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ITEM_KEY = /\/key\/[^/]+/g;

/** `/api/workspaces/<uuid>/items/<uuid>?x=1` → `/api/workspaces/:id/items/:id` */
export function routePattern(url: string): string {
  return url.split('?')[0]!.replace(UUID, ':id').replace(ITEM_KEY, '/key/:key');
}

export function recordRequest(url: string, ms: number, status: number): void {
  const sample = { route: routePattern(url), ms, status, at: Date.now() };
  if (samples.length < CAPACITY) samples.push(sample);
  else samples[next] = sample;
  next = (next + 1) % CAPACITY;
}

export function requestSamples(): readonly RequestSample[] {
  return samples;
}

export function processStartedAt(): number {
  return startedAt;
}

/** Olay döngüsü gecikmesi: CPU'yu uzun süre tutan iş varsa istekler sırada bekler. */
export const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
