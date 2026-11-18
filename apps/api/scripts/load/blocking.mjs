/**
 * Nedensellik testi: ağır raporlar çalışırken HAFİF bir uç (unread-count) ne kadar gecikiyor?
 * Gecikme ağır raporlarla birlikte katlanıyorsa, Node olay döngüsü bloke oluyordur (tek süreç sırası).
 *   node scripts/load/blocking.mjs <etiket> [heavyPath] [paralel]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Http, OWNER, stats, sleep } from './lib.mjs';

const label = process.argv[2] || 'run';
const heavyKind = process.argv[3] || 'analytics';
const PAR = Number(process.argv[4] || 3);

const owner = new Http();
await owner.login(OWNER.email);
const ws = (await owner.get('/api/auth/me')).json.workspaces[0].id;
const api = (p) => `/api/workspaces/${ws}${p}`;
const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const to = new Date().toISOString().slice(0, 10);
const HEAVY = {
  analytics: [
    `/analytics/people?from=${from}&to=${to}`,
    `/analytics/quality?from=${from}&to=${to}`,
    `/analytics/flow?from=${from}&to=${to}`,
  ],
  admin: ['/admin/overview'],
};
const heavy = (HEAVY[heavyKind] ?? HEAVY.analytics).map(api);

// Hafif sorgu için ayrı oturum (aynı sunucu, ayrı bağlantı).
const light = new Http();
await light.login(OWNER.email);

async function lightRun(n, gapMs = 50, maxMs = 15000) {
  const ms = [];
  const t0 = performance.now();
  for (let i = 0; i < n && performance.now() - t0 < maxMs; i++) {
    const r = await light.get(api('/notifications/unread-count'));
    if (r.ok) ms.push(r.ms);
    await sleep(gapMs);
  }
  return stats(ms);
}

const baseline = await lightRun(200);

// Ağır istekleri PAR paralel döngüde sürekli gönder; bu sırada hafif uç ölçülür.
let stop = false;
let heavyDone = 0;
const heavyMs = [];
const loops = Array.from({ length: PAR }, async (_, k) => {
  const h = new Http();
  await h.login(OWNER.email);
  let i = k;
  while (!stop) {
    const r = await h.get(heavy[i++ % heavy.length]);
    if (r.ok) heavyMs.push(r.ms);
    heavyDone++;
  }
});
await sleep(500);
const underLoad = await lightRun(200);
stop = true;
await Promise.all(loops);

const result = {
  label,
  heavyKind,
  parallel: PAR,
  baseline,
  underLoad,
  heavyCompleted: heavyDone,
  heavy: stats(heavyMs),
};
const out = path.resolve(
  import.meta.dirname,
  '../../../../docs/perf/2026-11',
  `blocking-${label}.json`,
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(
  `hafif uç (unread-count) — boşta:    p50 ${baseline.p50} ms, p95 ${baseline.p95} ms, p99 ${baseline.p99} ms`,
);
console.log(
  `hafif uç (unread-count) — ${heavyKind} ×${PAR} varken: p50 ${underLoad.p50} ms, p95 ${underLoad.p95} ms, p99 ${underLoad.p99} ms`,
);
console.log(`ağır istekler: ${heavyDone} adet, p50 ${result.heavy.p50} ms`);
