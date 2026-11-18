/* eslint-disable */
/**
 * Yük testi arayüzü: web geliştirme sunucusunu 5180'de, yük API'sine (3200) bağlı açar.
 * Dev web (5173) ve dev API (3000) etkilenmez. Kullanım: node apps/api/scripts/load/web.cjs
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const webDir = path.resolve(__dirname, '../../../web');
const child = spawn('pnpm', ['exec', 'vite', '--port', '5180', '--strictPort'], {
  cwd: webDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, API_PROXY_TARGET: 'http://127.0.0.1:3200' },
});
child.on('exit', (code) => process.exit(code ?? 0));
