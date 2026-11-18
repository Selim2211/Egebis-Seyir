/* eslint-disable */
/**
 * Yük testi veritabanı yönetimi. Kullanım (apps/api klasöründen):
 *   node scripts/load/db.cjs create          → scrum_load'u açar ve migration'ları uygular
 *   node scripts/load/db.cjs size            → DB ve en büyük tabloların boyutu
 *   node scripts/load/db.cjs snapshot <dosya>→ scrum_dev tablolarının satır sayıları (SALT OKUNUR)
 *   node scripts/load/db.cjs compare <a> <b> → iki anlık görüntüyü karşılaştırır
 *   node scripts/load/db.cjs drop            → scrum_load'u tamamen siler (çöp kalmaz)
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { API_DIR, LOAD_DB, withDb, loadDatabaseUrl, req, UPLOAD_DIR } = require('./guard.cjs');
const { Client } = req('pg');

async function withClient(url, fn) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function create() {
  const loadUrl = loadDatabaseUrl();
  await withClient(withDb('postgres'), async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [LOAD_DB]);
    if (!rowCount) {
      await c.query(`CREATE DATABASE ${LOAD_DB}`);
      console.log(`oluşturuldu: ${LOAD_DB}`);
    } else console.log(`zaten var: ${LOAD_DB}`);
  });
  execSync('pnpm exec prisma migrate deploy', {
    cwd: API_DIR,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: loadUrl },
  });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function size() {
  await withClient(loadDatabaseUrl(), async (c) => {
    const db = await c.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS s');
    console.log(`DB boyutu: ${db.rows[0].s}`);
    const t = await c.query(`
      SELECT relname AS table, n_live_tup AS rows,
             pg_size_pretty(pg_total_relation_size(relid)) AS size
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25`);
    console.table(t.rows);
  });
}

/** scrum_dev: her tablonun TAM satır sayısı (count(*)). Yalnızca okur. */
async function snapshot(file) {
  const out = await withClient(withDb('scrum_dev'), async (c) => {
    await c.query('SET default_transaction_read_only = on');
    const tables = await c.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const counts = {};
    for (const { tablename } of tables.rows) {
      const r = await c.query(`SELECT count(*)::bigint AS n FROM "${tablename}"`);
      counts[tablename] = Number(r.rows[0].n);
    }
    return { takenAt: new Date().toISOString(), database: 'scrum_dev', counts };
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`anlık görüntü: ${file} (${Object.keys(out.counts).length} tablo)`);
}

function compare(a, b) {
  const A = JSON.parse(fs.readFileSync(a, 'utf8')).counts;
  const B = JSON.parse(fs.readFileSync(b, 'utf8')).counts;
  const names = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  const diff = names
    .filter((n) => A[n] !== B[n])
    .map((n) => ({ table: n, before: A[n], after: B[n] }));
  if (diff.length === 0) console.log(`scrum_dev DEĞİŞMEDİ: ${names.length} tablonun hepsi aynı.`);
  else {
    console.log('scrum_dev FARKLI:');
    console.table(diff);
    process.exitCode = 1;
  }
}

async function drop() {
  loadDatabaseUrl(); // kilit: hedef adı scrum_load olmalı
  await withClient(withDb('postgres'), async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${LOAD_DB} WITH (FORCE)`);
    const { rowCount } = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [LOAD_DB]);
    console.log(rowCount ? `HATA: ${LOAD_DB} hâlâ var` : `silindi: ${LOAD_DB}`);
  });
  fs.rmSync(path.dirname(UPLOAD_DIR), { recursive: true, force: true });
  console.log(`silindi: ${path.dirname(UPLOAD_DIR)}`);
}

const [cmd, ...args] = process.argv.slice(2);
const run = {
  create,
  size,
  snapshot: () => snapshot(args[0]),
  compare: () => compare(args[0], args[1]),
  drop,
}[cmd];
if (!run) {
  console.error('komut: create | size | snapshot <dosya> | compare <a> <b> | drop');
  process.exit(2);
}
Promise.resolve(run()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
