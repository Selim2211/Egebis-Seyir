/* eslint-disable */
/**
 * CPU profili için API'yi (3200, yük DB'si) başlatır ve N saniye sonra düzgün çıkar; `node --cpu-prof`
 * çıkışta .cpuprofile yazar. Kullanım:
 *   node --cpu-prof --cpu-prof-dir=C:\dev\scrum-load\prof scripts/load/prof.cjs 45
 */
const { UPLOAD_DIR, loadDatabaseUrl } = require('./guard.cjs');
Object.assign(process.env, {
  NODE_ENV: 'production',
  PORT: '3200',
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
});
const secs = Number(process.argv[2] || 45);
require('../../dist/main.js');
setTimeout(() => process.exit(0), secs * 1000);
