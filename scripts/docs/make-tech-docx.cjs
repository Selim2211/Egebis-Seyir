/*
 * Teknik dokümantasyon (Word): mimari, istek hattı, veri saklama, arka plan işleri, dağıtım.
 * Kullanım: NODE_PATH=apps/web/node_modules node scripts/docs/make-tech-docx.cjs <çıktı.docx>
 */
const fs = require('fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  ShadingType,
  AlignmentType,
  BorderStyle,
  Footer,
  PageNumber,
  PageBreak,
  LevelFormat,
  TableOfContents,
  VerticalAlign,
} = require('docx');

const out = process.argv[2];
if (!out) {
  console.error('Kullanım: make-tech-docx.cjs <çıktı.docx>');
  process.exit(1);
}

const FONT = 'Calibri';
const MONO = 'Consolas';
const PURPLE = '3B2A9E';
const ACCENT = '5B3FD1';
const GREY = '555B6E';
const WIDTH = 9638; // A4, 2 cm kenar boşluğu
const thin = { style: BorderStyle.SINGLE, size: 4, color: 'C9CEDB' };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

/** `**kalın**` ve `kod` işaretlerini koşulara çevirir. */
function runs(text, base = {}) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('**'))
        return new TextRun({ text: part.slice(2, -2), bold: true, font: FONT, size: 21, ...base });
      if (part.startsWith('`'))
        return new TextRun({
          text: part.slice(1, -1),
          font: MONO,
          size: 19,
          color: ACCENT,
          ...base,
        });
      return new TextRun({ text: part, font: FONT, size: 21, ...base });
    });
}

const doc = [];
const h1 = (text) =>
  doc.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: false,
      children: [new TextRun({ text, font: FONT, bold: true, color: PURPLE, size: 32 })],
      spacing: { before: 480, after: 160 },
    }),
  );
const h2 = (text) =>
  doc.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, font: FONT, bold: true, color: ACCENT, size: 25 })],
      spacing: { before: 260, after: 100 },
    }),
  );
const p = (text) =>
  doc.push(new Paragraph({ children: runs(text), spacing: { after: 110, line: 290 } }));
const bullets = (items) =>
  items.forEach((t) =>
    doc.push(
      new Paragraph({
        numbering: { reference: 'dots', level: 0 },
        children: runs(t),
        spacing: { after: 60, line: 280 },
      }),
    ),
  );
const code = (lines) =>
  doc.push(
    new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: [WIDTH],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: WIDTH, type: WidthType.DXA },
              borders,
              shading: { type: ShadingType.CLEAR, fill: 'F4F5FA', color: 'auto' },
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              children: lines.map(
                (l) =>
                  new Paragraph({
                    children: [new TextRun({ text: l || ' ', font: MONO, size: 17 })],
                  }),
              ),
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  );

function table(headers, rows, ratios) {
  const widths = ratios.map((r) => Math.round((WIDTH * r) / ratios.reduce((a, b) => a + b, 0)));
  widths[widths.length - 1] = WIDTH - widths.slice(0, -1).reduce((a, b) => a + b, 0);
  const cell = (text, i, head) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders,
      verticalAlign: VerticalAlign.CENTER,
      shading: head ? { type: ShadingType.CLEAR, fill: ACCENT, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          children: head
            ? [new TextRun({ text, bold: true, color: 'FFFFFF', font: FONT, size: 19 })]
            : runs(text, { size: 19 }),
        }),
      ],
    });
  doc.push(
    new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  );
}

/** Numaralı adım kutuları ve aralarında ok: bir hattın (pipeline) akışı. */
function flow(steps) {
  const numW = 700;
  const rows = [];
  steps.forEach(([title, desc], i) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: numW, type: WidthType.DXA },
            borders,
            verticalAlign: VerticalAlign.CENTER,
            shading: { type: ShadingType.CLEAR, fill: ACCENT, color: 'auto' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: String(i + 1),
                    bold: true,
                    color: 'FFFFFF',
                    font: FONT,
                    size: 22,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: WIDTH - numW, type: WidthType.DXA },
            borders,
            shading: { type: ShadingType.CLEAR, fill: 'F7F5FF', color: 'auto' },
            margins: { top: 70, bottom: 70, left: 140, right: 120 },
            children: [
              new Paragraph({ children: runs(title, { bold: true, color: PURPLE }) }),
              new Paragraph({ children: runs(desc, { size: 19, color: '333845' }) }),
            ],
          }),
        ],
      }),
    );
    if (i < steps.length - 1)
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              width: { size: WIDTH, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              },
              children: [
                new Paragraph({
                  indent: { left: 200 },
                  children: [new TextRun({ text: '▼', color: '9C8CF0', font: FONT, size: 16 })],
                }),
              ],
            }),
          ],
        }),
      );
  });
  doc.push(
    new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: [numW, WIDTH - numW],
      rows,
    }),
    new Paragraph({ spacing: { after: 140 }, children: [] }),
  );
}

