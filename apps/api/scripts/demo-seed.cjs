/* eslint-disable */
/**
 * Demo verisi: yönetici paneli ve Analiz ekranlarını incelemek için gerçekçi ama uydurma veri.
 * - 9 demo kişi (giriş yapamaz: rastgele, saklanmayan şifre; e-posta .invalid uzantılı → hiçbir yere posta gitmez)
 * - 4 Scrum Projesi, Epic/Task/Sub-Task/Bug, ~18 haftalık geçmiş sprint'ler + aktif sprint
 * - Durum geçişleri (activity_events), sprint üyelik geçmişi, burndown anlık görüntüleri, zaman kayıtları
 * Mevcut kurulumun (Owner, ayarlar) üstüne eklenir. Demo Projeleri varsa durur.
 *
 * Çalıştırma (derlenmiş API klasöründe, DATABASE_URL ortamda):
 *   node scripts/demo-seed.cjs            → ekle
 *   node scripts/demo-seed.cjs --remove   → yalnızca demo verisini sil
 * APP_DIR: derlenmiş API kökü (dist/ ve node_modules/ içeren; varsayılan: betiğin üst klasörü).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const APP = process.env.APP_DIR || path.resolve(__dirname, '..');
const req = (m) => require(require.resolve(m, { paths: [APP] }));
const { PrismaClient } = require(path.join(APP, 'dist/generated/prisma/client.js'));
const { PrismaPg } = req('@prisma/adapter-pg');
const { hashPassword } = require(path.join(APP, 'dist/infra/security/password.js'));
const { ranksAfter, DEFAULT_STATUSES, DEFAULT_LIST_NAME } = req('@scrum/shared');

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const DOMAIN = 'demo.seyir.invalid';
const DAY = 86_400_000;

// ---------- Belirlenimci rastgelelik ----------
let seedState = 20261030;
const rnd = () => {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const chance = (p) => rnd() < p;
const uuid = () => crypto.randomUUID();
const day0 = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
/** İş saatine (Istanbul 09:00–18:00 ≈ 06–15 UTC) denk gelen an. */
const workTime = (d) => {
  const t = day0(d);
  let w = t.getUTCDay();
  let x = t;
  if (w === 6) x = addDays(t, 2);
  if (w === 0) x = addDays(t, 1);
  return new Date(x.getTime() + (6 + rnd() * 9) * 3_600_000);
};

const NOW = new Date();
const TODAY = day0(NOW);

// ---------- Kişiler ----------
const PEOPLE = [
  { name: 'Ayşe Yılmaz', title: 'Frontend Geliştirici', speed: 1.15, ontime: 0.9 },
  { name: 'Mehmet Demir', title: 'Backend Geliştirici', speed: 1.3, ontime: 0.85 },
  { name: 'Elif Şahin', title: 'Test Uzmanı', speed: 0.9, ontime: 0.95, qa: true },
  { name: 'Burak Çelik', title: 'Mobil Geliştirici', speed: 1.0, ontime: 0.75 },
  { name: 'Deniz Arslan', title: 'Full-stack Geliştirici', speed: 1.1, ontime: 0.8 },
  { name: 'Can Öztürk', title: 'Backend Geliştirici', speed: 0.8, ontime: 0.65, slowing: true },
  { name: 'Selin Aydın', title: 'UI/UX Tasarımcı', speed: 0.95, ontime: 0.9 },
  { name: 'Emre Koç', title: 'DevOps Mühendisi', speed: 1.05, ontime: 0.88 },
  { name: 'Ece Yıldız', title: 'Veri Analisti', speed: 0.9, ontime: 0.92 },
];
const emailOf = (name) =>
  name
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/[^a-z]+/g, '.') +
  '@' +
  DOMAIN;

