/* eslint-disable */
/**
 * Yük testi güvenlik kilidi (docs/PERFORMANS-SINIRLARI.md). Yük betikleri YALNIZCA yerel
 * `scrum_load` veritabanına ve 3200 portundaki ayrı API'ye dokunabilir. Dev veritabanı
 * (`scrum_dev`), test veritabanları, Oracle ve ofis sunucusu kesinlikle reddedilir.
 */
const fs = require('node:fs');
const path = require('node:path');

const API_DIR = path.resolve(__dirname, '../..');
const LOAD_DB = 'scrum_load';
const LOAD_API = 'http://127.0.0.1:3200';
const LOAD_WEB = 'http://127.0.0.1:5180';
const UPLOAD_DIR = 'C:\\dev\\scrum-load\\uploads';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** apps/api/.env içinden bir değişkeni okur (dotenv'e gerek yok). */
function envValue(name) {
  if (process.env[name]) return process.env[name];
  const file = path.join(API_DIR, '.env');
  if (!fs.existsSync(file)) return undefined;
  const line = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line
    ? line
        .slice(name.length + 1)
        .trim()
        .replace(/^"|"$/g, '')
    : undefined;
}

/** Dev bağlantısının kimlik bilgileriyle, veritabanı adı `dbName` olan URL. */
function withDb(dbName) {
  const dev = envValue('DATABASE_URL');
  if (!dev) throw new Error('apps/api/.env içinde DATABASE_URL yok.');
  const url = new URL(dev);
  url.pathname = `/${dbName}`;
  url.search = '';
  return url.toString();
}

function assertLoadUrl(raw) {
  const url = new URL(raw);
  const db = url.pathname.replace(/^\//, '');
  if (db !== LOAD_DB) {
    throw new Error(
      `KİLİT: yük testi yalnızca '${LOAD_DB}' veritabanında çalışır (verilen: '${db}').`,
    );
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `KİLİT: yük testi yalnızca yerel Postgres'te çalışır (verilen: ${url.hostname}).`,
    );
  }
  return raw;
}

function assertLoadApi(raw) {
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== '3200') {
    throw new Error(
      `KİLİT: yük yalnızca yerel 3200 portundaki ayrı API'ye gönderilir (verilen: ${raw}).`,
    );
  }
  return raw.replace(/\/$/, '');
}

/** Kilitli yük veritabanı URL'i. LOAD_DATABASE_URL verilirse o da denetlenir. */
function loadDatabaseUrl() {
  return assertLoadUrl(process.env.LOAD_DATABASE_URL || withDb(LOAD_DB));
}

/** Derlenmiş API köküne göre modül yükler (Prisma client, pg, @scrum/shared). */
const req = (m) => {
  try {
    return require(require.resolve(m, { paths: [API_DIR] }));
  } catch {
    // pnpm: `pg` doğrudan bağımlılık değil, Prisma'nın pg bağdaştırıcısının yanında durur.
    const adapter = path.dirname(require.resolve('@prisma/adapter-pg', { paths: [API_DIR] }));
    return require(require.resolve(m, { paths: [adapter] }));
  }
};

module.exports = {
  API_DIR,
  LOAD_DB,
  LOAD_API,
  LOAD_WEB,
  UPLOAD_DIR,
  envValue,
  withDb,
  assertLoadUrl,
  assertLoadApi,
  loadDatabaseUrl,
  req,
};
