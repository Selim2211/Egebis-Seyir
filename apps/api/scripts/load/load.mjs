/**
 * B) Eşzamanlı kullanıcı yükü. Her sanal kullanıcı (VU) kendi oturumuyla giriş yapar ve gerçek bir kullanıcı
 * gibi davranır: okuma ağırlıklı karışım + az yazma + 30 sn'lik bildirim sorgulaması; eylemler arasında
 * "düşünme süresi" vardır. VU sayısı basamak basamak artar; kırılma ölçütü: p95 > 2 sn, hata > %1 ya da API düşmesi.
 *
 *   node scripts/load/load.mjs <etiket> [--steps 10,50,100,200,400,800] [--secs 30] [--think 4] [--all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Http, stats, sleep, pick, PASSWORD, OWNER, BASE } from './lib.mjs';
const require = createRequire(import.meta.url);
const guard = require('./guard.cjs');
const { Client } = guard.req('pg');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const label = process.argv[2] || 'run';
const STEPS = arg('steps', '10,50,100,200,400,800').split(',').map(Number);
const SECS = Number(arg('secs', 30));
const THINK = Number(arg('think', 4)); // ortalama düşünme süresi (sn)
const KEEP_GOING = process.argv.includes('--all');
const out = path.resolve(
  import.meta.dirname,
  '../../../../docs/perf/2026-11',
  `load-${label}.json`,
);

// ---------- Sunucu ölçümü ----------
function apiPid() {
  const txt = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  const line = txt.split(/\r?\n/).find((l) => /:3200\s+.*LISTENING/.test(l));
  return line ? Number(line.trim().split(/\s+/).at(-1)) : null;
}
function rssMB(pid) {
  try {
    // tasklist PowerShell'den çok daha hızlı; bellek "12.345 K" biçiminde döner.
    const o = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
    });
    const kb = Number(o.split('","').at(-1).replace(/[^d]/g, ''));
    return kb ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}
const pgc = new Client({ connectionString: guard.loadDatabaseUrl() });
await pgc.connect();
const pgConns = async () =>
  Number(
    (
      await pgc.query(
        "SELECT count(*) n FROM pg_stat_activity WHERE datname = 'scrum_load' AND state <> 'idle'",
      )
    ).rows[0].n,
  );

// ---------- Kullanıcı havuzu ----------
const pool = (
  await pgc.query(
    'SELECT u.email FROM users u WHERE u.email LIKE \'%@load.test\' AND u.email <> $1 AND EXISTS (SELECT 1 FROM space_members sm WHERE sm."userId" = u.id) ORDER BY u.email',
    [OWNER.email],
  )
).rows.map((r) => r.email);
if (!pool.length) throw new Error('Önce seed.cjs çalıştırın.');

const doc = (text) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** Bir VU'yu hazırlar: giriş + çalışacağı Proje/liste/öğe/konuşma bağlamı. */
async function makeVu(i) {
  const http = new Http();
  const email = pool[i % pool.length];
  const t0 = performance.now();
  await http.login(email);
  const loginMs = performance.now() - t0;
  const me = (await http.get('/api/auth/me')).json;
  const ws = me.workspaces[0].id;
  const api = (p) => `/api/workspaces/${ws}${p}`;
  const tree = (await http.get(api('/hierarchy'))).json;
  const spaces = tree.spaces.filter((s) => s.lists.length);
  if (!spaces.length) throw new Error(`${email}: Proje yok`);
  const ctx = {
    http,
    api,
    email,
    loginMs,
    spaces,
    items: [],
    statuses: {},
    convs: [],
    sprints: {},
  };
  const sp = pick(spaces);
  ctx.space = sp;
  ctx.listId = sp.lists[0].id;
  ctx.statuses[sp.id] = ((await http.get(api(`/spaces/${sp.id}`))).json?.statuses ?? []).map(
    (s) => s.id,
  );
  ctx.items = ((await http.get(api(`/lists/${ctx.listId}/items`))).json?.items ?? []).slice(0, 200);
  const cv = (await http.get(api('/conversations'))).json;
  ctx.convs = (cv?.conversations ?? (Array.isArray(cv) ? cv : [])).map((c) => c.id);
  const sprintsRes = (await http.get(api(`/spaces/${sp.id}/sprints`))).json;
  const sl = sprintsRes?.sprints ?? (Array.isArray(sprintsRes) ? sprintsRes : []);
  ctx.sprints = (sl ?? []).map((s) => s.id);
  ctx.activeSprint = (sl ?? []).find((s) => s.status === 'ACTIVE')?.id ?? ctx.sprints.at(-1);
  return ctx;
}

