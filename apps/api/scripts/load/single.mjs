/**
 * A) Tek istek gecikmesi: her uç nokta soğuk (ilk) + 8 sıcak çağrı, iki kişiyle (Super Admin ve sıradan
 * üye). Çıktı: docs/perf/2026-11/single-<etiket>.json ve konsol tablosu.
 *   node scripts/load/single.mjs <etiket>      (örn. S-384)
 */
import fs from 'node:fs';
import path from 'node:path';
import { Http, OWNER, stats } from './lib.mjs';

const label = process.argv[2] || 'S';
const WARM = 8;
const out = path.resolve(
  import.meta.dirname,
  '../../../../docs/perf/2026-11',
  `single-${label}.json`,
);

const owner = new Http();
await owner.login(OWNER.email);
const me = await owner.get('/api/auth/me');
const ws = me.json.workspaces[0].id;
const api = (p) => `/api/workspaces/${ws}${p}`;

const tree = (await owner.get(api('/hierarchy'))).json;
const space = tree.spaces[0];
const spaceId = space.id;
const listId = space.lists[0].id;
const sprints = (await owner.get(api(`/spaces/${spaceId}/sprints`))).json;
const sprintList = sprints.sprints ?? sprints;
const active = sprintList.find((s) => s.status === 'ACTIVE') ?? sprintList.at(-1);
const itemsPage = (await owner.get(api(`/lists/${listId}/items`))).json;
const itemId = (itemsPage.items ?? itemsPage)[0].id;
const docs = (await owner.get(api(`/spaces/${spaceId}/docs`))).json;
const docId = (docs.docs ?? docs)[0]?.id;
const convs = (await owner.get(api('/conversations'))).json;
const convId = (convs.conversations ?? convs)[0]?.id;
const members = (await owner.get(api(`/spaces/${spaceId}/members`))).json.members;
const memberEmail = (await owner.get(api('/members'))).json.members.find(
  (m) => m.userId === members[3].userId,
)?.email;
const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const to = new Date().toISOString().slice(0, 10);

const probes = [
  ['hierarchy (ağaç)', api('/hierarchy')],
  ['my-work (bana atananlar)', api('/my-work?scope=assigned&includeDone=false')],
  ['activity (son aktivite)', api('/activity?limit=30')],
  ['audit (denetim)', api('/audit?limit=50')],
  ['notifications (liste)', api('/notifications')],
  ['notifications unread-count', api('/notifications/unread-count')],
  ['conversations (liste)', api('/conversations')],
  ['messages (dizi)', convId && api(`/conversations/${convId}/messages`)],
  ['search ("görev")', api('/search?q=g%C3%B6rev')],
  ['liste/tablo (lists/:id/items)', api(`/lists/${listId}/items`)],
  ['space items (spaces/:id/items)', api(`/spaces/${spaceId}/items`)],
  ['backlog', api(`/spaces/${spaceId}/backlog`)],
  ['kanban', api(`/spaces/${spaceId}/kanban`)],
  ['sprint listesi', api(`/spaces/${spaceId}/sprints`)],
  ['sprint detayı (board)', active && api(`/sprints/${active.id}`)],
  ['sprint burndown', active && api(`/sprints/${active.id}/burndown`)],
  ['gantt', api(`/spaces/${spaceId}/gantt`)],
  ['proje haritası', api(`/spaces/${spaceId}/map`)],
  ['epikler', api(`/spaces/${spaceId}/epics`)],
  ['doküman listesi', api(`/spaces/${spaceId}/docs`)],
  ['doküman detayı', docId && api(`/docs/${docId}`)],
  ['öğe detayı', api(`/items/${itemId}`)],
  ['flow raporu (proje)', api(`/spaces/${spaceId}/flow`)],
  ['workload (proje)', api(`/spaces/${spaceId}/workload`)],
  ['timesheet (proje)', api(`/spaces/${spaceId}/timesheet`)],
  ['workload (genel)', api('/workload')],
  ['admin overview', api('/admin/overview')],
  ['analiz: people', api(`/analytics/people?from=${from}&to=${to}`)],
  ['analiz: quality', api(`/analytics/quality?from=${from}&to=${to}`)],
  ['analiz: flow', api(`/analytics/flow?from=${from}&to=${to}`)],
  ['analiz: capacity', api(`/analytics/capacity?from=${from}&to=${to}`)],
  ['analiz: forecast', api('/analytics/forecast')],
  ['analiz: sprints', api('/analytics/sprints')],
  ['analiz: project', api(`/analytics/project/${spaceId}?from=${from}&to=${to}`)],
  ['analiz: digest', api('/analytics/digest')],
].filter(([, p]) => p);

async function run(http, who) {
  const rows = [];
  for (const [name, p] of probes) {
    const cold = await http.get(p);
    const warm = [];
    const server = [];
    for (let i = 0; i < WARM; i++) {
      const r = await http.get(p);
      if (r.ok) {
        warm.push(r.ms);
        if (r.serverMs != null) server.push(r.serverMs);
      }
    }
    rows.push({
      who,
      endpoint: name,
      status: cold.status,
      bytesKB: +(cold.bytes / 1024).toFixed(1),
      coldMs: +cold.ms.toFixed(1),
      warm: stats(warm),
      server: server.length ? stats(server) : null,
    });
  }
  return rows;
}

const all = [...(await run(owner, 'SuperAdmin'))];
if (memberEmail) {
  const member = new Http();
  await member.login(memberEmail);
  all.push(...(await run(member, 'Üye')));
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ label, takenAt: new Date().toISOString(), rows: all }, null, 2),
);
console.table(
  all.map((r) => ({
    kim: r.who,
    uç: r.endpoint,
    http: r.status,
    KB: r.bytesKB,
    soğuk: r.coldMs,
    p50: r.warm.p50,
    p95: r.warm.p95,
    sunucu_p50: r.server?.p50 ?? '',
  })),
);
console.log(`kaydedildi: ${out}`);