// ---------- Projeler ----------
const PROJECTS = [
  {
    key: 'MOB',
    name: 'Egebis Mobil',
    color: '#7C3AED',
    icon: 'smartphone',
    description: 'Saha ekipleri için iOS/Android uygulaması.',
    team: ['Burak Çelik', 'Ayşe Yılmaz', 'Mehmet Demir', 'Elif Şahin', 'Selin Aydın'],
    epics: ['Çevrimdışı çalışma', 'Bildirim altyapısı', 'Saha raporları', 'Giriş ve güvenlik'],
    tasks: [
      'Senkronizasyon kuyruğu',
      'Push bildirim izinleri',
      'Fotoğraf sıkıştırma',
      'Rapor PDF çıktısı',
      'Biyometrik giriş',
      'Harita üzerinde iş listesi',
      'Form doğrulama',
      'Karanlık tema',
      'Oturum yenileme',
      'Çevrimdışı çakışma çözümü',
      'İmza alanı',
      'Ek dosya yükleme',
      'Uygulama içi güncelleme uyarısı',
      'Konum izni akışı',
      'Hata raporlama (crash)',
      'Ayarlar ekranı',
      'Barkod okuma',
      'Görev filtreleri',
    ],
    bugs: [
      'Eski cihazlarda açılışta kapanıyor',
      'Fotoğraf yönü ters kaydediliyor',
      'Bildirime tıklayınca yanlış ekran açılıyor',
      'Çevrimdışıyken form kayboluyor',
      'Giriş butonu iPhone SE’de görünmüyor',
      'Harita yakınlaştırmada donuyor',
      'Türkçe karakterli dosya adı yüklenmiyor',
      'Senkronizasyon iki kez kayıt açıyor',
    ],
  },
  {
    key: 'PRT',
    name: 'Müşteri Portalı',
    color: '#2563EB',
    icon: 'globe',
    description: 'Kurumsal müşterilerin sipariş ve destek portalı.',
    team: ['Ayşe Yılmaz', 'Deniz Arslan', 'Selin Aydın', 'Elif Şahin', 'Can Öztürk'],
    epics: ['Sipariş takibi', 'Destek talepleri', 'Fatura ekranları', 'Kullanıcı yönetimi'],
    tasks: [
      'Sipariş durum zaman çizelgesi',
      'Talep oluşturma formu',
      'Fatura PDF indirme',
      'Rol bazlı menü',
      'Şifre sıfırlama akışı',
      'Çoklu dil desteği',
      'Dosya ekli talep',
      'Sipariş arama',
      'E-posta bildirim tercihleri',
      'Fatura filtreleri',
      'Kullanıcı davet akışı',
      'Erişilebilirlik düzeltmeleri',
      'Pano özet kartları',
      'Talep SLA göstergesi',
      'Excel dışa aktarma',
      'Oturum zaman aşımı uyarısı',
    ],
    bugs: [
      'Fatura toplamı kuruş yuvarlıyor',
      'Talep listesinde sayfalama atlıyor',
      'Şifre sıfırlama bağlantısı süresi dolmuş diyor',
      'Safari’de tarih seçici açılmıyor',
      'Sipariş araması büyük/küçük harfe duyarlı',
      'Excel çıktısında Türkçe karakter bozuk',
      'Davet e-postası spam’e düşüyor',
    ],
  },
  {
    key: 'ETK',
    name: 'E-Ticaret Altyapısı',
    color: '#0E7490',
    icon: 'briefcase',
    description: 'Ödeme, stok ve kargo entegrasyonları.',
    team: ['Mehmet Demir', 'Can Öztürk', 'Emre Koç', 'Deniz Arslan', 'Elif Şahin'],
    epics: ['Ödeme entegrasyonu', 'Stok senkronu', 'Kargo entegrasyonu', 'Altyapı ve izleme'],
    tasks: [
      '3D Secure akışı',
      'İade API’si',
      'Stok rezervasyonu',
      'Kargo etiket servisi',
      'Webhook imza doğrulama',
      'Kuyruk tekrar deneme',
      'Ödeme mutabakat raporu',
      'Önbellek katmanı',
      'Veritabanı yedek otomasyonu',
      'Hız sınırı (rate limit)',
      'Log toplama',
      'Kargo takip bildirimi',
      'Taksit seçenekleri',
      'Stok eşik uyarısı',
      'Sağlık kontrolü uçları',
      'Blue/green dağıtım',
    ],
    bugs: [
      'Ödeme sonrası sipariş numarası boş',
      'Stok eksiye düşüyor',
      'Kargo etiketi yanlış adres basıyor',
      'Webhook zaman aşımında tekrar etmiyor',
      'İade tutarı iki kez düşülüyor',
      'Gece yedeği yarıda kalıyor',
      'Taksit oranı yanlış hesaplanıyor',
      'Önbellek eski fiyat gösteriyor',
    ],
  },
  {
    key: 'RPR',
    name: 'Raporlama ve BI',
    color: '#CA8A04',
    icon: 'chart',
    description: 'Yönetim panoları ve veri ambarı.',
    team: ['Ece Yıldız', 'Emre Koç', 'Mehmet Demir', 'Selin Aydın'],
    epics: ['Satış panosu', 'Veri ambarı', 'Planlı raporlar'],
    tasks: [
      'Günlük satış ETL',
      'Bölge kırılımı',
      'Müşteri segmentasyonu',
      'Haftalık e-posta raporu',
      'Pano yetkilendirme',
      'Tahmin modeli denemesi',
      'Kohort analizi',
      'KPI tanımları',
      'Rapor zamanlayıcı',
      'Veri kalitesi kontrolleri',
      'Grafik dışa aktarma',
      'Stok devir hızı raporu',
    ],
    bugs: [
      'Panoda dünkü veri görünmüyor',
      'Bölge toplamları uyuşmuyor',
      'Planlı rapor iki kez gönderiliyor',
      'Saat dilimi yüzünden gün kayıyor',
    ],
  },
];
const FIB = [1, 2, 3, 3, 5, 5, 8, 13];
const SEV = [
  ['CRITICAL', 0.12],
  ['MAJOR', 0.33],
  ['MINOR', 0.4],
  ['TRIVIAL', 0.15],
];
const severity = () => {
  let r = rnd();
  for (const [s, p] of SEV) if ((r -= p) <= 0) return s;
  return 'MINOR';
};
const RESOLVE_DAYS = { CRITICAL: [0.2, 2.5], MAJOR: [0.8, 6], MINOR: [2, 14], TRIVIAL: [3, 21] };
const SPRINTS = 9; // 8 tamamlanmış + 1 aktif
const SPRINT_DAYS = 14;