// Eylem karışımı (ağırlıklı). Okuma ≈ %88, yazma ≈ %12.
const ACTIONS = [
  ['oku: hierarchy', 5, (c) => c.http.get(c.api('/hierarchy'))],
  ['oku: bana atananlar', 8, (c) => c.http.get(c.api('/my-work?scope=assigned&includeDone=false'))],
  ['oku: liste/tablo', 14, (c) => c.http.get(c.api(`/lists/${c.listId}/items`))],
  ['oku: backlog', 8, (c) => c.http.get(c.api(`/spaces/${c.space.id}/backlog`))],
  [
    'oku: sprint board',
    12,
    (c) => c.activeSprint && c.http.get(c.api(`/sprints/${c.activeSprint}`)),
  ],
  ['oku: öğe detayı', 18, (c) => c.items.length && c.http.get(c.api(`/items/${pick(c.items).id}`))],
  [
    'oku: arama',
    4,
    (c) =>
      c.http.get(
        c.api(`/search?q=${pick(['g%C3%B6rev', 'hata', 'kullan%C4%B1c%C4%B1', 'rapor'])}`),
      ),
  ],
  ['oku: bildirimler', 5, (c) => c.http.get(c.api('/notifications'))],
  ['oku: konuşmalar', 3, (c) => c.http.get(c.api('/conversations'))],
  [
    'oku: mesaj dizisi',
    3,
    (c) => c.convs.length && c.http.get(c.api(`/conversations/${pick(c.convs)}/messages`)),
  ],
  ['oku: doküman listesi', 2, (c) => c.http.get(c.api(`/spaces/${c.space.id}/docs`))],
  [
    'oku: gantt/harita',
    2,
    (c) => c.http.get(c.api(`/spaces/${c.space.id}/${pick(['gantt', 'map', 'epics'])}`)),
  ],
  [
    'yaz: öğe oluştur',
    4,
    (c) =>
      c.http.post(c.api(`/lists/${c.listId}/items`), {
        type: 'TASK',
        title: `Yük görevi ${Date.now() % 1e6}`,
      }),
  ],
  [
    'yaz: durum değiştir',
    3,
    (c) => {
      if (!c.items.length) return null;
      const it = pick(c.items);
      return c.http.patch(c.api(`/items/${it.id}`), { statusId: pick(c.statuses[c.space.id]) });
    },
  ],
  [
    'yaz: yorum',
    3,
    (c) =>
      c.items.length &&
      c.http.post(c.api(`/items/${pick(c.items).id}/comments`), { body: doc('yük yorumu') }),
  ],
  [
    'yaz: mesaj',
    2,
    (c) =>
      c.convs.length &&
      c.http.post(c.api(`/conversations/${pick(c.convs)}/messages`), { body: 'yük mesajı' }),
  ],
  [
    'yaz: zaman kaydı',
    1,
    (c) =>
      c.items.length &&
      c.http.post(c.api(`/items/${pick(c.items).id}/time`), {
        day: '2026-11-12',
        minutes: 15,
        note: 'yük',
      }),
  ],
];
const TOTAL_W = ACTIONS.reduce((a, [, w]) => a + w, 0);
function chooseAction() {
  let r = Math.random() * TOTAL_W;
  for (const a of ACTIONS) if ((r -= a[1]) <= 0) return a;
  return ACTIONS[0];
}

async function vuLoop(ctx, deadline, sink) {
  let nextPoll = performance.now() + Math.random() * 30_000;
  while (performance.now() < deadline) {
    const [name, , fn] = chooseAction();
    let r;
    try {
      r = await fn(ctx);
    } catch (e) {
      r = { ok: false, status: 0, ms: 0, error: String(e.message) };
    }
    if (r)
      sink.push({
        name,
        ok: r.ok,
        status: r.status,
        ms: r.ms,
        server: r.serverMs,
        at: performance.now(),
      });
    // 30 sn'lik bildirim sorgulaması (arayüzdeki gibi).
    if (performance.now() > nextPoll) {
      const p = await ctx.http.get(ctx.api('/notifications/unread-count'));
      sink.push({
        name: 'sorgu: unread-count',
        ok: p.ok,
        status: p.status,
        ms: p.ms,
        server: p.serverMs,
        at: performance.now(),
      });
      nextPoll = performance.now() + 30_000;
    }
    await sleep(-Math.log(1 - Math.random()) * THINK * 1000); // üstel düşünme süresi
  }
}

