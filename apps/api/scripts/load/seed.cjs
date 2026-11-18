/* eslint-disable */
/**
 * Yük testi veri üretici (docs/PERFORMANS-SINIRLARI.md). YALNIZCA `scrum_load` veritabanına yazar
 * (guard.cjs). Veri Postgres içinde `generate_series` ile üretilir; milyonlarca satır dakikalar içinde.
 *
 *   node scripts/load/seed.cjs --tier S|M|L
 *
 * Kademeler birikimlidir: M, S'nin üstüne yeni kişi/Proje ekleyerek M toplamına çıkar; L de M'nin.
 * Önkoşul: workspace kurulumu (bench.mjs setup) yapılmış olmalı. Kişilerin şifresi LOAD_PASSWORD.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { loadDatabaseUrl, req, API_DIR, UPLOAD_DIR } = require('./guard.cjs');
const { Client } = req('pg');
const { ranksAfter, DEFAULT_STATUSES } = req('@scrum/shared');
const { hashPassword } = require(path.join(API_DIR, 'dist/infra/security/password.js'));

const LOAD_PASSWORD = 'load-pass-123';
const DOMAIN = 'load.test';

/** Kademe hedefleri (toplam). */
const TIERS = {
  S: {
    users: 50,
    projects: 20,
    itemsPerProject: 1000,
    sprints: 12,
    conversations: 500,
    msgPerConv: 100,
    attachmentsPerProject: 100,
  },
  M: {
    users: 200,
    projects: 60,
    itemsPerProject: 2000,
    sprints: 26,
    conversations: 2000,
    msgPerConv: 100,
    attachmentsPerProject: 60,
  },
  // L (1 milyon öğe) kaldırıldı: gerçekçi olmayan bir hacim (karar: abartma). Gerekirse M'den sonra ayrıca düşünülür.
};

const ti = process.argv.indexOf('--tier');
const tierName = (ti >= 0 && process.argv[ti + 1]) || 'S';
const T = TIERS[tierName.toUpperCase()];
if (!T) throw new Error('--tier S|M');
if (!T) throw new Error('--tier S|M|L');