async function remove() {
  const spaces = await db.space.findMany({
    where: { key: { in: PROJECTS.map((p) => p.key) } },
    select: { id: true, workspaceId: true },
  });
  const users = await db.user.findMany({
    where: { email: { endsWith: '@' + DOMAIN } },
    select: { id: true },
  });
  const ids = spaces.map((s) => s.id);
  const uids = users.map((u) => u.id);
  if (ids.length) {
    const items = await db.workItem.findMany({
      where: { spaceId: { in: ids } },
      select: { id: true },
    });
    await db.activityEvent.deleteMany({
      where: {
        OR: [{ entityId: { in: [...ids, ...items.map((i) => i.id)] } }, { actorId: { in: uids } }],
      },
    });
    await db.spaceKey.deleteMany({ where: { spaceId: { in: ids } } });
    await db.space.deleteMany({ where: { id: { in: ids } } });
  }
  await db.membership.deleteMany({ where: { userId: { in: uids } } });
  await db.user.deleteMany({ where: { id: { in: uids } } });
  console.log(`silindi: ${ids.length} Proje, ${uids.length} demo kişi`);
}

async function main() {
  if (process.argv.includes('--remove')) return remove();
  const exists = await db.space.count({ where: { key: { in: PROJECTS.map((p) => p.key) } } });
  if (exists) throw new Error('Demo Projeleri zaten var; önce --remove ile silin.');

  const workspace = await db.workspace.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const ws = workspace.id;
  const owner = await db.membership.findFirstOrThrow({
    where: { workspaceId: ws, role: { key: 'OWNER', scope: 'WORKSPACE' } },
    select: { userId: true },
  });
  const roles = await db.role.findMany({ where: { workspaceId: ws } });
  const role = (scope, key) => roles.find((r) => r.scope === scope && r.key === key).id;

  // ---- Kişiler (giriş yapamaz)
  const start = addDays(TODAY, -(SPRINTS - 1) * SPRINT_DAYS - 3 - 21); // ilk sprint'ten 3 hafta önce katıldılar
  const people = new Map();
  for (const [i, p] of PEOPLE.entries()) {
    const id = uuid();
    people.set(p.name, { ...p, id });
    await db.user.create({
      data: {
        id,
        email: emailOf(p.name),
        name: p.name,
        title: p.title,
        locale: 'tr',
        passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
        createdAt: addDays(start, -i),
      },
    });
    await db.membership.create({
      data: {
        workspaceId: ws,
        userId: id,
        roleId: role('WORKSPACE', i === 1 ? 'ADMIN' : 'MEMBER'),
        createdAt: addDays(start, -i),
      },
    });
  }
  const person = (name) => people.get(name);

  const activity = [];
  const ev = (entityId, actorId, at, action, changes, entityType = 'item') =>
    activity.push({
      id: uuid(),
      workspaceId: ws,
      actorId,
      entityType,
      entityId,
      action,
      changes,
      createdAt: at,
    });

  const last = await db.space.findFirst({
    where: { workspaceId: ws, deletedAt: null },
    orderBy: { rank: 'desc' },
  });
  const spaceRanks = ranksAfter(last?.rank ?? null, PROJECTS.length);
  // Aktif sprint bu hafta pazartesi başladı.
  const monday = addDays(TODAY, -((TODAY.getUTCDay() + 6) % 7));
  const firstSprintStart = addDays(monday, -(SPRINTS - 1) * SPRINT_DAYS);

  let totals = { items: 0, bugs: 0, sprints: 0, time: 0 };

  for (const [pi, P] of PROJECTS.entries()) {
    const spaceId = uuid();
    const created = addDays(firstSprintStart, -14);
    await db.space.create({
      data: {
        id: spaceId,
        workspaceId: ws,
        name: P.name,
        key: P.key,
        color: P.color,
        icon: P.icon,
        description: P.description,
        scrumEnabled: true,
        sprintLengthWeeks: 2,
        sprintGoalRequired: true,
        rank: spaceRanks[pi],
        createdById: owner.userId,
        createdAt: created,
      },
    });
    await db.spaceKey.create({ data: { workspaceId: ws, spaceId, key: P.key } });
    const statusSeeds = DEFAULT_STATUSES.tr;
    const statusRanks = ranksAfter(null, statusSeeds.length);
    const st = statusSeeds.map((s, i) => ({
      id: uuid(),
      workspaceId: ws,
      spaceId,
      name: s.name,
      color: s.color,
      category: s.category,
      rank: statusRanks[i],
    }));
    await db.status.createMany({ data: st });
    const [BACKLOG, TODO, DOING, REVIEW, DONE] = st.map((s) => s.id);
    const listId = uuid();
    await db.list.create({
      data: {
        id: listId,
        workspaceId: ws,
        spaceId,
        name: DEFAULT_LIST_NAME.tr,
        rank: ranksAfter(null, 1)[0],
        createdAt: created,
      },
    });
    const team = P.team.map(person);
    await db.spaceMember.createMany({
      data: [
        {
          workspaceId: ws,
          spaceId,
          userId: owner.userId,
          roleId: role('SPACE', 'PROJECT_MANAGER'),
        },
        ...team.map((t, i) => ({
          workspaceId: ws,
          spaceId,
          userId: t.id,
          roleId: role('SPACE', i === 0 ? 'PROJECT_MANAGER' : 'PROJECT_MEMBER'),
        })),
      ],
    });
    ev(
      spaceId,
      owner.userId,
      created,
      'space.created',
      { name: P.name, key: P.key, isPrivate: false },
      'space',
    );

    let number = 0;
    const items = [];
    const assignees = [];
    const sprintEvents = [];
    const times = [];
    const snapshots = [];
    const listRanks = ranksAfter(null, 2000);
    let lr = 0;
    const newItem = (data) => {
      const it = {
        id: uuid(),
        workspaceId: ws,
        spaceId,
        listId,
        keyPrefix: P.key,
        number: ++number,
        rank: listRanks[lr++],
        priority: 'NORMAL',
        ...data,
      };
      items.push(it);
      ev(it.id, data.reporterId ?? owner.userId, data.createdAt, 'item.created', {
        key: `${P.key}-${it.number}`,
        type: it.type,
        title: it.title,
        listId,
      });
      return it;
    };
    /** Durum geçişleri: Yapılacak → Devam → İnceleme → Tamamlandı (zamanlar sıralı). */
    const ORDER = [BACKLOG, TODO, DOING, REVIEW, DONE];
    const flow = (it, actor, steps, allowBack = false) => {
      let from = it.statusId;
      for (const [to, at] of steps) {
        // Devreden işte durum geri gitmez (yeniden açma ayrıca allowBack ile).
        if (!allowBack && ORDER.indexOf(to) <= ORDER.indexOf(from)) continue;
        const changes = { statusId: { from, to } };
        if (to === DONE) {
          changes.completedAt = { from: null, to: at.toISOString() };
          it._doneAt = at;
        } else if (from === DONE) {
          changes.completedAt = { from: (it._doneAt || at).toISOString(), to: null };
          it._doneAt = null;
        }
        ev(it.id, actor, at, 'item.updated', changes);
        from = to;
      }
      it.statusId = from;
    };
    const logTime = (it, userId, from, to, hours) => {
      const days = Math.max(1, Math.round((to - from) / DAY));
      let left = Math.round(hours * 60);
      for (let d = 0; d < days && left > 0; d++) {
        const day = day0(addDays(from, d));
        if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
        const m = Math.min(left, int(60, 300));
        left -= m;
        times.push({
          id: uuid(),
          workspaceId: ws,
          workItemId: it.id,
          userId,
          day,
          minutes: Math.round(m / 15) * 15 || 15,
          source: chance(0.3) ? 'TIMER' : 'MANUAL',
          createdAt: workTime(day),
        });
      }
    };

    // ---- Epic'ler
    const epics = P.epics.map((title, i) =>
      newItem({
        type: 'EPIC',
        title,
        statusId: i === 0 ? DONE : DOING,
        reporterId: owner.userId,
        createdAt: addDays(created, i),
        goal: `${title} hedefini tamamlamak`,
        color: P.color,
        completedAt: i === 0 ? workTime(addDays(firstSprintStart, 9 * 7)) : null,
      }),
    );

    // ---- Sprint'ler
    const titles = [...P.tasks];
    let carry = [];
    for (let s = 0; s < SPRINTS; s++) {
      const sStart = addDays(firstSprintStart, s * SPRINT_DAYS);
      const sEnd = addDays(sStart, 11); // pazartesi → ertesi hafta cuma
      const active = s === SPRINTS - 1;
      const sprintId = uuid();
      const planned = [...carry];
      carry = [];
      const count = int(team.length + 3, team.length + 7);
      // Projeye göre biraz farklı tempo: biri geride kalsın.
      const projectPace = pi === 2 ? 0.82 : pi === 1 ? 0.95 : 1;
      for (let k = 0; k < count; k++) {
        const who = pick(team);
        const base = titles[(s * count + k) % titles.length];
        const title = `${base}${s >= Math.floor(titles.length / count) ? ` (${s + 1}. iterasyon)` : ''}`;
        const points = pick(FIB);
        const it = newItem({
          type: 'TASK',
          title,
          statusId: TODO,
          reporterId: owner.userId,
          points,
          parentId: pick(epics).id,
          createdAt: workTime(addDays(sStart, -int(1, 6))),
          dueDate: sEnd,
          priority: pick(['NORMAL', 'NORMAL', 'HIGH', 'LOW', 'URGENT']),
        });
        it._who = who;
        planned.push(it);
      }
      const committed = planned.reduce((n, i) => n + (i.points || 0), 0);
      for (const it of planned) {
        it.sprintId = sprintId;
        sprintEvents.push({
          id: uuid(),
          workspaceId: ws,
          sprintId,
          workItemId: it.id,
          action: 'ADDED',
          reason: it._carried ? 'CARRIED_OVER' : 'PLANNED',
          points: it.points,
          actorId: owner.userId,
          createdAt: workTime(sStart),
        });
        if (!assignees.some((a) => a.workItemId === it.id))
          assignees.push({
            workItemId: it.id,
            userId: it._who.id,
            workspaceId: ws,
            createdAt: it.createdAt,
          });
      }
      // Kapsam değişikliği: sprint ortasında eklenen iş.
      if (chance(0.7)) {
        const who = pick(team);
        const it = newItem({
          type: 'TASK',
          title: `Acil: ${pick(P.tasks)}`,
          statusId: TODO,
          reporterId: owner.userId,
          points: pick([1, 2, 3, 5]),
          sprintId,
          createdAt: workTime(addDays(sStart, int(2, 6))),
          dueDate: sEnd,
          priority: 'HIGH',
        });
        it._who = who;
        assignees.push({
          workItemId: it.id,
          userId: who.id,
          workspaceId: ws,
          createdAt: it.createdAt,
        });
        sprintEvents.push({
          id: uuid(),
          workspaceId: ws,
          sprintId,
          workItemId: it.id,
          action: 'ADDED',
          reason: 'SCOPE_CHANGE',
          points: it.points,
          actorId: owner.userId,
          createdAt: it.createdAt,
        });
        planned.push(it);
      }

      // İlerleme: kişinin hızı, ontime oranı; aktif sprint bugüne kadar.
      const horizon = active ? NOW : addDays(sEnd, 0.7);
      let donePts = 0;
      const doneAt = [];
      for (const it of planned) {
        const who = it._who;
        let speed = who.speed * projectPace;
        if (who.slowing && s >= SPRINTS - 3) speed *= 0.5; // son haftalarda yavaşlayan kişi (risk uyarısı)
        // Sprint içinde bitme olasılığı ~%70–95; büyük işler biraz daha riskli.
        const willFinish = chance(Math.min(0.97, 0.8 * speed - (it.points >= 13 ? 0.15 : 0)));
        const begin = workTime(addDays(sStart, between(0, 4)));
        const est = Math.min(
          9,
          Math.max(0.7, (Math.sqrt(it.points || 1) * between(0.8, 1.6)) / speed),
        );
        it.dueDate = day0(addDays(begin, est + 1)); // kişinin tahmini; geç kalan iş "termine uyum"u düşürür
        const late = !chance(who.ontime);
        let finish = addDays(begin, est * (late ? between(1.2, 1.8) : between(0.6, 1)));
        const sprintClose = addDays(sEnd, 0.7);
        if (finish > sprintClose) finish = addDays(sprintClose, -between(0.1, 0.5));
        const reviewAt = addDays(begin, ((finish - begin) / DAY) * between(0.55, 0.85));
        const steps = [];
        if (begin < horizon) steps.push([DOING, begin]);
        if (reviewAt < horizon && (willFinish || chance(0.5))) steps.push([REVIEW, reviewAt]);
        const finished = willFinish && finish < horizon;
        if (finished) steps.push([DONE, finish]);
        flow(it, who.id, steps);
        if (finished) {
          it.completedAt = finish;
          donePts += it.points || 0;
          doneAt.push([finish, it.points || 0]);
          // Ara ara yeniden açılan iş (kalite metriği).
          if (chance(0.05) && !active) {
            const back = addDays(finish, 0.5);
            const again = addDays(back, 1);
            flow(
              it,
              who.id,
              [
                [DOING, back],
                [DONE, again],
              ],
              true,
            );
            it.completedAt = again;
          }
        }
        if (steps.length && (finished || !it._logged)) {
          logTime(
            it,
            who.id,
            begin,
            finished ? finish : horizon,
            (it.points || 1) * between(2.2, 3.8) * (it._logged ? 0.5 : 1),
          );
          it._logged = true;
        }
        // Büyük işlerin alt görevleri.
        if (it.points >= 8 && !it._subs && chance(0.6)) {
          it._subs = true;
          for (const sub of ['Analiz', 'Geliştirme', 'Test']) {
            const c = newItem({
              type: 'SUBTASK',
              title: `${sub}: ${it.title}`,
              statusId: finished ? DONE : TODO,
              parentId: it.id,
              sprintId,
              reporterId: owner.userId,
              createdAt: addDays(it.createdAt, 0.1),
              completedAt: finished ? addDays(finish, -between(0, 1)) : null,
            });
            assignees.push({
              workItemId: c.id,
              userId: who.id,
              workspaceId: ws,
              createdAt: c.createdAt,
            });
          }
        }
      }
      if (active) {
        for (const it of planned.filter((i) => !i.completedAt && i.type === 'TASK')) {
          if (chance(0.35)) it.dueDate = day0(addDays(TODAY, -int(1, 4)));
        }
      }
      // Bitmeyenler bir sonraki sprint'e devreder.
      if (!active) {
        for (const it of planned.filter((i) => !i.completedAt)) {
          sprintEvents.push({
            id: uuid(),
            workspaceId: ws,
            sprintId,
            workItemId: it.id,
            action: 'REMOVED',
            reason: 'UNFINISHED',
            points: it.points,
            actorId: owner.userId,
            createdAt: workTime(sEnd),
          });
          it._carried = true;
          it.dueDate = it.dueDate; // termin kaçtı → zamanında tamamlanma oranı düşer
          carry.push(it);
        }
      }
      // Burndown anlık görüntüleri.
      const total = planned.reduce((n, i) => n + (i.points || 0), 0);
      for (let d = 0; d <= 11; d++) {
        const date = addDays(sStart, d);
        if (date > TODAY) break;
        const end = addDays(date, 1);
        const doneP = doneAt.filter(([t]) => t < end).reduce((n, [, p]) => n + p, 0);
        const doneN = doneAt.filter(([t]) => t < end).length;
        snapshots.push({
          id: uuid(),
          workspaceId: ws,
          sprintId,
          date,
          totalPoints: total,
          donePoints: doneP,
          remainingPoints: total - doneP,
          totalItems: planned.length,
          doneItems: doneN,
        });
      }
      await db.sprint.create({
        data: {
          id: sprintId,
          workspaceId: ws,
          spaceId,
          name: `Sprint ${s + 1}`,
          goal: `${pick(P.epics)} odaklı teslimat`,
          startDate: sStart,
          endDate: sEnd,
          status: active ? 'ACTIVE' : 'COMPLETED',
          startedAt: workTime(sStart),
          completedAt: active ? null : workTime(sEnd),
          committedPoints: committed,
          completedPoints: active ? null : donePts,
          createdById: owner.userId,
          createdAt: addDays(sStart, -3),
        },
      });
      ev(
        sprintId,
        owner.userId,
        workTime(sStart),
        'sprint.started',
        { name: `Sprint ${s + 1}` },
        'sprint',
      );
      totals.sprints++;
    }
    // Sonraki (planlı) sprint ve devreden işler.
    {
      const sStart = addDays(firstSprintStart, SPRINTS * SPRINT_DAYS);
      await db.sprint.create({
        data: {
          id: uuid(),
          workspaceId: ws,
          spaceId,
          name: `Sprint ${SPRINTS + 1}`,
          goal: 'Planlanıyor',
          startDate: sStart,
          endDate: addDays(sStart, 11),
          status: 'PLANNED',
          createdById: owner.userId,
        },
      });
    }
    // Backlog: henüz sprint'e girmemiş işler.
    const backlogRanks = ranksAfter(null, 12);
    for (let b = 0; b < int(6, 10); b++) {
      newItem({
        type: 'TASK',
        title: `Fikir: ${pick(P.tasks)} iyileştirmesi`,
        statusId: BACKLOG,
        reporterId: owner.userId,
        points: chance(0.6) ? pick(FIB) : null,
        parentId: chance(0.6) ? pick(epics).id : null,
        createdAt: workTime(addDays(TODAY, -int(1, 60))),
        backlogRank: backlogRanks[b],
      });
    }

    // ---- Bug'lar: 18 hafta boyunca, önem derecesine göre çözüm süresi.
    const qa = team.find((t) => t.qa) || team[0];
    const firstDay = firstSprintStart;
    const weeks = Math.ceil((TODAY - firstDay) / (7 * DAY));
    for (let w = 0; w <= weeks; w++) {
      const n = Math.max(0, Math.round(between(1, 4) * (pi === 3 ? 0.5 : 1)));
      for (let k = 0; k < n; k++) {
        const createdAt = workTime(addDays(firstDay, w * 7 + between(0, 6)));
        if (createdAt > NOW) continue;
        const sev = severity();
        const fixer = pick(team.filter((t) => !t.qa).length ? team.filter((t) => !t.qa) : team);
        const [a, b] = RESOLVE_DAYS[sev];
        let resolveDays = between(a, b) / fixer.speed;
        if (fixer.slowing && createdAt > addDays(NOW, -21)) resolveDays *= 2.5;
        const resolvedAt = addDays(createdAt, resolveDays);
        const resolved = resolvedAt < NOW && chance(0.9);
        const unassigned = !resolved && chance(0.35);
        const bug = newItem({
          type: 'BUG',
          title: pick(P.bugs),
          severity: sev,
          statusId: TODO,
          reporterId: chance(0.6) ? qa.id : owner.userId,
          createdAt,
          priority: sev === 'CRITICAL' ? 'URGENT' : sev === 'MAJOR' ? 'HIGH' : 'NORMAL',
          stepsToReproduce: '1. Uygulamayı aç\n2. İlgili ekrana git\n3. Hatayı gözlemle',
          expectedResult: 'İşlem sorunsuz tamamlanmalı',
          actualResult: 'Hata oluşuyor',
          environment: pick(['iOS 18', 'Android 15', 'Chrome', 'Safari', 'Üretim', 'Test ortamı']),
          bugStatus: resolved
            ? 'RESOLVED'
            : unassigned
              ? 'UNASSIGNED'
              : chance(0.5)
                ? 'IN_PROGRESS'
                : 'ASSIGNED',
        });
        totals.bugs++;
        if (unassigned) continue;
        assignees.push({
          workItemId: bug.id,
          userId: fixer.id,
          workspaceId: ws,
          createdAt: addDays(createdAt, 0.05),
        });
        const beginAt = addDays(createdAt, Math.min(resolveDays * 0.3, 1));
        if (resolved) {
          flow(bug, fixer.id, [
            [DOING, beginAt],
            [DONE, resolvedAt],
          ]);
          bug.completedAt = resolvedAt;
          if (chance(0.06)) {
            const back = addDays(resolvedAt, 1);
            if (back < NOW) {
              flow(
                bug,
                qa.id,
                [
                  [DOING, back],
                  [DONE, addDays(back, 0.8)],
                ],
                true,
              );
              bug.completedAt = addDays(back, 0.8);
            }
          }
          logTime(bug, fixer.id, beginAt, bug.completedAt, between(0.5, 6));
        } else if (bug.bugStatus === 'IN_PROGRESS') {
          flow(bug, fixer.id, [[DOING, beginAt < NOW ? beginAt : NOW]]);
        }
      }
    }

    // ---- Yaz
    for (const it of items) {
      delete it._who;
      delete it._carried;
      delete it._subs;
      delete it._doneAt;
      delete it._logged;
      it.updatedAt = it.completedAt || it.createdAt;
    }
    await db.workItem.createMany({ data: items });
    await db.space.update({ where: { id: spaceId }, data: { itemCounter: number } });
    const uniqAssignees = [
      ...new Map(assignees.map((a) => [`${a.workItemId}:${a.userId}`, a])).values(),
    ];
    await db.workItemAssignee.createMany({ data: uniqAssignees });
    for (let i = 0; i < sprintEvents.length; i += 1000)
      await db.sprintItemEvent.createMany({ data: sprintEvents.slice(i, i + 1000) });
    for (let i = 0; i < snapshots.length; i += 1000)
      await db.sprintSnapshot.createMany({ data: snapshots.slice(i, i + 1000) });
    for (let i = 0; i < times.length; i += 1000)
      await db.timeEntry.createMany({ data: times.slice(i, i + 1000) });
    totals.items += items.length;
    totals.time += times.length;
    console.log(
      `${P.key}: ${items.length} öğe, ${sprintEvents.length} sprint olayı, ${times.length} zaman kaydı`,
    );
  }
  for (let i = 0; i < activity.length; i += 1000)
    await db.activityEvent.createMany({ data: activity.slice(i, i + 1000) });
  console.log(
    `TAMAM: ${PEOPLE.length} kişi, ${PROJECTS.length} Proje, ${totals.sprints} sprint, ${totals.items} öğe (${totals.bugs} Bug), ${totals.time} zaman kaydı, ${activity.length} olay`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