/* ------------------------------------------------------------------ Kapak */
doc.push(
  new Paragraph({
    spacing: { before: 2600 },
    children: [
      new TextRun({
        text: 'EGEBIS',
        font: FONT,
        size: 28,
        color: '7C6BE0',
        bold: true,
        characterSpacing: 80,
      }),
    ],
  }),
  new Paragraph({
    children: [new TextRun({ text: 'Seyir', font: FONT, size: 96, bold: true, color: PURPLE })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Teknik Dokümantasyon', font: FONT, size: 40, color: GREY })],
  }),
  new Paragraph({
    children: runs(
      'Mimari · istek hattı · veri saklama · arka plan işleri · entegrasyonlar · dağıtım',
      { color: GREY },
    ),
  }),
  new Paragraph({
    spacing: { before: 400 },
    children: runs(
      'Sürüm: Ekim 2026 · Kaynak: `C:\\dev\\scrum-manager` · Kararların gerekçeleri: `docs/DECISIONS.md` (ADR-001…118)',
      { color: GREY, size: 19 },
    ),
  }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    children: [
      new TextRun({ text: 'İçindekiler', font: FONT, bold: true, color: PURPLE, size: 32 }),
    ],
  }),
  new TableOfContents('İçindekiler', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
);

/* ------------------------------------------------------------------ 1 */
h1('1. Genel bakış');
p(
  'Egebis Seyir; Scrum ve Kanban ile çalışan ekipler için kurum içinde barındırılan bir proje yönetim uygulamasıdır. Tek bir sunucuda çalışır: bir React arayüzü, bir NestJS API ve bir PostgreSQL veritabanı. Redis, arama motoru veya nesne deposu **yoktur**; kuyruk ve tam metin arama da PostgreSQL içindedir.',
);
code([
  'Tarayıcı (React SPA)',
  '   │  HTTPS · cookie oturumu · REST/JSON (/api/...)',
  '   ▼',
  'Caddy  ── statik arayüz dosyaları, TLS, /api → api:3000',
  '   ▼',
  'API (NestJS, modüler monolit)',
  '   ├──► PostgreSQL 17   veri · tam metin arama · pg-boss iş kuyruğu · tetikleyiciler',
  '   ├──► Yerel disk      dosya ekleri ve profil fotoğrafları (UPLOAD_DIR, volume)',
  '   ├──► SMTP            bildirim, davet, şifre sıfırlama e-postaları',
  '   └──► Dış servisler   giden webhook, Slack/Teams, Anthropic API (isteğe bağlı)',
  '        ◄── GitHub/GitLab gelen webhook (commit/PR bağlantısı)',
]);
h2('Teknoloji yığını');
table(
  ['Katman', 'Teknoloji', 'Not'],
  [
    [
      'Arayüz',
      'React 19, Vite, TanStack Router + Query, Tailwind, shadcn/ui (Radix), dnd-kit, TipTap, Recharts, i18next',
      'Tek sayfa uygulaması; TR varsayılan, EN',
    ],
    ['API', 'NestJS 11, Prisma 7, Zod, pino, pg-boss, Nodemailer', 'Modüler monolit, tek süreç'],
    [
      'Ortak paket',
      '`packages/shared`',
      'Zod şemaları, tipler, izin anahtarları, saf iş kuralları',
    ],
    ['Veritabanı', 'PostgreSQL 17 (`pg_trgm`, Türkçe FTS)', '43 migration, tetikleyiciler'],
    ['Sunum', 'Caddy, Docker Compose', 'Otomatik HTTPS (alan adı verilirse)'],
    [
      'Test',
      'Vitest (birim + entegrasyon), Playwright (E2E)',
      'Entegrasyon testleri gerçek PostgreSQL ile',
    ],
  ],
  [2, 5, 3],
);

/* ------------------------------------------------------------------ 2 */
h1('2. Kod yapısı');
code([
  'apps/api/            NestJS API',
  '  prisma/            schema.prisma + migrations/ (SQL, tetikleyiciler dahil)',
  '  src/infra/         config · prisma · queue · mail · storage · cls · security · events · http',
  '  src/modules/       iş modülleri (aşağıdaki tablo)',
  '  test/              *.int-spec.ts (gerçek DB ile entegrasyon testleri)',
  'apps/web/            React arayüzü',
  '  src/routes/        dosya tabanlı rotalar (TanStack Router)',
  '  src/features/<x>/  ekran bileşenleri + queries.ts (TanStack Query kancaları)',
  '  src/components/    ui/ (temel bileşenler), layout/ (kenar çubuğu, üst çubuk)',
  '  src/lib/           api.ts (HTTP istemcisi), i18n, yardımcılar',
  '  src/locales/       tr|en/common.json, errors.json',
  '  e2e/               Playwright senaryoları + kılavuz görseli üretici',
  'packages/shared/     API ve arayüzün ortak sözleşmesi (çalışma ortamından bağımsız)',
  'docker/              Dockerfile’lar, Caddyfile, backup.sh, compose.dev.yml',
  'docs/                DECISIONS.md (ADR), ARCHITECTURE.md, DEPLOY.md',
]);
p(
  '**Kural:** sözleşme tek yerde. Bir istek gövdesinin şeması (`packages/shared/src/schemas`) hem API’de doğrulama hem arayüzde form doğrulaması için kullanılır; izin anahtarları (`permissions/`) ve hata kodları (`errors/codes.ts`) da öyle. Paylaşılan paket değişince `npm run build` ile yeniden derlenmelidir; API derlenmiş çıktıyı okur.',
);
h2('API modülleri');
table(
  ['Modül', 'Sorumluluk'],
  [
    [
      '`auth`, `users`, `setup`',
      'Kurulum (ilk Owner), giriş/çıkış, oturum, şifre sıfırlama, API token, profil',
    ],
    [
      '`workspaces`, `access`, `teams`',
      'Üyelik, davet, roller ve özel roller, Space erişimi, öğe erişimi, ekipler',
    ],
    [
      '`spaces`',
      'Space (arayüzde “Proje”), Folder, List, durumlar, ayarlar, çöp kutusu ve temizleme',
    ],
    [
      '`work-items`',
      'Epic/Task/Sub-Task/Bug, hiyerarşi, Bug ekranı, Kanban, etiket, bağlantı, toplu işlem',
    ],
    [
      '`sprints`',
      'Backlog sıralama, sprint yaşam döngüsü, iç içe alma (nest/unnest), raporlar, Excel',
    ],
    ['`collab`', 'Yorum, mention, tepki, dosya ekleri, aktivite akışı'],
    [
      '`notifications`, `reminders`, `messages`',
      'Uygulama içi + e-posta bildirim, hatırlatıcı, mesajlaşma',
    ],
    [
      '`docs`, `goals`, `time`, `views`, `custom-fields`, `forms`, `templates`',
      'Dokümanlar, hedefler, zaman kaydı, kayıtlı görünümler, özel alanlar, formlar, şablonlar',
    ],
    [
      '`automations`, `webhooks`, `git`, `ai`',
      'Kural motoru, giden webhook, GitHub/GitLab bağlantısı, yapay zekâ önerileri',
    ],
    [
      '`import-export`, `backup`, `health`',
      'CSV/Excel içe-dışa aktarma, Space/Sprint ZIP yedeği, sağlık ucu',
    ],
  ],
  [3, 7],
);
p(
  '**Katmanlar:** controller (HTTP, şema doğrulama, izin dekoratörü) → service (transaction, iş akışı) → saf kurallar (DB yok, birim testli; çoğu `packages/shared/src/domain`). Bir modül başka modülün tablosuna doğrudan yazmaz; onun servisini kullanır.',
);

/* ------------------------------------------------------------------ 3 */
h1('3. İstek hattı (pipeline)');
p(
  'Arayüzden gelen her istek aşağıdaki sırayla işlenir. Örnek: bir Task’ın durumunu değiştirmek (`PATCH /api/workspaces/:ws/items/:id`).',
);
flow([
  [
    'Tarayıcı → `lib/api.ts`',
    '`fetch("/api…", { credentials: "same-origin" })`. GET dışındaki isteklere `sm_csrf` cookie’sindeki değer `x-csrf-token` başlığıyla eklenir. Hata yanıtı `{ code }` olarak gelir ve `locales/<dil>/errors.json` ile metne çevrilir.',
  ],
  [
    'Caddy',
    'TLS sonlandırır, `/api/*` isteğini `api:3000`’e iletir, diğer yolları arayüz dosyalarından sunar.',
  ],
  [
    'Ara katmanlar',
    'İstek kimliği + pino günlüğü; CSRF cookie’si yoksa üretilir; giriş uçlarında IP başına oran sınırı (`AUTH_RATE_LIMIT`, dakikada 10).',
  ],
  [
    'AuthGuard',
    '`sm_session` cookie’si (veya `Authorization: Bearer` API token) → SHA-256 özeti `sessions.tokenHash` / `api_tokens` içinde aranır → kullanıcı. Cookie isteklerinde CSRF başlığı cookie ile sabit zamanlı karşılaştırılır (double-submit).',
  ],
  [
    'CLS (istek bağlamı)',
    '`userId`, `workspaceId`, rol ve izin önbelleği isteğe bağlanır; sonraki katmanlar bunu parametre geçmeden okur.',
  ],
  [
    'PermissionGuard / SpacePermissionGuard',
    'Workspace rolü izin seti + Space rolü (açık/özel Space). Rota `itemId` içeriyorsa öğe düzeyi izin hesaplanır (gizli öğe, öğeye özel paylaşım; `itemPermissions()`).',
  ],
  [
    'Zod doğrulama',
    'Gövde/sorgu `packages/shared` şemasıyla doğrulanır; geçersizse `400 { code: "VALIDATION_FAILED", details }`.',
  ],
  [
    'Service + `prisma.$transaction`',
    'İş kuralı kontrolü (ör. DoD, açık alt öğe), yazma ve aynı transaction içinde `activity_events` kaydı. Tenant Prisma uzantısı her sorguya `workspaceId` ve gizli öğe süzgecini otomatik ekler.',
  ],
  [
    'Commit sonrası yan etkiler',
    'Bildirimler (kutu satırı + e-posta işi), `AutomationEvents` olay yolu (otomasyon motoru, webhook teslimatı). Hata verirlerse yalnızca günlüğe yazılır; asıl işlem geri alınmaz.',
  ],
  [
    'Yanıt',
    '`200/201/204` veya `{ code, details? }`. Arayüzde TanStack Query ilgili sorguları geçersiz kılar ve listeyi yeniden çeker (sık işlemlerde iyimser güncelleme).',
  ],
]);

/* ------------------------------------------------------------------ 4 */
h1('4. Kimlik doğrulama ve yetki');
h2('Oturum ve güvenlik');
table(
  ['Konu', 'Uygulama'],
  [
    ['Şifre', 'argon2id (19 MiB, 2 tur), PHC biçiminde `users.passwordHash`'],
    [
      'Oturum',
      '256 bit rastgele token → cookie `sm_session` (HttpOnly, SameSite); DB’de yalnız SHA-256 özeti. Süre 1 gün, “beni hatırla” 30 gün; dakikada bir “son görülme” yenilenir.',
    ],
    [
      'CSRF',
      'Double-submit: `sm_csrf` cookie + `x-csrf-token` başlığı. Bearer token ve imzalı git webhook’u muaf.',
    ],
    [
      'API token',
      'Kullanıcı başına, özetle saklanır, süreli ve iptal edilebilir; `Authorization: Bearer`.',
    ],
    [
      'Şifre sıfırlama / davet',
      'Tek kullanımlık, süreli, özetle saklanan token; bağlantı e-postayla.',
    ],
    [
      'Dosya indirme',
      'Her zaman `Content-Disposition: attachment`, `nosniff`, CSP sandbox; yürütülebilir dosyalar tarayıcıda açılmaz.',
    ],
  ],
  [2, 7],
);
h2('Roller ve izinler');
p(
  'İzinler anahtar dizileridir (`workItem.write`, `sprint.start`, `bug.assign` …) ve `roles.permissions` sütununda saklanır. İki düzey vardır:',
);
bullets([
  '**Workspace rolü** (`memberships.roleId`): OWNER, ADMIN, MEMBER, GUEST + özel roller (`custom_<uuid>`, `baseKey` ile bir katmana bağlı). OWNER değiştirilemez.',
  '**Space rolü** (`space_members`): PRODUCT_OWNER, SCRUM_MASTER, DEVELOPER, STAKEHOLDER + özel roller. Ayarlar → Roller ekranındaki matris bu satırları düzenler.',
  'Arayüz aynı anahtarlarla düğmeleri gizler; **asıl denetim her zaman API’dedir**.',
]);
h2('Öğe düzeyi erişim (kalıtım)');
p(
  'Varsayılan olarak bir öğe Space erişimini izler. Bir Epic/Task için “Paylaşım” açılırsa (`work_item_access`: gizli mi; `work_item_access_entries`: kullanıcı/ekip + rol) bu kural o öğeye ve **tüm alt öğelerine** geçer; alt öğe kendi kuralını tanımlarsa en yakın kural kazanır.',
);
bullets([
  '`work_items.accessRootId`: öğenin bağlı olduğu en yakın erişim kuralı. Uygulama kodu değil **PostgreSQL tetikleyicileri** (`recompute_access_root`, ekleme, üst değişimi, erişim satırı değişimi) günceller; böylece taşıma ve dönüştürme işlemleri hiçbir yolda unutulmaz.',
  'Okumada tenant Prisma uzantısı, kullanıcının göremediği kök kimliklerini (istek başına bir kez hesaplanıp CLS’de tutulur) `accessRootId NOT IN (...)` olarak her iş öğesi sorgusuna ekler.',
]);

/* ------------------------------------------------------------------ 5 */
h1('5. Veri modeli ve saklama');
p(
  'Şema: `apps/api/prisma/schema.prisma` (60 model). Değişiklik yalnızca migration ile (`prisma migrate deploy`); el ile SQL içeren migration’lar tetikleyici, indeks ve veri dönüşümlerini taşır.',
);
h2('Ortak kurallar');
table(
  ['Kural', 'Neden / nasıl'],
  [
    ['Kimlikler UUID', 'Tahmin edilemez, birleştirme/geri yüklemede çakışmaz.'],
    [
      'Her tenant tablosunda `workspaceId`',
      'Tenant Prisma uzantısı (`infra/prisma/tenant-scope.ts`) sorgulara otomatik ekler; başka workspace verisi yanlışlıkla okunamaz.',
    ],
    [
      'Okunabilir anahtar',
      '`keyPrefix` + `number` → `LDF-12`. Numara Space başına artar. Kullanılmış her anahtar `space_keys`’te rezerve kalır (Space silinse de), böylece eski bağlantılar başka Space’e kaymaz.',
    ],
    [
      'Sıralama `rank`',
      'Kesirli dizin (string). Araya ekleme tek satır günceller (`rankBetween`).',
    ],
    ['Yumuşak silme', '`deletedAt` → çöp kutusu; `trash.purge` işi süresi dolanları kalıcı siler.'],
    ['Zaman', '`timestamptz` (UTC); sprint tarihleri `date`; rapor gün sınırı Europe/Istanbul.'],
    [
      'Zengin metin',
      '`description` TipTap JSON; aramada kullanılan düz metin kopyası `descriptionText`.',
    ],
    ['Esnek alanlar', 'Özel alan değerleri `customFields` JSON; tanımları `custom_fields`.'],
  ],
  [3, 7],
);
h2('Tablo grupları');
table(
  ['Grup', 'Tablolar'],
  [
    ['Kimlik', '`users`, `sessions`, `password_reset_tokens`, `api_tokens`'],
    [
      'Workspace ve erişim',
      '`workspaces`, `roles`, `memberships`, `invitations`, `teams`, `team_members`, `space_members`, `work_item_access`, `work_item_access_entries`',
    ],
    [
      'Hiyerarşi',
      '`spaces` (mod SCRUM/KANBAN), `space_keys`, `statuses` (kategori BACKLOG/TODO/ACTIVE/DONE…), `folders`, `lists`, `favorites`',
    ],
    [
      'İş öğeleri',
      '`work_items` (tip EPIC/TASK/SUBTASK/BUG, `parentId`, `bugStatus`, puan, tarih, rank), `work_item_assignees`, `labels`, `work_item_labels`, `checklists`, `checklist_items`, `work_item_links`, `work_item_watchers`',
    ],
    [
      'Sprint ve raporlar',
      '`sprints`, `sprint_snapshots` (gün başına bir satır), `sprint_item_events` (ekleme/çıkarma/devir), `retro_items`, `retro_votes`',
    ],
    [
      'İşbirliği',
      '`comments`, `comment_mentions`, `comment_reactions`, `attachments`, `activity_events` (yalnız ekleme yapılan denetim günlüğü)',
    ],
    [
      'Bildirim ve iletişim',
      '`notifications`, `notification_preferences`, `reminders`, `conversations`, `messages`',
    ],
    [
      'Doküman ve planlama',
      '`docs`, `doc_versions`, `doc_item_links`, `goals`, `goal_items`, `time_entries`, `active_timers`, `dashboard_layouts`, `saved_views`',
    ],
    [
      'Otomasyon ve entegrasyon',
      '`automations`, `automation_runs`, `webhooks`, `webhook_deliveries`, `git_integrations`, `git_links`, `templates`, `forms`, `custom_fields`',
    ],
  ],
  [2.2, 7.8],
);
h2('Veritabanı içindeki mantık');
bullets([
  '**Tetikleyiciler:** `sync_subtask_points` (Sub-Task puanları üst Task’a toplanır), `recompute_access_root` ailesi (öğe erişim kökü).',
  "**Arama:** `to_tsvector('turkish', title || descriptionText)` üzerinde GIN indeksi + başlıkta `pg_trgm` benzerlik indeksi; dokümanlar için aynı yapı. Ayrı arama motoru yok.",
  '**Kuyruk:** pg-boss kendi `pgboss` şemasını aynı veritabanında tutar.',
]);
h2('Dosyalar');
flow([
  [
    'Yükleme',
    '`POST …/items/:id/attachments` (multipart, alan `file`, en çok `MAX_UPLOAD_MB` = 100 MB). Yetki: öğeye yazma.',
  ],
  [
    'Kontrol',
    'Uzantı engeli yok; içerik imzası (ilk baytlar) bildirilen türle uyuşmazsa uyarı olarak işaretlenir, reddedilmez.',
  ],
  [
    'Disk',
    '`StorageService.put(workspaceId, data)` → `UPLOAD_DIR/<workspaceId>/<uuid>`. Yol sunucuda üretilir; istemci adı yola hiç girmez, `..` reddedilir. Profil fotoğrafı: `avatars/<userId>`.',
  ],
  [
    'Kayıt',
    '`attachments` satırı: özgün ad, MIME, boyut, depolama anahtarı, yükleyen; aktivite kaydı.',
  ],
  ['İndirme', 'Akış (`createReadStream`), `attachment` + RFC 5987 dosya adı, sandbox CSP.'],
]);
p(
  'Depolama arayüzü tek sınıftır; S3 uyumlu bir depoya geçmek yalnızca `StorageService`’in değişmesini gerektirir.',
);

/* ------------------------------------------------------------------ 6 */
h1('6. Arka plan işleri ve olaylar');
h2('İş kuyruğu (pg-boss)');
p(
  '`infra/queue/queue.service.ts`. İş tipleri modül açılışında kaydedilir; 5 yeniden deneme, üstel geri çekilme. `QUEUE_ENABLED=false` iken (testler) iş, çağrıldığı anda aynı istekte çalışır.',
);
table(
  ['İş', 'Tetik', 'Ne yapar'],
  [
    [
      '`mail.send`',
      'Her e-posta',
      'SMTP ile gönderir (bildirim, davet, sıfırlama). İstek e-postayı beklemez.',
    ],
    [
      '`webhook.deliver`',
      'Her webhook olayı',
      'Kaydedilmiş yükü HMAC imzasıyla POST eder; sonucu `webhook_deliveries`’e yazar.',
    ],
    ['`reminders.send`', 'Her dakika', 'Zamanı gelen hatırlatıcıları bildirime çevirir.'],
    [
      '`sprint.snapshot`',
      'Her gün 23:55',
      'Aktif sprintlerin günlük burndown satırını yazar (`sprint_snapshots`).',
    ],
    [
      '`trash.purge`',
      'Her gün 03:30',
      'Saklama süresi dolan çöp kutusu kayıtlarını ve dosyalarını siler.',
    ],
  ],
  [2.2, 2, 5.8],
);
h2('Olay akışları');
flow([
  ['İş değişikliği commit edilir', 'Örn. durum değişti, yorum yazıldı, sprint başladı.'],
  [
    'Bildirim servisi',
    'Alıcıları hesaplar (atananlar, izleyenler, mention; eylemi yapan hariç, öğeyi göremeyen elenir) → `notifications` satırı (içerik anlık görüntü) → tercih açıksa `mail.send` işi.',
  ],
  [
    '`AutomationEvents` olay yolu',
    'Üretici dinleyicileri bilmez. Dinleyiciler: **otomasyon motoru** (aynı istekte, döngü koruması en çok 3 basamak, sonuç `automation_runs`) ve **webhook servisi** (`webhook_deliveries` + kuyruk).',
  ],
  [
    'Arayüz',
    'Bildirim rozeti 30 sn’de bir ve pencere odaklanınca yoklanır; mesajlar 4–15 sn. WebSocket yok.',
  ],
]);
h2('Dış entegrasyonlar');
table(
  ['Entegrasyon', 'Yön', 'Ayrıntı'],
  [
    [
      'Giden webhook / Slack / Teams',
      'Uygulama → dış',
      'Space başına; `X-Scrum-Signature: sha256=HMAC(secret, ts.gövde)`; 10 sn zaman aşımı; özel ağ adresleri `WEBHOOK_ALLOW_PRIVATE_HOSTS` ile.',
    ],
    [
      'GitHub / GitLab',
      'Dış → uygulama',
      '`POST /api/integrations/git/:id`; imza (`X-Hub-Signature-256` / `X-Gitlab-Token`) doğrulanır; commit/PR metnindeki `PRJ-142` anahtarları `git_links`’e bağlanır. İş alanlarını değiştirmez.',
    ],
    [
      'Anthropic API',
      'Uygulama → dış',
      '`ANTHROPIC_API_KEY` yoksa tamamen kapalı. Yalnızca ilgili işin metni gider (≤12.000 karakter); çıktı Zod ile doğrulanır, kullanıcı onaylamadan hiçbir şey yazılmaz. Kullanıcı başına dakikada 10 istek.',
    ],
    ['SMTP', 'Uygulama → dış', 'Nodemailer; geliştirmede Mailpit (`localhost:1025`, arayüz 8025).'],
  ],
  [2.4, 1.8, 5.8],
);

/* ------------------------------------------------------------------ 7 */
h1('7. Raporların veri kaynağı');
table(
  ['Rapor', 'Kaynak'],
  [
    [
      'Burndown / Burn-up',
      '`sprint_snapshots` (başlarken, her gece, kapanırken) + bugün için canlı hesap; kapsam değişikliği `sprint_item_events`.',
    ],
    [
      'Velocity',
      'Sprint kapanırken dondurulan `sprints.committedPoints` / `completedPoints`, son 10 sprint.',
    ],
    [
      'Aktivite / denetim günlüğü',
      '`activity_events` (alan, eski, yeni, aktör, zaman); CSV dışa aktarma.',
    ],
    [
      'İş yükü, zaman çizelgesi, Gantt',
      '`work_items` + `work_item_assignees` + `time_entries`, sorgu anında hesaplanır.',
    ],
    ['Excel / CSV / JSON', 'Aynı sorgu servisleri; öğe erişim süzgeci burada da uygulanır.'],
  ],
  [2.6, 7.4],
);

/* ------------------------------------------------------------------ 8 */
h1('8. Arayüz veri katmanı');
bullets([
  '**Rotalar:** `src/routes` altındaki dosyalar = adresler (ör. `routes/_app/spaces/$spaceId/kanban.tsx`). Filtre ve görünüm durumu adres arama parametrelerinde, böylece bağlantı paylaşılabilir.',
  '**Sunucu verisi** yalnızca TanStack Query ile; her özellik klasöründe `queries.ts` (sorgu anahtarları + mutasyonlar). Mutasyon sonrası ilgili anahtarlar geçersiz kılınır.',
  '**Yerel durum** yalnızca ekran içi (açık pencere, sürüklenen öğe). Kalıcı tercih sunucuda (`users.locale`, kayıtlı görünümler, panel yerleşimi).',
  '**Dil:** i18next; arayüz metinleri `locales/{tr,en}/common.json`. Varsayılan liste ve durum adları veritabanında işaret olarak tutulur, görüntülenirken çevrilir (`lib/default-names.ts`).',
  '**Yardım:** kılavuz içeriği `features/help/guide.{tr,en}.json`; aynı içerik Word kılavuzunu üretir (`scripts/docs/make-guide-docx.cjs`).',
]);

/* ------------------------------------------------------------------ 9 */
h1('9. Yedekleme ve geri yükleme');
table(
  ['Tür', 'Nasıl', 'Ne içerir'],
  [
    [
      'Sunucu yedeği',
      '`backup` konteyneri (`docker/backup.sh`), her gün `BACKUP_HOUR`’da',
      '`pg_dump --format=custom` → `backups/db-<zaman>.dump` ve `uploads-<zaman>.tar.gz`; `BACKUP_KEEP_DAYS` (14) günden eskiler silinir.',
    ],
    [
      'Uygulama içi yedek',
      '`GET …/spaces/:id/backup.zip`, `…/sprints/:id/backup.zip`',
      'Biçim `egebis-seyir-backup` v1: tablo satırları JSON + dosyalar. Geri yükleme yeni Space ya da mevcut Space’e yeni sprint olarak, yeni kimliklerle.',
    ],
  ],
  [2, 3.3, 4.7],
);
code([
  '# Sunucu yedeğinden dönüş (örnek)',
  'docker compose exec -T postgres pg_restore --clean --no-owner -d $POSTGRES_DB < backups/db-<zaman>.dump',
  'tar -xzf backups/uploads-<zaman>.tar.gz -C <uploads volume yolu>',
]);
p('Yedekler aynı sunucudadır; sunucu dışına kopyalamak işletmenin sorumluluğundadır.');

/* ------------------------------------------------------------------ 10 */
h1('10. Dağıtım ve yapılandırma');
table(
  ['Servis', 'Görev'],
  [
    ['`postgres`', 'PostgreSQL 17; veri `postgres-data` volume’ünde'],
    ['`migrate`', 'Açılışta `prisma migrate deploy` çalıştırır, kapanır'],
    ['`api`', 'NestJS; ekler `uploads` volume’ünde; `/api/health`'],
    ['`web`', 'Caddy: arayüz + `/api` vekili + HTTPS'],
    ['`backup`', 'Günlük veritabanı ve dosya yedeği'],
  ],
  [2, 8],
);
h2('Önemli ortam değişkenleri');
table(
  ['Değişken', 'Varsayılan', 'Açıklama'],
  [
    ['`DATABASE_URL`', '—', 'PostgreSQL bağlantısı (zorunlu)'],
    ['`APP_URL`', '`http://localhost:5173`', 'E-postadaki bağlantıların kökü'],
    ['`COOKIE_SECURE`', 'production’da açık', 'Yalnız HTTP kurulumda `false`'],
    ['`SMTP_*`, `MAIL_FROM`', 'localhost:1025', 'E-posta sunucusu'],
    ['`QUEUE_ENABLED`', '`true`', 'Kapalıysa işler istek içinde çalışır'],
    ['`UPLOAD_DIR`, `MAX_UPLOAD_MB`', '`./data/uploads`, 100', 'Dosya yeri ve sınırı'],
    ['`ANTHROPIC_API_KEY`, `AI_MODEL`', 'yok, `claude-sonnet-5-5`', 'Yapay zekâ (isteğe bağlı)'],
    ['`WEBHOOK_ALLOW_PRIVATE_HOSTS`', 'production’da kapalı', 'Webhook’un iç ağa gidebilmesi'],
    ['`AUTH_RATE_LIMIT`, `TRUST_PROXY`', '10, `false`', 'Giriş oran sınırı, gerçek IP'],
  ],
  [3.2, 2.6, 4.2],
);
p(
  'Ortam değişkenleri açılışta Zod ile doğrulanır (`infra/config/env.ts`); eksik ya da hatalıysa uygulama başlamaz. Kurulum adımları: `docs/DEPLOY.md`.',
);

/* ------------------------------------------------------------------ 11 */
h1('11. Geliştirme ve test');
code([
  'pnpm dev                                   # web :5173 + api :3000 (izleme modunda)',
  'cd packages/shared && npm run build        # ortak paket değişince',
  'cd apps/api && npx prisma migrate dev      # yeni migration',
  'npx vitest run                             # birim testleri (shared, api, web)',
  'cd apps/api && DATABASE_URL=…/scrum_test npx vitest run -c vitest.int.config.ts',
  'cd apps/web && E2E_DATABASE_URL=…/scrum_e2e npx playwright test',
  'GUIDE_SHOTS=1 GUIDE_LANG=tr npx playwright test guide-screenshots   # kılavuz görselleri',
]);
bullets([
  '**Birim:** saf kurallar (izin matrisi, sprint kuralları, rank, otomasyon döngüsü).',
  '**Entegrasyon:** gerçek PostgreSQL üzerinde HTTP uçları; yetki sızıntısı, tetikleyiciler, kuyruk (`QUEUE_ENABLED=false`), e-posta (`MAIL_TRANSPORT=memory`).',
  '**E2E:** Playwright, ayrı veritabanı ve port 5174; her koşuda veritabanı sıfırlanır.',
]);

/* ------------------------------------------------------------------ 12 */
h1('12. Bilinen sınırlar');
bullets([
  'Tek API süreci ve tek sunucu: yatay ölçek ve yüksek erişilebilirlik yok; yapay zekâ oran sınırı süreç belleğinde.',
  'Gerçek zamanlı güncelleme (WebSocket) yok; bildirim ve mesajlar yoklama ile.',
  'Olaylar commit’ten sonra bırakılır (outbox yok): süreç tam o anda çökerse bir bildirim/webhook kaybolabilir.',
  'Yedekler aynı sunucuda; dış kopya işletmeye bırakılır.',
  'Dosyalar yerel diskte; birden çok API sunucusu için S3 uyumlu depoya geçilmelidir.',
]);

const document = new Document({
  creator: 'Egebis',
  title: 'Egebis Seyir — Teknik Dokümantasyon',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font: FONT, size: 32, bold: true, color: PURPLE },
        paragraph: { outlineLevel: 0 },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font: FONT, size: 25, bold: true, color: ACCENT },
        paragraph: { outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'dots',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 500, hanging: 260 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: 'Egebis Seyir — Teknik Dokümantasyon   ·   Sayfa ',
                  font: FONT,
                  size: 16,
                  color: GREY,
                }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }),
              ],
            }),
          ],
        }),
      },
      children: doc,
    },
  ],
});

Packer.toBuffer(document).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('yazıldı:', out);
});
