/* eslint-disable */
/** Yük DB'sinde tablo bazında sıralı tarama (seq scan) / indeks kullanımı. node scripts/load/scans.cjs */
const { loadDatabaseUrl, req } = require('./guard.cjs');
const { Client } = req('pg');
(async () => {
  const c = new Client({ connectionString: loadDatabaseUrl() });
  await c.connect();
  const r = await c.query(`
    SELECT relname AS tablo, n_live_tup AS satir, seq_scan, seq_tup_read,
           coalesce(idx_scan,0) AS idx_scan,
           round(seq_tup_read::numeric / greatest(seq_scan,1)) AS tarama_basi_satir
    FROM pg_stat_user_tables WHERE n_live_tup > 1000
    ORDER BY seq_tup_read DESC LIMIT 20`);
  console.table(r.rows);
  await c.end();
})();
