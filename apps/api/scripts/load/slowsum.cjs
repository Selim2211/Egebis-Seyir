/* eslint-disable */
/** Yavaş sorgu logunu özetler: node scripts/load/slowsum.cjs <log> [kaç] */
const fs = require('node:fs');
const top = Number(process.argv[3] || 12);
const agg = new Map();
for (const line of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!line.includes('yavaş sorgu')) continue;
  let j;
  try {
    j = JSON.parse(line.slice(line.indexOf('{')));
  } catch {
    continue;
  }
  const q = j.query.replace(/\$\d+/g, '?').replace(/\s+/g, ' ').slice(0, 900);
  const a = agg.get(q) || { n: 0, total: 0, max: 0, params: j.params };
  a.n++;
  a.total += j.ms;
  a.max = Math.max(a.max, j.ms);
  agg.set(q, a);
}
const rows = [...agg].sort((a, b) => b[1].total - a[1].total).slice(0, top);
for (const [q, a] of rows)
  console.log(
    `\n### ${a.n} kez, toplam ${(a.total / 1000).toFixed(1)} sn, ort ${(a.total / a.n).toFixed(0)} ms, en çok ${a.max} ms\n${q}\nPARAMS ${a.params.slice(0, 300)}`,
  );