// ---------- Basamaklar ----------
const pid = apiPid();
console.log(
  `API pid ${pid}; ${BASE}; havuz ${pool.length} kişi; basamaklar ${STEPS.join(',')}; ${SECS} sn; düşünme ${THINK} sn`,
);
const results = {
  label,
  takenAt: new Date().toISOString(),
  thinkSec: THINK,
  secs: SECS,
  steps: [],
};
let broken = false;

for (const N of STEPS) {
  if (broken && !KEEP_GOING) break;
  // Giriş fazı (argon2 CPU'ya bağlı): 12 eşzamanlı.
  const loginT0 = performance.now();
  const vus = [];
  let idx = 0;
  const loginErrors = [];
  await Promise.all(
    Array.from({ length: Math.min(12, N) }, async () => {
      while (idx < N) {
        const i = idx++;
        try {
          vus.push(await makeVu(i));
        } catch (e) {
          loginErrors.push(String(e.message).slice(0, 80));
        }
      }
    }),
  );
  const loginSec = (performance.now() - loginT0) / 1000;

  const sink = [];
  const rssSamples = [];
  const pgSamples = [];
  const sampler = setInterval(async () => {
    if (pid) rssSamples.push(rssMB(pid));
    pgSamples.push(await pgConns().catch(() => null));
  }, 3000);
  const t0 = performance.now();
  const deadline = t0 + SECS * 1000;
  await Promise.all(vus.map((v) => vuLoop(v, deadline, sink)));
  clearInterval(sampler);
  const wall = (performance.now() - t0) / 1000;
  const alive = (await new Http().get('/api/health')).ok;

  const reads = sink.filter((s) => s.name.startsWith('oku') || s.name.startsWith('sorgu'));
  const writes = sink.filter((s) => s.name.startsWith('yaz'));
  // 403/404 bir yetki sonucudur (ör. salt okunur kullanıcı yazamaz), sistem hatası değildir.
  const denied = sink.filter((s) => !s.ok && (s.status === 403 || s.status === 404));
  const errors = sink.filter((s) => !s.ok && s.status !== 403 && s.status !== 404);
  const byAction = {};
  for (const [name] of [...ACTIONS, ['sorgu: unread-count']]) {
    const rows = sink.filter((s) => s.name === name);
    if (rows.length)
      byAction[name] = { ...stats(rows.map((r) => r.ms)), err: rows.filter((r) => !r.ok).length };
  }
  const step = {
    vu: N,
    loggedIn: vus.length,
    loginErrors: loginErrors.length,
    loginErrorSamples: [...new Set(loginErrors)].slice(0, 3),
    loginPerSec: +(vus.length / loginSec).toFixed(1),
    requests: sink.length,
    rps: +(sink.length / wall).toFixed(1),
    denied: denied.length,
    errorRate: +((errors.length / Math.max(1, sink.length)) * 100).toFixed(2),
    errorSamples: [...new Set(errors.slice(0, 20).map((e) => `${e.name} → ${e.status}`))].slice(
      0,
      5,
    ),
    read: stats(reads.map((r) => r.ms)),
    write: stats(writes.map((r) => r.ms)),
    rssMB: { max: Math.max(0, ...rssSamples.filter(Boolean)) },
    pgActiveMax: Math.max(0, ...pgSamples.filter((x) => x != null)),
    alive,
    byAction,
  };
  step.broken = !alive || step.errorRate > 1 || (step.read.p95 ?? 0) > 2000 || vus.length < N * 0.9;
  results.steps.push(step);
  console.log(
    `VU ${String(N).padStart(4)} | giriş ${step.loginPerSec}/sn | ${step.rps} istek/sn | okuma p50 ${step.read.p50} p95 ${step.read.p95} p99 ${step.read.p99} ms | yazma p95 ${step.write.p95} ms | hata %${step.errorRate} | RSS ${step.rssMB.max} MB | PG aktif ${step.pgActiveMax}${step.broken ? '  ← KIRILMA' : ''}`,
  );
  if (step.broken) {
    broken = true;
    results.firstBreak ??= N;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
}
await pgc.end();
console.log(
  results.firstBreak ? `İlk kırılma: ${results.firstBreak} eşzamanlı kullanıcı` : 'Kırılma yok.',
);
console.log(`kaydedildi: ${out}`);
