/* eslint-disable */
/** .cpuprofile özeti: kendi süresi (self time) en yüksek fonksiyonlar. node profsum.cjs <dosya> [kaç] */
const fs = require('node:fs');
const file = process.argv[2];
const top = Number(process.argv[3] || 25);
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = prof.timeDeltas;
prof.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
const total = [...self.values()].reduce((a, b) => a + b, 0);
const agg = new Map();
for (const [id, us] of self) {
  const n = nodes.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || '(anonim)'}  ${f.url.replace(/^.*[\\/](node_modules|dist)[\\/]/, '$1/')}:${f.lineNumber + 1}`;
  agg.set(key, (agg.get(key) || 0) + us);
}
const rows = [...agg].sort((a, b) => b[1] - a[1]).slice(0, top);
console.log(`toplam örneklenen süre: ${(total / 1000).toFixed(0)} ms`);
const idle = [...agg].find(([k]) => k.startsWith('(idle)'))?.[1] ?? 0;
console.log(
  `boşta: ${((idle / total) * 100).toFixed(1)}%  meşgul: ${(((total - idle) / total) * 100).toFixed(1)}%`,
);
for (const [k, us] of rows)
  console.log(
    `${String((us / 1000).toFixed(0)).padStart(8)} ms  ${((us / total) * 100).toFixed(1).padStart(5)}%  ${k}`,
  );
