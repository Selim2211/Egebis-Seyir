/**
 * Yük testi için küçük yuvarlak-robin ters vekil (Caddy'nin rolü). 3200'de dinler, 3201.. örneklerine dağıtır.
 *   node scripts/load/proxy.mjs 3201,3202,3203
 */
import http from 'node:http';

const targets = (process.argv[2] || '3201').split(',').map(Number);
if (targets.some((p) => p < 3201 || p > 3209)) throw new Error('KİLİT: hedefler 3201–3209 olmalı');
const agent = new http.Agent({ keepAlive: true, maxSockets: 512 });
let i = 0;
http
  .createServer((req, res) => {
    const port = targets[i++ % targets.length];
    const up = http.request(
      { host: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers, agent },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  })
  .listen(3200, '127.0.0.1', () => console.log(`vekil 3200 → ${targets.join(',')}`));
