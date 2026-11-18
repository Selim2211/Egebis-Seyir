/* eslint-disable */
/**
 * Yük testi için ayrı API örneği (3200). Production derlemesi (`dist`), bellek profili seçilebilir:
 *   node scripts/load/api.cjs [heapMB]     (varsayılan 384 = Oracle eşdeğeri)
 * Dev API'ye (3000) ve dev veritabanına dokunmaz.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { API_DIR, UPLOAD_DIR, loadDatabaseUrl } = require('./guard.cjs');

const heap = process.argv[2] || '384';
// Çok süreçli deney için port seçilebilir (3200–3209); varsayılan 3200.
const port = process.argv[3] || '3200';
if (!/^320[0-9]$/.test(port)) throw new Error('KİLİT: yük API portu 3200–3209 olmalı');
const child = spawn(process.execPath, [`--max-old-space-size=${heap}`, 'dist/main.js'], {
  cwd: API_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    DATABASE_URL: loadDatabaseUrl(),
    APP_URL: 'http://127.0.0.1:5180',
    COOKIE_SECURE: 'false',
    AUTH_RATE_LIMIT: '1000000',
    MAIL_TRANSPORT: 'memory',
    QUEUE_ENABLED: 'false',
    LOG_LEVEL: 'warn',
    UPLOAD_DIR,
    TICKET_AI_ENABLED: 'false',
    TICKET_IMAP_HOST: '',
    SETTINGS_SECRET: 'load-test-secret-0123456789',
  },
});
console.log(`yük API'si başladı: pid ${child.pid}, heap ${heap} MB, port ${port}`);
child.on('exit', (code) => process.exit(code ?? 0));
