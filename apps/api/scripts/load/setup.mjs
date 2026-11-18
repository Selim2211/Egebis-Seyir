/** Yük workspace'ini kurar: owner@load.test (Super Admin). Kullanım: node scripts/load/setup.mjs */
import { Http, OWNER, BASE } from './lib.mjs';

const http = new Http();
await http.prime();
const status = await http.get('/api/setup/status');
if (!status.json.needsSetup) {
  console.log(`kurulum zaten yapılmış (${BASE})`);
  process.exit(0);
}
const r = await http.post('/api/setup', {
  workspaceName: 'Yük Testi Kurumu',
  name: OWNER.name,
  email: OWNER.email,
  password: OWNER.password,
  locale: 'tr',
});
console.log(r.ok ? `kuruldu: ${OWNER.email}` : `HATA ${r.status} ${JSON.stringify(r.json)}`);
process.exit(r.ok ? 0 : 1);