const t0 = Date.now();
const log = (msg) =>
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} sn] ${msg}`);
const RANKS = ranksAfter(null, 6000);

async function main() {
  const db = new Client({ connectionString: loadDatabaseUrl() });
  await db.connect();
  await db.query('SET synchronous_commit = off; SELECT setseed(0.42);');
  const q = (sql, params) => db.query(sql, params);

  const ws = (await q('SELECT id FROM workspaces ORDER BY "createdAt" LIMIT 1')).rows[0];
  if (!ws) throw new Error('Önce workspace kurulumu: node scripts/load/bench.mjs setup');
  const W = ws.id;
  const roles = Object.fromEntries(
    (await q('SELECT id, scope, key FROM roles WHERE "workspaceId" = $1', [W])).rows.map((r) => [
      `${r.scope}:${r.key}`,
      r.id,
    ]),
  );

  // ---------- Kişiler ----------
  const haveUsers = Number(
    (await q(`SELECT count(*) n FROM users WHERE email LIKE '%@${DOMAIN}'`)).rows[0].n,
  );
  const addUsers = Math.max(0, T.users - haveUsers);
  if (addUsers > 0) {
    const hash = await hashPassword(LOAD_PASSWORD);
    // Rol karışımı: %4 Admin, %80 Member, %10 Dış kaynak, %6 Guest.
    await q(
      `WITH u AS (
         INSERT INTO users (id, email, name, "passwordHash", "updatedAt", locale, "createdAt")
         SELECT gen_random_uuid(), 'u' || lpad(g::text, 5, '0') || '@${DOMAIN}', 'Yük Kişi ' || g, $2, now(), 'tr',
                now() - (random() * interval '700 days')
         FROM generate_series($3::int + 1, $3::int + $1::int) g
         RETURNING id, email)
       INSERT INTO memberships (id, "workspaceId", "userId", "roleId", "expiresAt")
       SELECT gen_random_uuid(), $4, u.id,
              CASE WHEN r < 0.04 THEN $5::uuid WHEN r < 0.84 THEN $6::uuid WHEN r < 0.94 THEN $7::uuid ELSE $8::uuid END,
              CASE WHEN r >= 0.84 AND r < 0.94 THEN now() + interval '90 days'
                   WHEN r >= 0.94 THEN now() + interval '30 days' END
       FROM (SELECT id, random() r FROM u) u`,
      [
        addUsers,
        hash,
        haveUsers,
        W,
        roles['WORKSPACE:ADMIN'],
        roles['WORKSPACE:MEMBER'],
        roles['WORKSPACE:GUEST'],
        roles['WORKSPACE:VIEWER'],
      ],
    );
    log(`kişi +${addUsers}`);
  }
  const people = (
    await q(
      `SELECT u.id, r.key FROM users u JOIN memberships m ON m."userId" = u.id JOIN roles r ON r.id = m."roleId"
     WHERE u.email LIKE '%@${DOMAIN}' ORDER BY u.email`,
    )
  ).rows;
  const insiders = people.filter((p) => p.key === 'MEMBER' || p.key === 'ADMIN').map((p) => p.id);
  const outsiders = people.filter((p) => p.key === 'GUEST' || p.key === 'VIEWER').map((p) => p.id);
  const allIds = people.map((p) => p.id);

  // Takımlar: 10 kişide bir.
  const haveTeams = Number(
    (await q('SELECT count(*) n FROM teams WHERE "workspaceId" = $1', [W])).rows[0].n,
  );
  const wantTeams = Math.floor(T.users / 10);
  if (wantTeams > haveTeams) {
    await q(
      `INSERT INTO teams (id, "workspaceId", name, color)
       SELECT gen_random_uuid(), $1, 'Yük Takımı ' || g, '#2563EB' FROM generate_series($2::int + 1, $3::int) g`,
      [W, haveTeams, wantTeams],
    );
    await q(
      `INSERT INTO team_members ("teamId", "userId", "workspaceId")
       SELECT t.id, ($2::uuid[])[1 + floor(random() * cardinality($2::uuid[]))::int], $1
       FROM teams t CROSS JOIN generate_series(1, 8) WHERE t."workspaceId" = $1
       ON CONFLICT DO NOTHING`,
      [W, insiders],
    );
    log(`takım ${wantTeams}`);
  }

  // ---------- Projeler ----------
  const haveProjects = Number(
    (await q(`SELECT count(*) n FROM spaces WHERE key LIKE 'L%' AND "workspaceId" = $1`, [W]))
      .rows[0].n,
  );
  for (let p = haveProjects + 1; p <= T.projects; p++) {
    await seedProject(q, { W, roles, insiders, outsiders, p, T });
    if (p % 10 === 0 || p === T.projects) log(`Proje ${p}/${T.projects}`);
  }

  // ---------- Mesajlar ----------
  const haveConv = Number(
    (await q('SELECT count(*) n FROM conversations WHERE "workspaceId" = $1', [W])).rows[0].n,
  );
  const addConv = Math.max(0, T.conversations - haveConv);
  if (addConv > 0) {
    await q('BEGIN');
    await q(
      `CREATE TEMP TABLE t_conv ON COMMIT DROP AS
       SELECT DISTINCT ON (lo, hi) gen_random_uuid() id, lo, hi FROM (
         SELECT LEAST(a, b) lo, GREATEST(a, b) hi FROM (
           SELECT ($1::uuid[])[1 + floor(random() * cardinality($1::uuid[]))::int] a,
                  ($1::uuid[])[1 + floor(random() * cardinality($1::uuid[]))::int] b
           FROM generate_series(1, $2::int * 3)) x WHERE a <> b) y
       WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c."workspaceId" = $3 AND c."userLowId" = lo AND c."userHighId" = hi)`,
      [insiders, addConv, W],
    );
    await q(`DELETE FROM t_conv WHERE id NOT IN (SELECT id FROM t_conv LIMIT $1)`, [addConv]);
    await q(
      `INSERT INTO conversations (id, "workspaceId", "userLowId", "userHighId", "lastMessageAt", "createdAt", "lastReadLowAt", "lastReadHighAt")
       SELECT id, $1, lo, hi, now() - random() * interval '20 days', now() - interval '400 days',
              now() - random() * interval '30 days', now() - random() * interval '30 days'
       FROM t_conv`,
      [W],
    );
    await q(
      `INSERT INTO messages (id, "workspaceId", "conversationId", body, "senderId", "createdAt")
       SELECT gen_random_uuid(), $1, c.id,
              'Mesaj ' || g || ': sprint planlaması, gözden geçirme ve dağıtım üzerine kısa bir not.',
              CASE WHEN g % 2 = 0 THEN c.lo ELSE c.hi END,
              now() - (($2::int - g) * interval '3 hours') - random() * interval '1 hour'
       FROM t_conv c CROSS JOIN generate_series(1, $2::int) g`,
      [W, T.msgPerConv],
    );
    await q('COMMIT');
    log(`konuşma +${addConv}, mesaj +${addConv * T.msgPerConv}`);
  }

  // Favoriler (kişi başına 3 Proje), hedefler.
  await q(
    `INSERT INTO favorites (id, "workspaceId", "userId", type, "entityId")
     SELECT gen_random_uuid(), $1, u, 'SPACE', s.id
     FROM unnest($2::uuid[]) u
     CROSS JOIN LATERAL (SELECT id FROM spaces WHERE "workspaceId" = $1 ORDER BY random() LIMIT 3) s
     ON CONFLICT DO NOTHING`,
    [W, insiders],
  );
  const haveGoals = Number(
    (await q('SELECT count(*) n FROM goals WHERE "workspaceId" = $1', [W])).rows[0].n,
  );
  const wantGoals = T.projects * 2;
  if (wantGoals > haveGoals) {
    await q(
      `INSERT INTO goals (id, "workspaceId", name, kind, "updatedAt", "ownerId", "dueDate")
       SELECT gen_random_uuid(), $1, 'Hedef ' || g, 'TASKS', now(), ($2::uuid[])[1 + (g % cardinality($2::uuid[]))], now() + interval '90 days'
       FROM generate_series($3::int + 1, $4::int) g`,
      [W, insiders, haveGoals, wantGoals],
    );
    await q(
      `INSERT INTO goal_items ("goalId", "workItemId", "workspaceId")
       SELECT g.id, w.id, $1 FROM goals g
       CROSS JOIN LATERAL (SELECT id FROM work_items WHERE "workspaceId" = $1 AND type = 'EPIC' ORDER BY random() LIMIT 5) w
       WHERE g."workspaceId" = $1 AND NOT EXISTS (SELECT 1 FROM goal_items gi WHERE gi."goalId" = g.id)
       ON CONFLICT DO NOTHING`,
      [W],
    );
    log(`hedef ${wantGoals}`);
  }

  log('VACUUM ANALYZE…');
  await q('VACUUM ANALYZE');
  const size = (await q('SELECT pg_size_pretty(pg_database_size(current_database())) s')).rows[0].s;
  log(`bitti: kademe ${tierName.toUpperCase()}, DB boyutu ${size}`);
  await db.end();
}

/** Bir Proje ve içindeki her şey. */
async function seedProject(q, { W, roles, insiders, outsiders, p, T }) {
  const P = T.itemsPerProject;
  const key = `L${p}`;
  const spaceId = crypto.randomUUID();
  // Üyeler: 12 iç kişi + 1 dış kaynak/guest.
  const pick = (arr, n) => {
    const out = new Set();
    while (out.size < Math.min(n, arr.length)) out.add(arr[Math.floor(Math.random() * arr.length)]);
    return [...out];
  };
  const members = pick(insiders, 12);
  const outs = pick(outsiders, 1);
  const po = members[0];
  const sm = members[1];

  await q('BEGIN');
  await q(
    `INSERT INTO spaces (id, "workspaceId", name, key, color, rank, "updatedAt", "scrumEnabled", "sprintLengthWeeks",
                         "createdById", "createdAt", "itemCounter", "productOwnerId", "scrumMasterId", description)
     VALUES ($1, $2, $3, $4, $5, $6, now(), true, 2, $7, now() - interval '800 days', $8, $9, $10, 'Yük testi Projesi')`,
    [
      spaceId,
      W,
      `Yük Projesi ${p}`,
      key,
      ['#7C3AED', '#2563EB', '#0E7490', '#CA8A04', '#DC2626'][p % 5],
      RANKS[p],
      po,
      P,
      po,
      sm,
    ],
  );
  await q(
    `INSERT INTO space_keys (id, "workspaceId", "spaceId", key) VALUES (gen_random_uuid(), $1, $2, $3)`,
    [W, spaceId, key],
  );
  await q(
    `INSERT INTO space_members (id, "workspaceId", "spaceId", "userId", "roleId", "outsourceAccess")
     SELECT gen_random_uuid(), $1, $2, u, CASE WHEN o THEN $4::uuid WHEN i < 3 THEN $3::uuid ELSE $4::uuid END,
            CASE WHEN o THEN '{"items":"WRITE","comments":"WRITE","docs":"READ","videos":"NONE","reports":"READ"}'::jsonb END
     FROM (SELECT u, false o, ord i FROM unnest($5::uuid[]) WITH ORDINALITY x(u, ord)
           UNION ALL SELECT u, true, 99 FROM unnest($6::uuid[]) u) m`,
    [W, spaceId, roles['SPACE:PROJECT_MANAGER'], roles['SPACE:PROJECT_MEMBER'], members, outs],
  );

  // Durumlar, liste/klasör, etiket, özel alan.
  const statusIds = DEFAULT_STATUSES.tr.map(() => crypto.randomUUID());
  for (const [i, s] of DEFAULT_STATUSES.tr.entries()) {
    await q(
      `INSERT INTO statuses (id, "workspaceId", "spaceId", name, color, category, rank) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [statusIds[i], W, spaceId, s.name, s.color, s.category, RANKS[i]],
    );
  }
  const folderId = crypto.randomUUID();
  await q(
    `INSERT INTO folders (id, "workspaceId", "spaceId", name, rank, "updatedAt") VALUES ($1,$2,$3,'Modüller',$4,now())`,
    [folderId, W, spaceId, RANKS[0]],
  );
  const listIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await q(
    `INSERT INTO lists (id, "workspaceId", "spaceId", name, rank, "updatedAt", "folderId")
     VALUES ($1,$4,$5,'Görevler',$6,now(),NULL), ($2,$4,$5,'Backend',$7,now(),$9), ($3,$4,$5,'Frontend',$8,now(),$9)`,
    [...listIds, W, spaceId, RANKS[0], RANKS[1], RANKS[2], folderId],
  );
  const labelIds = Array.from({ length: 6 }, () => crypto.randomUUID());
  await q(
    `INSERT INTO labels (id, "workspaceId", "spaceId", name, color)
     SELECT id, $1, $2, 'Etiket ' || ord, '#64748B' FROM unnest($3::uuid[]) WITH ORDINALITY x(id, ord)`,
    [W, spaceId, labelIds],
  );
  await q(
    `INSERT INTO custom_fields (id, "workspaceId", "spaceId", name, type, rank, "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, 'Müşteri', 'TEXT', $3, now()), (gen_random_uuid(), $1, $2, 'Maliyet', 'NUMBER', $4, now())`,
    [W, spaceId, RANKS[0], RANKS[1]],
  );
  await q(
    `INSERT INTO saved_views (id, "workspaceId", "listId", name, config, "updatedAt", "ownerId", shared)
     SELECT gen_random_uuid(), $1, l, 'Benim görünümüm', '{"filters":{}}'::jsonb, now(), $3, true FROM unnest($2::uuid[]) l`,
    [W, listIds, po],
  );

  // Sprint'ler: en eskiden yeniye; sonuncusu aktif.
  const K = T.sprints;
  await q(
    `CREATE TEMP TABLE t_sprint ON COMMIT DROP AS
     SELECT gen_random_uuid() id, k,
            (current_date - ((${K} - k) * 14 + 3))::date sd,
            (current_date - ((${K} - k) * 14 + 3) + 13)::date ed
     FROM generate_series(1, ${K}) k`,
  );
  await q(
    `INSERT INTO sprints (id, "workspaceId", "spaceId", name, "startDate", "endDate", "updatedAt", goal, status,
                          "startedAt", "completedAt", "createdById", "createdAt", "committedPoints", "completedPoints")
     SELECT id, $1, $2, 'Sprint ' || k, sd, ed, now(), 'Sprint hedefi ' || k,
            CASE WHEN k = ${K} THEN 'ACTIVE' ELSE 'COMPLETED' END::"SprintStatus",
            sd::timestamptz, CASE WHEN k < ${K} THEN ed::timestamptz END, $3, sd - 2, 40, CASE WHEN k < ${K} THEN 34 END
     FROM t_sprint`,
    [W, spaceId, sm],
  );

  // İş öğeleri. Tür: ilk E epik; sonra 8'lik bloklar: 0 Task (üst), 1-2 Sub-task, 3 Bug, 4-7 Task.
  const E = Math.max(4, Math.floor(P / 50));
  await q(
    `CREATE TEMP TABLE t_item ON COMMIT DROP AS
     SELECT gen_random_uuid() id, n,
       CASE WHEN n <= ${E} THEN 'EPIC' WHEN n % 8 IN (1, 2) AND n - (n % 8) > ${E} THEN 'SUBTASK'
            WHEN n % 8 = 3 THEN 'BUG' ELSE 'TASK' END::"WorkItemType" AS type,
       -- 3/4'ü bir sprint'e ait; yaşa göre dağılır.
       CASE WHEN random() < 0.75 THEN 1 + floor(random() * ${K})::int END AS sk,
       random() r, random() r2,
       ($1::uuid[])[1 + floor(random() * cardinality($1::uuid[]))::int] AS assignee,
       ($1::uuid[])[1 + floor(random() * cardinality($1::uuid[]))::int] AS reporter
     FROM generate_series(1, ${P}) n`,
    [members],
  );
  await q(
    `INSERT INTO work_items (id, "workspaceId", "spaceId", "listId", type, "keyPrefix", number, title, "statusId", rank,
       "updatedAt", "createdAt", priority, "reporterId", points, "estimateHours", "dueDate", "startDate", "completedAt",
       severity, "bugStatus", "sprintId", "backlogRank", description, "descriptionText", "customFields", goal)
     SELECT t.id, $1, $2, ($3::uuid[])[1 + (t.n % 3)], t.type, $4, t.n,
       (CASE t.type WHEN 'EPIC' THEN 'Epik ' WHEN 'BUG' THEN 'Hata: ' WHEN 'SUBTASK' THEN 'Alt görev ' ELSE 'Görev ' END)
         || t.n || ' — ödeme ekranında kart doğrulama ve raporlama akışı',
       ($5::uuid[])[CASE WHEN t.sk IS NOT NULL AND t.sk < ${K} THEN 5 WHEN t.sk = ${K} THEN 2 + floor(t.r * 4)::int
                         WHEN t.r < 0.3 THEN 5 ELSE 1 + floor(t.r * 2)::int END],
       ($6::text[])[1 + (t.n % 5900)], now() - t.r2 * interval '30 days',
       COALESCE(s.sd::timestamptz + t.r2 * interval '10 days', now() - (800 * t.r2) * interval '1 day'),
       (ARRAY['URGENT','HIGH','NORMAL','NORMAL','LOW'])[1 + (t.n % 5)]::"Priority",
       t.reporter,
       CASE WHEN t.type IN ('TASK','BUG') THEN (ARRAY[1,2,3,5,8,13])[1 + (t.n % 6)] END,
       CASE WHEN t.type = 'SUBTASK' THEN 1 + (t.n % 8) END,
       CASE WHEN t.n % 4 = 0 THEN current_date + (t.n % 60) - 20 END,
       CASE WHEN t.n % 4 = 0 THEN current_date + (t.n % 60) - 30 END,
       CASE WHEN (t.sk IS NOT NULL AND t.sk < ${K}) OR (t.sk IS NULL AND t.r < 0.3) THEN COALESCE(s.ed::timestamptz, now() - t.r2 * interval '200 days') END,
       CASE WHEN t.type = 'BUG' THEN (ARRAY['CRITICAL','MAJOR','MINOR','TRIVIAL'])[1 + (t.n % 4)]::"BugSeverity" END,
       CASE WHEN t.type = 'BUG' THEN 'ASSIGNED'::"BugStatus" END,
       CASE WHEN t.type IN ('TASK','BUG','SUBTASK') THEN s.id END,
       ($6::text[])[1 + (t.n % 5900)],
       jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
         jsonb_build_array(jsonb_build_object('type','text','text','Kullanıcı hikâyesi ' || t.n || ': kabul kriterleri, teknik notlar ve bağımlılıklar burada.'))))),
       'Kullanıcı hikâyesi ' || t.n || ': kabul kriterleri, teknik notlar ve bağımlılıklar burada.',
       '{}'::jsonb,
       CASE WHEN t.type = 'EPIC' THEN 'Epik hedefi ' || t.n END
     FROM t_item t LEFT JOIN t_sprint s ON s.k = t.sk`,
    [W, spaceId, listIds, key, statusIds, RANKS],
  );
  // Ağaç: Sub-task → bloğun Task'ı; Task/Bug'ların yarısı → bir epik.
  await q(
    `UPDATE work_items w SET "parentId" = p.id
     FROM t_item t JOIN t_item p ON p.n = CASE WHEN t.type = 'SUBTASK' THEN t.n - (t.n % 8) ELSE 1 + (t.n % ${E}) END
     WHERE w.id = t.id AND (t.type = 'SUBTASK' OR (t.type IN ('TASK','BUG') AND t.n % 2 = 0))`,
  );

  // Atanan, etiket, izleyici, kontrol listesi, bağlantı.
  await q(
    `INSERT INTO work_item_assignees ("workItemId", "userId", "workspaceId") SELECT id, assignee, $1 FROM t_item WHERE r < 0.9`,
    [W],
  );
  await q(
    `INSERT INTO work_item_labels ("workItemId", "labelId", "workspaceId")
     SELECT id, ($2::uuid[])[1 + (n % 6)], $1 FROM t_item WHERE n % 3 = 0`,
    [W, labelIds],
  );
  await q(
    `INSERT INTO work_item_watchers ("workItemId", "userId", "workspaceId")
     SELECT id, u, $1 FROM t_item, LATERAL (SELECT DISTINCT unnest(ARRAY[assignee, reporter]) u) x ON CONFLICT DO NOTHING`,
    [W],
  );
  await q(
    `CREATE TEMP TABLE t_check ON COMMIT DROP AS
     SELECT gen_random_uuid() cid, id item FROM t_item WHERE n % 10 = 0`,
  );
  await q(
    `INSERT INTO checklists (id, "workspaceId", "workItemId", kind, title, rank)
     SELECT cid, $1, item, 'ACCEPTANCE', 'Kabul kriterleri', $2 FROM t_check`,
    [W, RANKS[0]],
  );
  await q(
    `INSERT INTO checklist_items (id, "workspaceId", "checklistId", text, rank, done)
     SELECT gen_random_uuid(), $1, cid, 'Kriter ' || g, ($2::text[])[g], g = 1 FROM t_check CROSS JOIN generate_series(1, 3) g`,
    [W, RANKS],
  );
  await q(
    `INSERT INTO work_item_links (id, "workspaceId", "fromId", "toId", type, "createdById")
     SELECT gen_random_uuid(), $1, a.id, b.id, 'BLOCKS', a.reporter FROM t_item a JOIN t_item b ON b.n = a.n + 1
     WHERE a.n % 20 = 5 ON CONFLICT DO NOTHING`,
    [W],
  );

  // Yorumlar (öğe başına 3), anma ve tepkiler.
  await q(
    `CREATE TEMP TABLE t_comment ON COMMIT DROP AS
     SELECT gen_random_uuid() id, t.id item, g, ($1::uuid[])[1 + floor(random() * cardinality($1::uuid[]))::int] author,
            now() - random() * interval '400 days' made
     FROM t_item t CROSS JOIN generate_series(1, 3) g`,
    [members],
  );
  await q(
    `INSERT INTO comments (id, "workspaceId", body, "bodyText", "workItemId", "authorId", "createdAt")
     SELECT id, $1,
       jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
         jsonb_build_array(jsonb_build_object('type','text','text','Yorum ' || g || ': gözden geçirdim, testleri ekledim.'))))),
       'Yorum ' || g || ': gözden geçirdim, testleri ekledim.', item, author, made
     FROM t_comment`,
    [W],
  );
  await q(
    `INSERT INTO comment_mentions ("commentId", "userId", "workspaceId")
     SELECT id, ($2::uuid[])[1 + (g % cardinality($2::uuid[]))], $1 FROM t_comment WHERE g = 1 AND random() < 0.3 ON CONFLICT DO NOTHING`,
    [W, members],
  );
  await q(
    `INSERT INTO comment_reactions ("commentId", "userId", emoji, "workspaceId")
     SELECT id, ($2::uuid[])[1 + floor(random() * cardinality($2::uuid[]))::int], '👍', $1 FROM t_comment WHERE random() < 0.2
     ON CONFLICT DO NOTHING`,
    [W, members],
  );

  // Aktivite / denetim: öğe başına ~10 olay.
  await q(
    `INSERT INTO activity_events (id, "workspaceId", "entityType", "entityId", action, "actorId", changes, "createdAt")
     SELECT gen_random_uuid(), $1, 'item', t.id,
            CASE WHEN g = 1 THEN 'item.created' ELSE 'item.updated' END,
            ($2::uuid[])[1 + floor(random() * cardinality($2::uuid[]))::int],
            CASE WHEN g = 1 THEN jsonb_build_object('title', 'Görev ' || t.n)
                 ELSE jsonb_build_object('statusId', jsonb_build_object('from', ($3::uuid[])[1 + (g % 4)], 'to', ($3::uuid[])[1 + ((g + 1) % 5)])) END,
            now() - (800 - g * 10) * interval '1 day' * t.r2
     FROM t_item t CROSS JOIN generate_series(1, 10) g`,
    [W, members, statusIds],
  );

  // Zaman kayıtları (öğe başına 2), sprint olayları, burndown, retro.
  await q(
    `INSERT INTO time_entries (id, "workspaceId", "workItemId", "userId", day, minutes, source, note)
     SELECT gen_random_uuid(), $1, id, assignee, (current_date - floor(random() * 400)::int), 30 + floor(random() * 240)::int,
            CASE WHEN random() < 0.3 THEN 'TIMER' ELSE 'MANUAL' END::"TimeSource", 'çalışma'
     FROM t_item CROSS JOIN generate_series(1, 2) WHERE type <> 'EPIC'`,
    [W],
  );
  await q(
    `INSERT INTO sprint_item_events (id, "workspaceId", "sprintId", "workItemId", action, reason, points, "actorId", "createdAt")
     SELECT gen_random_uuid(), $1, s.id, t.id, 'ADDED', 'PLANNED', 3, $2, s.sd::timestamptz
     FROM t_item t JOIN t_sprint s ON s.k = t.sk`,
    [W, sm],
  );
  await q(
    `INSERT INTO sprint_snapshots (id, "workspaceId", "sprintId", date, "totalPoints", "donePoints", "remainingPoints", "totalItems", "doneItems", "updatedAt")
     SELECT gen_random_uuid(), $1, s.id, s.sd + d, 40, LEAST(40, d * 3), GREATEST(0, 40 - d * 3), 20, LEAST(20, d * 2), now()
     FROM t_sprint s CROSS JOIN generate_series(0, 13) d WHERE s.sd + d <= current_date`,
    [W],
  );
  await q(
    `CREATE TEMP TABLE t_retro ON COMMIT DROP AS
     SELECT gen_random_uuid() id, s.id sprint, g FROM t_sprint s CROSS JOIN generate_series(1, 8) g WHERE s.k < ${K}`,
  );
  await q(
    `INSERT INTO retro_items (id, "workspaceId", "sprintId", "column", text, "authorId")
     SELECT id, $1, sprint, (ARRAY['WENT_WELL','IMPROVE','ACTION'])[1 + (g % 3)]::"RetroColumn", 'Retro maddesi ' || g,
            ($2::uuid[])[1 + (g % cardinality($2::uuid[]))]
     FROM t_retro`,
    [W, members],
  );
  await q(
    `INSERT INTO retro_votes ("retroItemId", "userId", "workspaceId")
     SELECT id, ($2::uuid[])[1 + ((g + v) % cardinality($2::uuid[]))], $1 FROM t_retro CROSS JOIN generate_series(1, 2) v ON CONFLICT DO NOTHING`,
    [W, members],
  );

  // Bildirimler (öğe başına ~5; %20 okunmamış), hatırlatıcılar, gelen e-posta (Bug'ların %20'si).
  await q(
    `INSERT INTO notifications (id, "workspaceId", "userId", type, "spaceId", data, "actorId", "workItemId", "readAt", "createdAt")
     SELECT gen_random_uuid(), $1, ($3::uuid[])[1 + floor(random() * cardinality($3::uuid[]))::int],
            (ARRAY['ASSIGNED','COMMENTED','STATUS_CHANGED','MENTIONED'])[1 + (g % 4)]::"NotificationType", $2,
            jsonb_build_object('title', 'Görev ' || t.n), t.reporter, t.id,
            CASE WHEN random() < 0.8 THEN now() - random() * interval '300 days' END,
            now() - random() * interval '400 days'
     FROM t_item t CROSS JOIN generate_series(1, 5) g`,
    [W, spaceId, members],
  );
  await q(
    `INSERT INTO reminders (id, "workspaceId", "userId", "workItemId", "remindAt", note)
     SELECT gen_random_uuid(), $1, assignee, id, now() + (n % 30) * interval '1 day', 'Hatırlat' FROM t_item WHERE n % 100 = 0`,
    [W],
  );
  await q(
    `INSERT INTO inbound_emails (id, "workspaceId", "workItemId", kind, "messageId", "fromName", "fromEmail", subject, "receivedAt")
     SELECT gen_random_uuid(), $1, id, 'NEW', '<load-' || id || '@load.test>', 'Müşteri', 'musteri@load.test', 'Hata bildirimi ' || n, now() - random() * interval '300 days'
     FROM t_item WHERE type = 'BUG' AND n % 5 = 0`,
    [W],
  );

  // Dokümanlar (öğe/20), sürümler, iş bağları.
  await q(
    `CREATE TEMP TABLE t_doc ON COMMIT DROP AS SELECT gen_random_uuid() id, g FROM generate_series(1, ${Math.ceil(P / 20)}) g`,
  );
  await q(
    `INSERT INTO docs (id, "workspaceId", "spaceId", title, rank, "updatedAt", content, "plainText", revision, "createdById", "updatedById", "createdAt")
     SELECT id, $1, $2, 'Doküman ' || g, ($3::text[])[g],
            now() - random() * interval '100 days',
            jsonb_build_object('type','doc','content', jsonb_build_array(jsonb_build_object('type','paragraph','content',
              jsonb_build_array(jsonb_build_object('type','text','text', repeat('Mimari karar ve süreç açıklaması. ', 40)))))),
            repeat('Mimari karar ve süreç açıklaması. ', 40), 3, $4, $4, now() - interval '300 days'
     FROM t_doc`,
    [W, spaceId, RANKS, po],
  );
  await q(
    `INSERT INTO doc_versions (id, "workspaceId", "docId", version, title, "authorId")
     SELECT gen_random_uuid(), $1, id, v, 'Doküman ' || g, $2 FROM t_doc CROSS JOIN generate_series(1, 2) v`,
    [W, po],
  );
  await q(
    `INSERT INTO doc_item_links ("workspaceId", "docId", "workItemId", "createdById")
     SELECT $1, d.id, t.id, $2 FROM t_doc d JOIN t_item t ON t.n = d.g * 7 ON CONFLICT DO NOTHING`,
    [W, po],
  );

  // Ekler: gerçek dosyalar (5–60 KB) diskte.
  const att = (
    await q(
      `INSERT INTO attachments (id, "workspaceId", "fileName", "mimeType", size, "storageKey", "workItemId", "uploaderId")
     SELECT gen_random_uuid(), $1, 'ek-' || n || '.bin', 'application/octet-stream', 0, $2::text || '/' || gen_random_uuid()::text, id, reporter
     FROM t_item WHERE n % ${Math.max(1, Math.floor(P / T.attachmentsPerProject))} = 0
     RETURNING id, "storageKey"`,
      [W, W],
    )
  ).rows;
  await q('COMMIT');
  for (const a of att) {
    const bytes = crypto.randomBytes(5 * 1024 + Math.floor(Math.random() * 55 * 1024));
    const file = path.join(UPLOAD_DIR, a.storageKey);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    a.size = bytes.length;
  }
  if (att.length) {
    await q(
      `UPDATE attachments a SET size = x.size FROM unnest($1::uuid[], $2::int[]) x(id, size) WHERE a.id = x.id`,
      [att.map((a) => a.id), att.map((a) => a.size)],
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
