/* eslint-disable */
/** Yük DB'sinde aday sorguların planı: node scripts/load/explain.cjs */
const { loadDatabaseUrl, req } = require('./guard.cjs');
const { Client } = req('pg');

(async () => {
  const c = new Client({ connectionString: loadDatabaseUrl() });
  await c.connect();
  const conv = (
    await c.query(
      `SELECT "conversationId" AS id, count(*) n FROM messages GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
    )
  ).rows[0];
  const ws = (await c.query(`SELECT id FROM workspaces LIMIT 1`)).rows[0].id;
  const list = (
    await c.query(`SELECT "listId" id FROM work_items GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`)
  ).rows[0].id;
  const ids = (
    await c.query(`SELECT id FROM work_items WHERE "listId"=$1 LIMIT 400`, [list])
  ).rows.map((r) => r.id);
  const since = new Date(Date.now() - 864e5);
  const zero = '00000000-0000-0000-0000-000000000000';
  const Q = [
    [
      'mesaj okunmamış sayısı',
      `SELECT count(*) FROM messages WHERE "conversationId"=$1 AND "senderId"<>$2 AND "deletedAt" IS NULL AND "createdAt">$3 AND "workspaceId"=$4`,
      [conv.id, zero, since, ws],
    ],
    [
      'mesaj son kayıt',
      `SELECT id FROM messages WHERE "conversationId"=$1 AND "deletedAt" IS NULL AND "workspaceId"=$2 ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [conv.id, ws],
    ],
    [
      'liste öğeleri (5000)',
      `SELECT * FROM work_items WHERE "listId"=$1 AND "deletedAt" IS NULL AND "workspaceId"=$2 ORDER BY rank LIMIT 5000`,
      [list, ws],
    ],
    [
      'alt görevler (parentId IN)',
      `SELECT id FROM work_items WHERE type='SUBTASK' AND "deletedAt" IS NULL AND "parentId" = ANY($1)`,
      [ids],
    ],
    [
      'atananlar (workItemId IN)',
      `SELECT "workItemId","userId" FROM work_item_assignees WHERE "workItemId" = ANY($1)`,
      [ids],
    ],
  ];
  console.log(`en büyük konuşma ${conv.n} mesaj`);
  for (const [name, sql, params] of Q) {
    const r = await c.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, params);
    const lines = r.rows.map((x) => x['QUERY PLAN']);
    console.log(
      `\n== ${name}\n` +
        lines
          .filter((l) => /Scan|Execution|Sort|Index Cond|Filter/.test(l))
          .slice(0, 7)
          .join('\n'),
    );
  }
  const ix = await c.query(
    `SELECT indexdef FROM pg_indexes WHERE tablename IN ('messages','sessions','conversation_members') ORDER BY 1`,
  );
  console.log(
    '\n' + ix.rows.map((r) => r.indexdef.replace(/CREATE (UNIQUE )?INDEX /, '$1')).join('\n'),
  );
  await c.end();
})();
