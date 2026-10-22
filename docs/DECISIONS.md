# Karar Kaydı (Architecture Decision Records)

> Projede alınan her önemli karar burada. Format: tarih, karar, gerekçe, alternatifler.
> Yeni karar = yeni ADR. Eski karar değişirse eskisi silinmez; durumu "Değiştirildi → ADR-0XX" yapılır.
> Kaynak: `PROJECT_BRIEF.md`, Bölüm 18 cevapları (2026-10-02).

| Durum kodları    | Anlamı                   |
| ---------------- | ------------------------ |
| **Kabul**        | Geçerli karar            |
| **Değiştirildi** | Yerine yeni ADR geldi    |
| **Askıda**       | Tekrar değerlendirilecek |

---

## ADR-001 — Mimari stil: Modüler monolit

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Tek dağıtılabilir backend uygulaması; içi net sınırlı modüllere bölünür (auth, workspaces, spaces, work-items, sprints, docs…). Modüller birbirinin tablosuna doğrudan değil, servis arayüzü üzerinden erişir.
- **Gerekçe:** Şirket içi, <200 kullanıcı, tek geliştirici (Claude). Tek deploy, tek DB transaction'ı (iş kuralları için kritik), basit hata ayıklama. Sınırlar net olduğu için ileride modül ayrıştırmak mümkün.
- **Alternatifler:** Mikroservis (bu ölçekte operasyon yükü ve dağıtık transaction karmaşası), serverless (self-host hedefiyle uyumsuz).

## ADR-002 — Dil: TypeScript (strict), uçtan uca

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Frontend, backend ve ortak paket TypeScript `strict` modda.
- **Gerekçe:** Kodun tamamını Claude yazıp güncelleyecek; tek dil = tipler, doğrulama şemaları, izin sabitleri ve saf Scrum kuralları tek yerde. Bir alan değişince derleyici hem API hem UI'daki etkiyi yakalar ("güncellemesi kolay" hedefi).
- **Alternatifler:** .NET + React (iki dil, tip paylaşımı kod üretimiyle), Python FastAPI + React (değerlendirildi: sade ve geçerli, ancak iki dil ve kural tekrarı; ağır AI/ML ihtiyacı yok).

## ADR-003 — Frontend: React + Vite SPA

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** React SPA (Vite). Yönlendirme: TanStack Router (tip güvenli URL arama parametreleri → filtre/görünüm durumu URL'de). Sunucu durumu: TanStack Query (optimistic update). İstemci UI durumu: Zustand (minimum).
- **Gerekçe:** Uygulama tamamen giriş arkasında ve yoğun etkileşimli (sürükle-bırak, board, editör). SEO/SSR gereksiz. API'nin ayrı olması mobil/public API (F3) ve realtime (F2) için temiz.
- **Alternatifler:** Next.js (SSR faydasız, WebSocket/realtime ve ayrı API ihtiyacı), Vue/Nuxt (ekosistem ClickUp benzeri bileşenlerde daha dar).

## ADR-004 — UI kiti: Tailwind CSS + shadcn/ui (Radix)

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Tailwind + shadcn/ui bileşenleri (kaynak kod repoya kopyalanır), Radix primitive'leri. Tasarım token'ları CSS değişkeni; açık/koyu tema.
- **Gerekçe:** Erişilebilirlik (klavye, ekran okuyucu) hazır; görünüm tamamen bizde → ClickUp/Linear/Jira karışımı sade görsel dil kurulabilir.
- **Alternatifler:** MUI, Ant Design (hazır ama kendi görsel dilini dayatıyor, özelleştirmek zor).

## ADR-005 — Etkileşim kütüphaneleri

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** dnd-kit (sürükle-bırak), TanStack Table + TanStack Virtual (binlerce satırda akıcı liste/tablo), Tiptap (Docs + açıklama editörü; ProseMirror tabanlı, F2'de Yjs ile eşzamanlı düzenlemeye hazır), Recharts (burndown/velocity), React Hook Form + Zod (formlar), i18next (TR/EN).
- **Gerekçe:** Her biri alanında olgun, headless/özelleştirilebilir. Tiptap seçimi F2 eşzamanlı düzenlemede editörü yeniden yazmamayı sağlar.
- **Alternatifler:** react-beautiful-dnd (bakımı bitti), Slate/Lexical (Yjs desteği/eklenti ekosistemi daha zayıf), ECharts (daha ağır; gerekirse F2 raporlarında).

## ADR-006 — Backend: NestJS

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** NestJS (Express adaptörü). Modül başına `controller → service → domain → Prisma` katmanları.
- **Gerekçe:** Opinionated yapı (modül, DI, guard, interceptor) büyük projede tutarlılığı kendiliğinden sağlar. Yetki = guard, tenant bağlamı = CLS, audit = interceptor/servis doğal oturur. WebSocket gateway (F2) yerleşik.
- **Alternatifler:** Çıplak Fastify/Express (yapıyı elle kurmak), tRPC (public API F3'e uygun değil).

## ADR-007 — API stili: REST + OpenAPI, ortak Zod şemaları

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** REST uç noktaları. İstek/yanıt şemaları `packages/shared` içinde Zod ile tanımlanır; API (nestjs-zod) doğrular ve OpenAPI üretir, web aynı şemaları/tipleri kullanır. Hatalar makine okunur **kod** döner (`SPRINT_ALREADY_ACTIVE`), kullanıcı metnini UI i18n ile üretir.
- **Gerekçe:** Tek sözleşme kaynağı; F3 public API ve olası mobil istemci için standart. Hata kodu yaklaşımı TR/EN desteğini backend'den bağımsız kılar.
- **Alternatifler:** GraphQL (bu ölçekte gereksiz karmaşıklık, cache/yetki zorluğu), tRPC (dış istemciye kapalı).

## ADR-008 — Veritabanı: PostgreSQL 17+

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** PostgreSQL (geliştirmede Docker ile 17).
- **Gerekçe:** Domain ilişkisel (hiyerarşi, üyelik, sprint-öğe geçmişi). JSONB (F2 custom field), tam metin arama, recursive CTE (hiyerarşi), güçlü transaction. Kuyruk (pg-boss) ve aramayı da üstlenerek ek servis ihtiyacını kaldırır.
- **Alternatifler:** MySQL (FTS/JSONB zayıf), MongoDB (ilişkisel domain'e uymaz).

## ADR-009 — ORM: Prisma

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Prisma şeması tek veri modeli kaynağı; migration'lar Prisma Migrate ile. Ağır rapor sorguları TypedSQL / raw SQL.
- **Gerekçe:** Okunabilir tek şema dosyası, otomatik tipler, güvenilir migration akışı.
- **Alternatifler:** Drizzle (SQL'e yakın ama şema dağınık), TypeORM (tip güvenliği ve bakım zayıf).

## ADR-010 — Kimlik doğrulama: Sunucu tarafı oturum + cookie

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Oturumlar DB'de; tarayıcıda `httpOnly + Secure + SameSite=Lax` cookie. Şifre: argon2id. CSRF koruması (token). Şifre sıfırlama ve davet tokenları DB'de hash'li ve süreli. Kullanıcı aktif oturumlarını görür/sonlandırır. Giriş uçlarında oran sınırlama. SSO (OIDC) F3'te `openid-client` ile eklenecek şekilde ayrı strateji.
- **Gerekçe:** "Aktif oturumları görme ve sonlandırma" MVP şartı → DB oturumu doğal çözüm. Cookie + httpOnly XSS ile token çalınmasını engeller.
- **Alternatifler:** JWT (anında iptal zor), Keycloak (güçlü ama ayrı sunucu ve operasyon yükü).

## ADR-011 — Yetkilendirme: İzin tabanlı RBAC

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** İzin anahtarları (`sprint.start`, `backlog.rank`, `workItem.update`…) `packages/shared` içinde sabit. Rol = izin seti; DB'de tutulur, brief §7 matrisinden seed edilir. İki kapsam: workspace rolü (Owner/Admin/Member/Guest) + space Scrum rolü (PO/SM/Developer/Stakeholder). Kontrol: `@RequirePermission()` guard; koşullu kurallar ("kendi görevi") için policy fonksiyonları. Web aynı sabitlerle butonları gizler/pasifler.
- **Gerekçe:** Brief rol matrisinin "esnetilebilir" olmasını istiyor; F2 özel rol = sadece veri. Kontrol tek yerde, test edilebilir.
- **Alternatifler:** Koda gömülü rol kontrolleri (esnetilemez), CASL (bu ihtiyaç için fazla soyut).

## ADR-012 — Veri izolasyonu (tenant)

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Tek DB/şema. Workspace'e ait her tabloda `workspaceId`. İstek bağlamı (nestjs-cls) aktif workspace'i taşır; Prisma extension sorgulara otomatik kapsam ekler. Çapraz-workspace erişim için otomatik testler (beklenen: 404).
- **Gerekçe:** Uygulama şirket içi (SaaS değil) ama brief workspace izolasyonunu şart koşuyor. Bu yaklaşım basit ve yeterli.
- **Alternatifler:** Workspace başına şema/DB (iç kullanımda gereksiz operasyon), Postgres RLS (ileride ek savunma katmanı olarak eklenebilir).

## ADR-013 — Durum (Status) modeli: veri + kategori

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Durumlar Space bazlı tabloda (varsayılan set seed edilir: Backlog, To Do, In Progress, In Review, Done). Her durumun **kategorisi** var: `NOT_STARTED / ACTIVE / DONE`. Velocity, burndown, "Done" kuralları kategoriye bakar, isme değil.
- **Gerekçe:** Custom workflow F2'de geliyor; baştan veri olarak tutmak F2'yi sadece UI işine indirger. Brief §6.1/7 velocity'yi "Done kategorisi" ile tanımlıyor.
- **Alternatifler:** Sabit enum durumlar (F2'de tüm sorgu ve raporların yeniden yazılması).

## ADR-014 — Sıralama: Fractional indexing

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Backlog, sprint, board sütunu ve list sıraları string `rank` anahtarıyla (fractional indexing). Sürükle-bırak = tek satır güncelleme; nadiren yeniden dengeleme.
- **Gerekçe:** Binlerce öğede anlık sürükle-bırak (brief §11, §12).
- **Alternatifler:** Tamsayı sıra (her sürüklemede çok satır güncelleme, çakışma).

## ADR-015 — Olay kaydı (activity events) ve sprint üyelik geçmişi

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Append-only `activity_events` tablosu: alan bazlı eski/yeni değer, aktör, zaman. Değişiklikle **aynı transaction** içinde yazılır. Sprint–iş öğesi ilişkisi geçmiş tablosunda tutulur (eklenme nedeni: `planned / scope_change / carried_over`, çıkış zamanı).
- **Gerekçe:** Aktivite akışı, audit, bildirimler, burndown, scope change raporu ve F2 CFD/cycle time aynı kaynaktan beslenir. Brief §6.1 "devir geçmişi korunur" ve "scope change raporda gösterilir" diyor.
- **Alternatifler:** Sadece anlık durum saklamak (geçmişe dönük rapor üretilemez).

## ADR-016 — Okunabilir iş öğesi ID'si

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Space anahtarı (ör. `MOB`) + Space bazlı sayaç → `MOB-142`. Sayaç transaction içinde kilitli artırılır. Birincil anahtar ayrıca UUID.
- **Gerekçe:** Brief §5.4 okunabilir ve paylaşılabilir ID istiyor; F3 GitHub entegrasyonu bu ID ile eşleşecek.
- **Açık nokta:** ~~Öğe başka Space'e taşınınca ID davranışı Faz 1'de kararlaştırılacak.~~ Çözüldü → ADR-033.

## ADR-017 — Arka plan işleri: pg-boss

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Postgres tabanlı kuyruk (pg-boss): e-posta gönderimi, bildirim dağıtımı, günlük sprint snapshot, çöp kutusu temizliği.
- **Gerekçe:** Ek servis (Redis) gerektirmez; kendi sunucuda daha az hareketli parça. Bu ölçek için performans yeterli.
- **Alternatifler:** BullMQ + Redis (güçlü ama ek altyapı).

## ADR-018 — Realtime hazırlığı

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** MVP: optimistic update + sorgu yenileme (invalidation/focus refetch). Domain olayları dahili event bus üzerinden yayılır; F2'de Socket.IO gateway bu olaylara abone olur (refactor gerekmez). Tek API instance'ı olduğu için Redis adaptörü gerekmez.
- **Gerekçe:** Realtime F2 kapsamında; temel şimdiden atılır.

## ADR-019 — Arama: PostgreSQL tam metin arama

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** `tsvector` tabanlı FTS + `pg_trgm` (ID/başlık parçalı eşleşme).
- **Gerekçe:** Ölçek küçük; ek arama servisi gereksiz.
- **Alternatifler:** Meilisearch/OpenSearch (gerekirse ileride).

## ADR-020 — Dosya depolama: Soyutlama + yerel disk

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** `StorageService` arayüzü; varsayılan adaptör yerel disk (Docker volume). Yükleme API üzerinden stream, boyut/tür limitleri ayarlanabilir. S3 uyumlu adaptör ileride tek ayarla eklenebilir.
- **Gerekçe:** Kendi sunucu, küçük ölçek; ek servis yok, yedekleme sunucu yedeğiyle birlikte.
- **Alternatifler:** MinIO (ek servis; şimdilik gereksiz).

## ADR-021 — E-posta: Nodemailer + şirket SMTP

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Nodemailer ile SMTP. Şablonlar React Email (TR/EN). Geliştirmede Mailpit (sahte posta kutusu).
- **Gerekçe:** Self-host; harici e-posta servisine veri gönderilmez.
- **Alternatifler:** SendGrid/SES vb. (harici servis).

## ADR-022 — Zengin metin saklama

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Tiptap/ProseMirror JSON saklanır; aramaya düz metin ayrıca çıkarılır. Render'da ham HTML kullanılmaz (XSS). Mention düğümleri bildirim üretir. Doküman sürümleri snapshot tablosunda.
- **Gerekçe:** Yapısal veri → mention/link çıkarımı kolay, güvenli render, F2 eşzamanlı düzenleme uyumu.
- **Alternatifler:** HTML (XSS riski), Markdown (zengin tablo/mention zor).

## ADR-023 — Tarih ve saat

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Zaman damgaları DB'de `timestamptz` (UTC). Kullanıcı saat dilimi profilde. Sprint başlangıç/bitiş tarihleri sadece tarih (date) + Space saat dilimi (burndown gün sınırları buna göre).
- **Gerekçe:** Brief §12 saat dilimi desteği; burndown günlerinin tutarlı olması.

## ADR-024 — Uluslararasılaştırma

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** i18next; varsayılan Türkçe, İngilizce ikinci dil. Kod içi isimler İngilizce; dokümanlar Türkçe.
- **Gerekçe:** Brief §12 ve §0.9; Scrum terimleri zaten İngilizce.

## ADR-025 — Monorepo: pnpm workspaces + Turborepo

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** `apps/web`, `apps/api`, `packages/shared`. pnpm workspaces, görev orkestrasyonu Turborepo.
- **Alternatifler:** Nx (ağır), npm workspaces (yavaş, zayıf izolasyon).

## ADR-026 — Kod kalitesi

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** TS strict, ESLint (typescript-eslint, react-hooks) + Prettier, husky + lint-staged (commit öncesi), Conventional Commits.
- **Alternatifler:** Biome (hızlı ama eklenti ekosistemi dar).

## ADR-027 — Test stratejisi

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:**
  - **Unit (Vitest):** `packages/shared` ve API `domain/` katmanı. Brief Bölüm 6 Scrum kurallarının tamamı unit testle korunur.
  - **Entegrasyon (Vitest + supertest + gerçek Postgres):** API uçları, yetki ve workspace izolasyonu. Docker Compose içindeki ayrı `scrum_test` veritabanı; test öncesi `prisma migrate deploy` otomatik.
  - **E2E (Playwright):** Kritik akışlar (Akış C sprint planlama, D sprint içi çalışma, E sprint kapanışı).
- **Alternatifler:** Jest (daha yavaş, ESM desteği zayıf).

## ADR-028 — Dağıtım

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Docker Compose: Caddy (reverse proxy + TLS + web statik dosyaları) + api + postgres + yedek işi (pg_dump zamanlanmış + uploads volume). Şirketin kendi sunucusunda; ortam bağımsız.
- **Alternatifler:** Kubernetes (bu ölçekte aşırı).

## ADR-029 — Gözlemlenebilirlik

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** pino ile yapılandırılmış JSON log + istek kimliği; `/health` ucu (DB kontrolü dahil). Hata izleme (self-host GlitchTip) ileride.

## ADR-030 — Proje konumu ve versiyon kontrolü

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** Kod `C:\dev\scrum-manager` (OneDrive dışı), yerel git (`main`). Uzak depo ve CI sonra.
- **Gerekçe:** OneDrive `node_modules` senkronu kilit/yavaşlık yaratır; yoldaki boşluk bazı araçları bozar.

## ADR-031 — Sürüm sabitlemeleri (Faz 0 kurulumu)

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:**
  - **TypeScript 6.0** (7.0 yayında ama typescript-eslint henüz `<6.1` destekliyor).
  - **NestJS 11** (12 ESM'e geçti; nestjs-zod henüz yalnızca 10/11 destekliyor).
  - **Prisma 7.10** (`latest` etiketi 8.0 RC'yi gösteriyor; kararlı sürümde kalındı). Yeni `prisma-client` üreticisi, `moduleFormat = "cjs"`, `@prisma/adapter-pg` sürücü adaptörü, bağlantı adresi `prisma.config.ts` içinde.
  - Diğerleri güncel: React 19.3, Vite 8, Vitest 5, Tailwind 4.3, TanStack Router/Query, Zod 4.6, ESLint 10, pnpm 12, Node 24.
- **Gerekçe:** Ekosistem uyumluluğu. Engel kalkınca (typescript-eslint TS 7, nestjs-zod Nest 12) yükseltme ayrı bir iş olarak yapılır.

## ADR-032 — Test dönüştürücüsü: Vite/Oxc (SWC değil)

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:** API Vitest testleri NestJS decorator metadata'sını Vite 8'in yerleşik Oxc dönüştürücüsüyle üretir (`decorator.legacy + emitDecoratorMetadata`). Derleme (`nest build`) tsc ile.
- **Gerekçe:** `@swc/core` native modülü bu ortamda önbellek klasörü izin denetimi nedeniyle yüklenemiyor; Oxc ek bağımlılık gerektirmiyor.
- **Alternatifler:** unplugin-swc (yüklenemedi), ts-jest/Jest (yavaş).

## ADR-033 — Okunabilir ID asla değişmez (ClickUp davranışı)

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Bir iş öğesine verilen okunabilir ID (`MOB-142`) ömür boyu sabittir. Öğe başka Space'e taşınsa da, Space anahtarı sonradan değişse de ID aynı kalır.
- **Sonuçları:**
  - ID, öğe üzerinde kalıcı olarak saklanır (`keyPrefix` + `number`); o anki Space'ten türetilmez.
  - Benzersizlik workspace genelindedir: aynı workspace'te iki öğe aynı ID'yi taşıyamaz.
  - Space anahtarları workspace içinde benzersizdir; bir anahtar değiştirilirse eskisi rezerve kalır, başka Space'e verilemez (eski ID'lerle çakışmasın).
  - Anahtar değişikliği yalnızca yeni öğeleri etkiler; sayaç kaldığı yerden devam eder.
  - ID ile arama ve paylaşılan bağlantılar (`/MOB-142`) Space'ten bağımsız, workspace içinde çözülür.
- **Gerekçe:** Paylaşılmış bağlantılar, commit mesajları (F3 GitHub entegrasyonu) ve dokümanlardaki ID referansları taşımadan sonra kırılmaz.
- **Alternatifler:** Jira davranışı (taşınınca yeni ID verilir, eskisi yönlendirilir): yönlendirme tablosu gerektirir, dış referanslarda karışıklık yaratır.

## ADR-034 — Kayıt yalnızca davetle

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Açık kayıt yok. Kullanıcılar yalnızca davet bağlantısıyla hesap oluşturur (davet = kayıt). Giriş ekranında "Kayıt ol" bulunmaz.
  - Davet: e-posta + workspace rolü (+ Guest için Space listesi). Token DB'de hash'li, süreli (varsayılan 7 gün), tek kullanımlık; yeniden gönderilebilir ve iptal edilebilir.
  - Davet kabulünde: ad, şifre, dil tercihi; e-posta davetten gelir, değiştirilemez (e-posta doğrulaması davetle sağlanmış olur).
  - **İlk kurulum (onaylandı):** Veritabanında hiç kullanıcı yokken tek seferlik kurulum ekranı ilk workspace'i ve Owner'ı oluşturur. Ekran, sunucu açılışında loglara yazılan tek kullanımlık kurulum anahtarı olmadan çalışmaz; kurulum bitince kalıcı olarak kapanır.
- **Gerekçe:** Kurum içi uygulama; ClickUp'taki "workspace'e davetle katılım" davranışı. Yetkisiz hesap açılmasını baştan engeller.
- **Açık nokta:** Şifre politikası (uzunluk/karmaşıklık) geliştirme aşamasında uygulanmaz (kullanıcı kararı); yalnızca boş olamaz ve en fazla 256 karakterdir. Production öncesi belirlenecek.
- **Alternatifler:** Kurum e-posta uzantısıyla açık kayıt; herkese açık kayıt + davetle workspace'e katılım.

## ADR-035 — Guest kapsamı: yalnızca paylaşılan Space'ler

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Guest workspace rolündeki kullanıcı yalnızca davet edildiği/paylaşılan Space'leri görür ve orada Stakeholder izinleriyle çalışır (görüntüleme, yorum, rapor, doküman görüntüleme). Diğer Space'ler, workspace üye listesi ve ayarlar görünmez. Global arama da yalnızca erişilebilir Space'lerde arar.
- **Gerekçe:** ClickUp davranışı; brief §2 "sınırlı, çoğunlukla salt okunur erişim, yorum yapabilme".
- **Alternatifler:** Öğe bazlı paylaşım (görev/liste/doküman tek tek) — daha ince ama yetki modeli karmaşıklaşır; ileride eklenebilir.

## ADR-036 — Varsayılan durumlar: Türkçe adlar ve duruma özel renk

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Yeni Space'in durumları oluşturanın diline göre seed edilir. Türkçe: Backlog, Yapılacak, Devam ediyor, İncelemede, Tamamlandı. İngilizce: Backlog, To Do, In Progress, In Review, Done. Her durumun kendi rengi vardır (`Status.color`); ikon ve iş kuralları kategoriden gelir (ADR-013).
- **Gerekçe:** Arayüz varsayılan dili Türkçe; durum adları veri olduğu için kullanıcı sonradan değiştirebilir (F2 custom workflow).

## ADR-037 — Kişisel tercihler kullanıcı menüsünde ve sunucuda

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Dil ve tema seçimi üst çubuktan kullanıcı menüsüne (avatar) ve Profil › Tercihler sayfasına taşınır. Tercihler kullanıcı kaydında saklanır (cihazlar arası aynı); girişten önce tarayıcıdaki son seçim kullanılır.

## ADR-038 — Faz 1 kimlik doğrulama ayrıntıları

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:**
  - Şifre özeti: Node'un yerleşik `crypto.argon2` (argon2id, m=19456 KiB, t=2, p=1), PHC biçiminde saklanır; native paket gerekmez.
  - Oturum: 32 bayt rastgele token `sm_session` cookie'sinde (httpOnly, SameSite=Lax, production'da Secure); DB'de yalnızca SHA-256 özeti. "Beni hatırla" → 30 gün, aksi halde 1 gün.
  - CSRF: double-submit — okunabilir `sm_csrf` cookie'si ve durum değiştiren her istekte aynı değerli `x-csrf-token` başlığı.
  - Oran sınırlama: giriş, kurulum, şifre sıfırlama ve davet kabul uçlarında (@nestjs/throttler, bellek içi; tek instance).
  - Workspace Owner/Admin, tüm Space'lerde Space izinlerinin tamamına sahiptir (brief §6.1.6 "PO ve Admin").
  - E-posta şablonları Faz 1'de basit TS fonksiyonları (TR/EN, HTML + düz metin); React Email (ADR-021) gerçekten gerekirse eklenir.

## ADR-039 — Space görünürlüğü: açık / özel (ClickUp davranışı)

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Her Space'in "özel" ayarı vardır (varsayılan: açık).
  - **Açık Space:** Workspace'in tüm Member'ları görür; üye değilse Stakeholder izinleriyle (görüntüleme, yorum, rapor, doküman görüntüleme). İş yapmak için Space üyesi olmak gerekir.
  - **Özel Space:** Yalnızca Space üyeleri görür; üye olmayana Space yokmuş gibi 404 döner.
  - **Owner/Admin:** Tüm Space'leri görür ve tüm Space izinlerine sahiptir (ADR-038).
  - **Guest:** Açık olsa bile yalnızca üyesi olduğu (paylaşılan) Space'leri görür; orada yalnızca Stakeholder rolü alabilir (ADR-035).
- **Uygulama:** Etkin Space izinleri saf bir fonksiyonla hesaplanır (`spacePermissions`, shared). API'de `@RequireSpacePermission` + `SpaceAccessGuard`; Space, rota parametresinden (`spaceId`, `folderId`, `listId`) çözülür.
- **Alternatifler:** Yalnızca üyeler görür (Jira): yöneticiler dışında takımlar arası şeffaflık kalmaz.

## ADR-040 — Space yapısı yetkileri

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:**
  - Yeni Space izni `space.lists.manage`: Folder/List oluşturma, yeniden adlandırma, sıralama, taşıma, arşivleme, silme. Varsayılan: Product Owner, Scrum Master, Developer (silinenler geri alınabildiği için risk düşük).
  - `space.settings` (PO, SM): Space adı/anahtarı/rengi/görünürlüğü, çalışma modu, üyeler ve Scrum rolleri, Space'i arşivleme/silme.
  - Space'lerin kenar çubuğundaki sırası herkes için ortaktır; yalnızca `workspace.settings` (Owner/Admin) değiştirir.
  - Space'i oluşturan kişi varsayılan olarak Product Owner eklenir (oluşturma penceresinde değiştirilebilir).
  - Mevcut DB rollerine yeni izin migration ile eklenir.

## ADR-041 — Arşiv ve çöp kutusu

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı: 30 gün)
- **Karar:**
  - **Arşiv:** Space/Folder/List kenar çubuğundan gizlenir; bağlantıyla açılır, "Arşivden çıkar" ile geri gelir. Süre sınırı yok.
  - **Silme = çöp kutusu:** `deletedAt` işaretlenir; 30 gün içinde geri alınabilir, sonra her gece çalışan iş (pg-boss) kalıcı olarak siler.
  - Alt öğeler ebeveynle birlikte gizlenir, ayrıca işaretlenmez; ebeveyn geri gelince alt öğeler de geri gelir.
  - Arşivleme ve silme sonrası bildirimde "Geri al" vardır (brief §11 Undo).
  - Ayarlar › Arşiv ve çöp kutusu sayfası, kullanıcının yönetebildiği öğeleri listeler (brief §10 madde 20).
- **Alternatifler:** Süresiz saklama (veritabanı büyür; kullanıcı 30 günü seçti).

## ADR-042 — Member'ların Space oluşturması bir workspace ayarıdır

- **Tarih:** 2026-10-02 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** Varsayılan açık. Owner/Admin, Ayarlar › Genel'den kapatabilir. Ayar ayrı bir alan olarak değil, MEMBER rolünün izin setinde `space.create` bulunup bulunmamasıyla saklanır (tek doğruluk kaynağı: rol verisi, ADR-011).

## ADR-043 — Space ayrıntıları (Faz 1.2)

- **Tarih:** 2026-10-02 · **Durum:** Kabul
- **Karar:**
  - **Anahtar:** 2–10 karakter, harfle başlar, yalnızca A–Z ve 0–9 (`MOB`). Addan öneri üretilir (Türkçe harfler sadeleştirilir). Workspace içinde kullanılmış her anahtar `space_keys` tablosunda rezerve kalır; Space silinse bile (ADR-033).
  - **Durumlar** Space düzeyindedir (ADR-013). Faz 1'de Space ayarlarında salt okunur gösterilir; düzenleme F2 (custom workflow).
  - **Tahmin ölçeği:** Fibonacci (varsayılan), T-shirt (XS–XL), Sayı (serbest). Özel ölçek F2.
  - **Çalışma modu:** Scrum (Sprint/Epic/Backlog açık) veya Basit liste. Sprint süresi 1–4 hafta (varsayılan 2).
  - **Yeni Space** boş bir "Görevler" / "Tasks" listesiyle açılır (iş öğeleri her zaman bir List'te durur).
  - **Sıralama:** Kesirli sıralama anahtarı (ADR-014, `fractional-indexing`). Space kökünde önce Folder'lar, sonra klasörsüz List'ler.
  - **Taşıma:** List, aynı Space içinde Folder'lar ve kök arasında taşınabilir. Space'ler arası taşıma iş öğesi taşımasıyla birlikte ele alınacak (1.3).
  - **Guest daveti** en az bir Space seçilerek yapılır; davet kabulünde Guest bu Space'lere Stakeholder olarak eklenir. Bir üye Guest'e düşürülürse Space rolleri Stakeholder'a iner.
  - **Favoriler** kişiseldir (Space/Folder/List); erişimi kalkan veya silinen öğe favorilerde görünmez.

## ADR-044 — İş öğesi modeli ve okunabilir ID sayacı (Faz 1.3)

- **Tarih:** 2026-10-02 · **Durum:** Kabul (ADR-033 ve brief §5.4'ün uygulaması; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - Tek `work_items` tablosu; tip alanıyla Epic/Story/Task/Sub-task/Bug. Bug'a (önem, tekrar adımları, beklenen/gerçek sonuç, ortam, bulunduğu sürüm) ve Epic'e (hedef, T-shirt boyutu, renk) özel alanlar nullable sütunlardır; tipe uymayan alan API'de reddedilir.
  - ID: `keyPrefix` + `number` öğede kalıcı saklanır; `(workspaceId, keyPrefix, number)` benzersizdir. Sayaç Space başınadır (`spaces.itemCounter`), öğe oluşturulurken aynı transaction'da atomik artırılır; anahtar değişse de sayaç sürer.
  - Her öğe bir List'te durur (`listId`) ve bir Space'e aittir. Üst öğe aynı Space içinde olmalıdır (List farklı olabilir).
  - Atananlar çoklu (`work_item_assignees`); etiketler Space'e ait (`labels`, `work_item_labels`). Atanan, workspace üyesi olmalıdır.
  - `externalSource/externalId` baştan vardır (ClickUp içe aktarma, Faz 5).
  - Sıralama: List içinde kesirli `rank` (ADR-014).
- **Alternatifler:** Tip başına ayrı tablolar (hiyerarşi ve ortak alanlar sorguları zorlaşır); tip özel alanları için JSONB (doğrulama ve sorgu zorlaşır).

## ADR-045 — Tahmin alanları

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §6.2.4; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - Story Point (`points`) yalnızca Epic/Story/Bug'da, saat (`estimateHours`) yalnızca Task/Sub-task'ta tutulur; uymayan alan `WORK_ITEM_ESTIMATE_NOT_ALLOWED`.
  - `points` sayıdır. Fibonacci ölçeğinde 1,2,3,5,8,13,21; Sayı ölçeğinde 0–1000; T-shirt ölçeğinde XS=1, S=2, M=3, L=5, XL=8 olarak saklanır (toplam ve velocity hesapları sayısal kalır, arayüz harfi gösterir).
  - Üst öğe, alt öğelerin saatini toplayıp gösterebilir (rollup, saf fonksiyon). Epic ilerlemesi point ağırlıklıdır; point yoksa adet bazlıdır (brief §6.2.3).
  - Tahmin girmek `estimate.write` izni ister; durum değişikliği `workItem.status.own` (kendine atanmış veya bildirdiği öğe) ya da `workItem.write` ile yapılır.
- **Alternatifler:** Tahmini metin saklamak (toplanamaz).

## ADR-046 — İş öğesi yaşam döngüsü: arşiv, çöp, tamamlanma

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §6.2.2, §6.2.5, §6.2.7)
- **Karar:**
  - Arşiv ve silme (çöp) işlemi öğe ve tüm alt öğelerine aynı zaman damgasıyla uygulanır; geri getirme aynı damgalı alt öğeleri de geri getirir. Çöp 30 gün (ADR-041); kalıcı silmeyi gece işi yapar.
  - Durum kategorisi DONE'a geçince `completedAt` yazılır, DONE'dan çıkınca silinir; her ikisi de aktivite kaydına düşer.
  - Açık alt öğesi olan öğe DONE'a çekilirken API `WORK_ITEM_OPEN_CHILDREN` (409, `details.count`) döner; istemci kullanıcıya sorar ve `force: true` ile yeniden gönderir (uyarı, engel değil; "engelle" ayarı F2).
- **Alternatifler:** Alt öğeleri ayrı işaretlememek (geri getirmede tutarsızlık riski).

## ADR-047 — Kopyalama ve taşıma

- **Tarih:** 2026-10-02 · **Durum:** Kabul (ADR-033 ile uyumlu; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - **Taşıma** aynı veya başka Space'teki List'e yapılır; öğe ID'si değişmez. Alt öğeler öğeyle birlikte taşınır. Başka Space'e taşırken: durumlar kategori eşleşmesiyle (önce aynı ad, sonra aynı kategorinin ilk durumu), etiketler aynı ada sahip hedef etiketle eşlenir (yoksa düşer), üst öğe bağı (taşınan alt ağacın dışındaysa) kaldırılır; hedefte `workItem.write` izni gerekir.
  - **Kopyalama** yeni ID ile oluşur (başlık sonuna "(kopya)" eklenmez; kopya aynı başlıkla gelir), durum başlangıç durumuna döner, tamamlanma/bağlantı/yorum kopyalanmaz; istenirse alt öğeler de kopyalanır.
  - **Toplu düzenleme:** aynı Space içindeki en fazla 200 öğede durum, öncelik, atanan ekle/çıkar, etiket ekle/çıkar.

## ADR-048 — Açıklama: Tiptap JSON, düz metin kopyası, XSS kuralı (Faz 1.4)

- **Tarih:** 2026-10-02 · **Durum:** Kabul (ADR-022'nin uygulaması; ayrıntılar geliştirici varsayılanı)
- **Karar:** Açıklama Tiptap belge JSON'u olarak `work_items.description` (jsonb) içinde saklanır; her kayıtta düz metin karşılığı `descriptionText`'e yazılır (Faz 1.5 arama için). Sunucu belgeyi doğrular: kök `doc`, izinli düğüm/işaret listesi (paragraf, başlık 1–3, kalın, italik, kod, bağlantı, madde/sıralı liste, kod bloğu, alıntı, yatay çizgi), en çok 200 KB, bağlantılar yalnızca `http(s)`/`mailto`. Hiçbir yerde ham HTML saklanmaz veya basılmaz.
- **Kapsam dışı (sonraki adım):** görsel yapıştırma ve tablo (ek altyapısı 1.6), @mention (1.6'da yorumlarla).
- **Alternatifler:** Markdown/HTML saklamak (XSS ve dönüştürme riski).

## ADR-049 — Kabul kriterleri ve checklist'ler

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.4; ayrıntılar geliştirici varsayılanı)
- **Karar:** Tek `checklists` tablosu, `kind` = `ACCEPTANCE` (öğe başına en çok bir tane, ilk madde eklenirken oluşur) veya `CHECKLIST` (adlı, öğe başına en çok 20). Maddeler `checklist_items` (metin ≤ 500, `done`, kesirli rank). Given-When-Then biçimi serbest metindir. Düzenleme `workItem.write` ister. Kopyalamada checklist'ler kopyalanır, maddeler işaretsiz gelir.
- **Alternatifler:** Kabul kriterini açıklamanın içinde tutmak (işaretlenemez, raporlanamaz).

## ADR-050 — Bağlantılar ve engelleyen uyarısı

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.4, §6.2.6)
- **Karar:** `work_item_links(from, to, type)`; tipler `BLOCKS`, `RELATES_TO`, `DUPLICATES`. Arayüz ters yönü gösterir ("MOB-3 tarafından engelleniyor"). Kendine bağlanamaz; aynı çift ve tip tekrarlanamaz; `RELATES_TO` her iki yönde tek kayıt sayılır. İki öğe farklı Space'te olabilir; görüntüleyen kişi karşı Space'i göremiyorsa o bağlantı listede görünmez. Engelleyeni bitmemiş (DONE kategorisinde olmayan) bir öğe NOT_STARTED'dan ACTIVE'e çekilirken API `WORK_ITEM_BLOCKED` (409, `details.keys`) döner; istemci `force: true` ile yeniden gönderir (uyarı, engel değil; ADR-046 ile aynı kalıp).
- **Alternatifler:** Engeli zorunlu yapmak (brief "uyarı" diyor).

## ADR-051 — İzleyiciler ve "Task'lara böl"

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.4; ayrıntılar geliştirici varsayılanı)
- **Karar:** İzleyiciler `work_item_watchers`; bildiren ve atananlar öğe oluşurken/atanırken otomatik izleyici olur, herkes kendini ekleyip çıkarabilir. Bildirim gönderimi Faz 2'dedir (bu adımda yalnızca kayıt). Bir Story, tek istekle birden çok Task'a bölünebilir (en çok 30 başlık; her biri Story'nin altına, aynı List'te ilk durumla açılır); Story'nin kendisi değişmez.

## ADR-052 — Görünüm durumu adreste, süzme ve gruplama istemcide (Faz 1.5)

- **Tarih:** 2026-10-02 · **Durum:** Kabul (ADR-003 "URL'de tip güvenli filtre state"; ayrıntılar geliştirici varsayılanı)
- **Karar:** List sayfasının görünümü (List/Table), süzgeçler, sıralama, gruplama ve arama metni adres parametrelerinde tutulur (paylaşılabilir, geri tuşu çalışır). Bir List'in öğeleri (en çok 5.000) tek istekle gelir; süzme, sıralama ve gruplama istemcide saf fonksiyonlarla yapılır (anlık his, birim testli). 100'ü aşan satır listesi sanallaştırılır. Sütun seçimi cihaza özeldir (yerel tercih).
- **Hiyerarşi:** Süzgeç, sıralama veya gruplama yokken satırlar ağaç olarak (üst → alt) gösterilir; biri açıkken düz liste gösterilir.
- **Sınır:** 5.000'i aşan List'ler için sunucu tarafı süzme/sayfalama Faz 2'de (backlog çalışmasıyla).
- **Alternatifler:** Süzmeyi sunucuda yapmak (her tuşta istek; bu ölçekte gereksiz).

## ADR-053 — Global arama: PostgreSQL FTS (Türkçe) + trigram

- **Tarih:** 2026-10-02 · **Durum:** Kabul (ADR-019'un uygulaması; ayrıntılar geliştirici varsayılanı)
- **Karar:** `GET /search?q=` başlık ve açıklama düz metnini `to_tsvector('turkish', …)` ile (ön ek eşleşmeli), başlığı ayrıca `ILIKE` + `pg_trgm` GIN dizini ile, `MOB-12` biçimini kimlikle arar. Yalnızca görülebilen Space'lerdeki, silinmemiş ve arşivlenmemiş öğeler döner (ADR-035, ADR-039). Sonuçlar sıralı ve en çok 20'dir.
- **İstisna:** Arama ham SQL kullanır; `workspaceId` ve görünür Space listesi sorguda açıkça verilir (tenant uzantısı ham SQL'e uygulanmaz). Sonuç satırları yine `TenantPrismaService` ile yüklenir.
- **Alternatifler:** Meilisearch/OpenSearch (ADR-019: ölçek gerektirmiyor).

## ADR-054 — "Bana atananlar / Oluşturduklarım / İzlediklerim"

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.8; ayrıntılar geliştirici varsayılanı)
- **Karar:** `GET /my-work?scope=assigned|created|watching` kullanıcının görebildiği tüm Space'lerdeki öğeleri döner (en çok 500, silinmiş/arşivli hariç). Varsayılan olarak tamamlananlar (DONE) gizlidir; `includeDone=true` ile gelir. Sıra: bitiş tarihi yakın olan önce, tarihsizler sonda. Kenar çubuğundaki "Bana atananlar" bu sayfaya gider.

## ADR-055 — Yorumlar: zengin metin, @mention kaydı, tepkiler (Faz 1.6)

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.13; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - Yorum gövdesi açıklamayla aynı Tiptap belge JSON'udur (ADR-048); izinli düğümlere `mention` (`attrs.id` = kullanıcı) eklenir. Yorumlarda başlık/kod bloğu da kullanılabilir.
  - Sunucu belgedeki mention'ları çıkarıp `comment_mentions` tablosuna yazar; yalnızca öğeyi görebilen workspace üyeleri geçerlidir, diğerleri düz metne indirilir. Bildirim gönderimi Faz 2'dedir; kayıt şimdiden tutulur. Yorum yazan ve mention edilenler öğenin izleyicisi olur (ADR-051).
  - Düzenleme yalnızca yazara aittir ("düzenlendi" işareti). Silme: yazar veya `space.settings` izni olan (PO, SM, Owner, Admin); silinen yorum soft-delete'tir ve gösterilmez.
  - Tepkiler sabit emoji kümesinden (👍 ❤️ 🎉 👀 😄 ✅); kişi başına tepki türü başına bir kayıt, tıklayınca açılıp kapanır. Yorum yazma ve tepki `comment.write` ister (Stakeholder dahil).
- **Alternatifler:** Yalnızca düz metin yorum (mention ve biçimlendirme olmaz).

## ADR-056 — Dosya ekleri: yerel disk, güvenli sunum

- **Tarih:** 2026-10-02 · **Durum:** Kabul (ADR-020'nin uygulaması; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - `StorageService` soyutlaması, varsayılan yerel disk (`UPLOAD_DIR`, Docker volume). Dosya adı diskte rastgele anahtardır; özgün ad yalnızca veritabanında. Anahtar `workspaceId/<uuid>` biçimindedir; istemci yolu hiçbir zaman dosya yoluna girmez.
  - Sınırlar: dosya başına en çok 25 MB (`MAX_UPLOAD_MB`), öğe başına en çok 50 ek. Çalıştırılabilir/komut dosyası uzantıları (exe, bat, cmd, com, scr, msi, dll, ps1, vbs, jar, sh…) reddedilir.
  - MIME türü istemciden değil uzantıdan türetilir; resim ve PDF için içerik imzası (magic bytes) doğrulanır. Önizleme (satır içi) yalnızca PNG, JPEG, GIF, WebP ve PDF içindir; diğer her şey (SVG ve HTML dahil) `Content-Disposition: attachment` ile iner. Tüm yanıtlarda `X-Content-Type-Options: nosniff`, satır içi sunumda `Content-Security-Policy: sandbox; default-src 'none'`.
  - İndirme `space.view` ister; yükleme/silme `workItem.write`. Ek silinince dosya da silinir; çöp kutusundan kalıcı silinen öğenin ekleri gece işinde diskten temizlenir.
- **Alternatifler:** MinIO/S3 (ek servis; kendi sunucuda gereksiz, adaptör arayüzü hazır).

## ADR-057 — Aktivite akışları

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.13; ayrıntılar geliştirici varsayılanı)
- **Karar:** Aktivite kaydı (ADR-015) iki yerde okunur: öğe detayında "Aktivite" sekmesi (`GET /items/:id/activity`) ve Ana sayfadaki "Son aktivite" (`GET /activity`, görülebilen Space'lerdeki öğe olayları). Sunucu kayıttaki kimlikleri (durum, atanan, etiket) okunur ada çevirir; istemci olayı cümleye döker. Sayfalama imleçle (`before`), sayfa boyutu 30. Yorum ve ek olayları gövde/dosya içeriği taşımaz. Space/List düzeyinde ayrı akış F2.

## ADR-058 — Ana sayfa

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §10 madde 2; ayrıntılar geliştirici varsayılanı)
- **Karar:** Bana atananlar (açık, en çok 8; "tümü" Benim işlerim'e gider), Yaklaşan teslimler (bana atanan, geçmiş ve önümüzdeki 14 gün), Favoriler, Son aktivite. Veri mevcut uçlardan gelir (`/my-work`, `/hierarchy`, `/activity`).

## ADR-059 — Profil fotoğrafı

- **Tarih:** 2026-10-02 · **Durum:** Kabul (brief §5.1)
- **Karar:** En çok 2 MB, PNG/JPEG/WebP (içerik imzası doğrulanır), istemcide kare kırpılıp 256 px'e küçültülür. Dosya depolamada `avatars/<userId>` anahtarıyla durur; kullanıcıda yalnızca `avatarVersion` (önbellek anahtarı) saklanır. `GET /api/users/:id/avatar` yalnızca aynı workspace'te olan oturum sahiplerine açıktır. Fotoğraf yoksa baş harfler (mevcut davranış) gösterilir.

## ADR-060 — Faz 2 kullanıcı kararları

- **Tarih:** 2026-10-03 · **Durum:** Kabul (kullanıcı onayı)
- **Karar:**
  - **Sprint Goal:** Sprint başlatırken zorunludur; Space ayarıyla (`sprintGoalRequired`) yalnızca uyarıya çevrilebilir (brief §6.1.3).
  - **DoD:** Story "Done"a çekilirken DoD maddeleri gösterilir ve eksikse uyarı çıkar; Space ayarıyla (`dodEnforced`) tamamlanmadan Done'a geçiş engellenir (brief §6.3).
  - **E-posta bildirimleri:** Olay anında gönderilir; kullanıcı profilinden bildirim türü bazında kapatabilir. Özet (digest) ve rahatsız etme saatleri sonraya kalır (brief §5.13 [F2] tercih yönetimi).
  - **Adım sırası:** 2.1 Sprint modeli + Product Backlog → 2.2 Board → 2.3 Sprint yaşam döngüsü + Planning → 2.4 DoD/DoR + Sprint Review → 2.5 Bildirimler → 2.6 Burndown/Velocity.

## ADR-061 — Sprint modeli ve sprint üyeliği

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.6, §6.1; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - `sprints` tablosu Space'e bağlıdır; durumlar PLANNED → ACTIVE → COMPLETED veya CANCELLED. Space başına en çok bir ACTIVE sprint, kısmi benzersiz dizinle veritabanında garanti edilir (brief §6.1.1).
  - Tarihler date-only'dir. Başlangıç ≤ bitiş. Kapasite şimdilik serbest nottur (kişi bazlı kapasite brief §5.6'da [F2], sonraya).
  - Sprint'e **yalnızca üst düzey** Story, Bug ve Task girer (üst öğesi yok veya üst öğesi Epic olan). Epic hiçbir zaman sprint'e girmez; alt öğeler (Task, Sub-task) üstlerinin sprint'ini izler. `work_items.sprintId` tek kaynaktır.
  - Sprint'e ekleme/çıkarma `sprint_item_events` tablosuna yazılır: neden (PLANNED, SCOPE_CHANGE, CARRIED_OVER), o anki puan. Burndown ve scope change raporları bundan beslenir (ADR-015). Aktif sprint'e ekleme SCOPE_CHANGE sayılır.
  - Tamamlanmış ve iptal sprint salt-okunurdur; öğesi eklenip çıkarılamaz.
- **Alternatifler:** Sub-task'ın da ayrı sprint'e girebilmesi (Jira'da bile karışıklık yaratır); sprint üyeliğini yalnızca olay tablosunda tutmak (her sorguda son durumu hesaplamak gerekir).

## ADR-062 — Product Backlog ve öncelik sırası

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.5; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - Backlog Space'e aittir, List'e değil: Space'teki sprint'e atanmamış, Done kategorisinde olmayan, silinmemiş/arşivlenmemiş üst düzey Story, Bug ve Task'lardır. Epic'ler gruplama/filtre içindir, sırada görünmez.
  - Sıra tek bir `work_items.backlogRank` (kesirli anahtar, `COLLATE "C"`) ile tutulur; Backlog ve sprint içi sıra aynı anahtarı kullanır, böylece sprint'e taşınan öğe önceliğini korur. List içi `rank` ayrıdır.
  - Sıralamayı değiştirmek `backlog.rank` izni ister (PO). Sprint'e taşıma `sprint.plan` ister. Tahminsiz (puansız) Story/Bug vurgulanır.

## ADR-063 — Board: sütunlar, kartlar ve satırlar

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.8, §5.9; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - Sütunlar Space durumlarıdır (Space'in sırasıyla); kart sürüklenince `PATCH /items/:id { statusId }` çağrılır, yani liste, detay ve Board aynı kuralları paylaşır (açık alt öğe ve engelleyen uyarıları onay penceresine döner, ADR-046/050). Kart hemen yeni sütuna geçer, hata olursa geri döner.
  - Sürükleyebilme `workItem.write` veya kendine atanmış öğede `workItem.status.own` ister (liste ile aynı). Yetkisiz kullanıcı kartı görür, taşıyamaz.
  - Klavye ve dokunmatik için her kartta "Durumu değiştir" menüsü vardır; sürükleme yalnızca fare/işaretçi içindir.
  - İki Board vardır: **Sprint panosu** (`/spaces/:id/board`, aktif sprint; planlı sprint seçilebilir; öğeler ve tüm alt öğeleri) ve **List Board'u** (List sayfasında üçüncü sekme, listedeki tüm öğeler).
  - Satırlar (swimlane): yok, atanan (birden çok atanan varsa ilki), Epic (en yakın Epic atası), öncelik. Satır seçimi adreste tutulur (`lane`); satıra bırakmak yalnızca sütunu belirler.
  - Sütundaki sıra Board'da elle değiştirilemez (Backlog önceliği/List sırası kullanılır). WIP limiti ve kart alanı seçimi sonraya (brief §5.9 [F2]).
- **Alternatifler:** Sütun içi elle sıralama (Backlog önceliğiyle çelişir); KeyboardSensor ile klavye sürükleme (sütunlar arası erişilebilir hareket zor, menü daha güvenilir).

## ADR-064 — Sprint yaşam döngüsü ve Planlama

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.6, §6.1; kullanıcı kararı ADR-060; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - **Başlat** (`sprint.start`): yalnızca planlı sprint; Space'te aktif sprint varsa 409. Sprint Goal Space ayarıyla (`sprintGoalRequired`, varsayılan açık) zorunlu; kapalıysa başlatma penceresi yalnızca uyarır. Boş sprint ve tahminsiz öğe de uyarıdır, engel değildir.
  - **Tamamla** (`sprint.complete`): yalnızca aktif sprint. Bitmeyen işler için seçim zorunludur: sonraki **planlı** sprint'e devret (aynı Space) veya Backlog'a gönder; Done kategorisindeki öğeler sprint'te kalır. Çıkan her öğe için `REMOVED/UNFINISHED` olayı (devirde ayrıca devralan sprint'te `ADDED/CARRIED_OVER`) ve öğe aktivitesi yazılır. **Velocity tamamlama anında dondurulur** (`sprints.completedPoints` = Done puanı); sonradan öğe yeniden açılsa değişmez (brief §6.1.7, §6.1.8).
  - **İptal** (`sprint.cancel`: Product Owner ve yöneticiler): planlı veya aktif sprint; tüm öğeleri Backlog'a döner. Tamamlanmış/iptal sprint tekrar iptal edilemez.
  - **Kapsam değişikliği:** aktif sprint'e ekleme veya çıkarma önce onay penceresi gösterir (brief §6.1.4); sunucu olayı `SCOPE_CHANGE` işaretler (ADR-061).
  - **Planlama sayfası:** solda Backlog, sağda seçili (planlı/aktif) sprint; öğeler iki bölme arasında sürüklenir, aynı hareketle konum belirlenir. Kapasite göstergesi, toplam puanın tamamlanmış son 3 sprint'in ortalama velocity'sine oranıdır (%90 ve üstü sarı, üstü kırmızı); referans yoksa gösterge yoktur. Kapasite notu serbest metin olarak yanında görünür.
  - **Gezinme:** Backlog · Planlama · Sprint panosu · Geçmiş sekmeleri. Geçmiş sayfası tüm sprint'leri listeler; kapanan sprint'in panosu salt-okunur açılır.
- **Alternatifler:** Tamamlarken bitmeyenleri sormadan devretmek (brief "seçenek sunulur" der); velocity'yi her seferinde Done öğelerden yeniden hesaplamak (geçmiş sprint değişebilir); planlamada sürüklemeyi yalnızca tutamaçla sınırlamak (kullanıcı satırın her yerini bekler).

## ADR-065 — DoD, DoR ve Sprint Review

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.6, §6.3; DoD zorunluluğu kullanıcı kararı ADR-060; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - **Maddeler Space'e aittir:** `dodItems` ve `dorItems` düz metin listeleri (en çok 20 madde, her biri 1–200 karakter, tekrarsız). Space ayarlarında (`space.settings`: Product Owner, Scrum Master) satır satır düzenlenir. Yalnızca Scrum açık Space'lerde görünür.
  - **İşaretler öğeye aittir:** `dodChecked` / `dorChecked` işaretli madde **metinlerini** tutar. Space'te artık olmayan veya yeniden yazılmış madde otomatik olarak işaretsiz sayılır (eski işaret yeni anlamı taşımaz). Yalnızca **Story ve Bug** için geçerlidir; Task/Sub-task/Epic'te bölüm görünmez ve işaret konamaz (422). İşaretleme `workItem.write` ister.
  - **DoD ve Done:** Story/Bug Done'a geçerken eksik DoD maddesi varsa varsayılan **uyarıdır** (409 `DOD_INCOMPLETE`, `force` ile geçilir; arayüzde onay penceresi). Space ayarı `dodEnforced` açıksa **engeldir** (409 `DOD_ENFORCED`, `force` geçmez).
  - **DoR ve planlama:** Backlog/sprint satırlarında eksik DoR "DoR 1/3" rozetiyle işaretlenir; sprint başlatma penceresi hazır olmayan öğe sayısını uyarır. Engel değil, işarettir (brief §6.3 "işaretlenir").
  - **Sprint Review** (`GET sprints/:id/review`): tamamlananlar, tamamlanmayanlar (kapanmış sprint'te çıkış olaylarından, açıkta güncel durumdan), sprint başladıktan sonra eklenen/çıkarılan öğeler (kapsam değişiklikleri) ve **demo notları** (en çok 5000 karakter). Notlar `sprint.complete` yetkisiyle, **tamamlanmış sprint'te de** yazılabilir; öğe kümesi kilitli kalır, not bir ek açıklamadır (değişiklik aktiviteye düşer). Açık sprint için de önizleme gösterilir.
- **Alternatifler:** DoD'yi öğe başına kopyalanan checklist yapmak (Space maddesi değişince eski öğeler eskir, toplu güncelleme gerekir); işaretleri madde dizinleriyle tutmak (madde araya eklenince kayar); DoR'u sprint'e almada engel yapmak (brief yalnızca işaretlemeyi ister).

## ADR-066 — Bildirimler

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.13; e-posta modu kullanıcı kararı ADR-060; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - **Olaylar ve alıcılar:** `ASSIGNED` (yeni atananlar), `MENTIONED` (yorumda etiketlenenler; düzenlemede yalnızca yeni etiketlenenler), `COMMENTED` (yorumdan önceki izleyiciler, etiketlenenler hariç), `STATUS_CHANGED` (atananlar, bildiren ve izleyiciler; yeni durum adı eklenir), `SPRINT_STARTED` / `SPRINT_COMPLETED` (Space üyeleri ve sprint öğelerinin atananları). Eylemi yapan kişi **hiçbir zaman** bildirim almaz; alıcı Space'i göremiyorsa elenir (özel Space sızıntısı olmaz).
  - **Kanallar:** uygulama içi kutu ve **anında** e-posta (kuyruk üzerinden, ADR-021). Tercih tür × kanal bazlıdır (`notification_preferences`); kayıt yoksa ikisi de açıktır. Özet (digest) ve rahatsız etme saatleri sonraya.
  - **Hata yalıtımı:** bildirim, asıl işlem tamamlandıktan **sonra** üretilir ve hata verirse yalnızca loglanır; atama, yorum, durum veya sprint işlemi bildirim yüzünden başarısız olmaz. Bedeli: bildirim ile asıl işlem aynı işlemde değildir (nadir bir çökmede bildirim kaybolabilir).
  - **Kutu:** kullanıcıya özel `notifications` tablosu; içerik anlık görüntü olarak (`actorName`, `itemKey`, `itemTitle`, `sprintName`, `detail`) saklanır. 30'ar kayıt (`before` imleci), okunmamış süzgeci, tek tek ve toplu okundu. Rozet için hafif `unread-count` ucu 30 sn'de bir ve pencere odaklanınca yoklanır; gerçek zamanlı güncelleme (WebSocket) sonraya (brief [F2]).
  - **Arayüz:** Kenar çubuğu ve üst çubukta rozetli zil, `/notifications` sayfası, Ayarlar › Bildirimler tercih tablosu (anahtarlar anında kaydedilir).
  - **Kapsam dışı (şimdilik):** toplu düzenleme (bulk) ve ClickUp içe aktarma bildirim üretmez; eski bildirimlerin temizlenmesi (ör. 90 gün) henüz yok.
- **Alternatifler:** Bildirimleri işlemin içinde yazmak (hata asıl işlemi bozar, e-posta kuyruğu işlem dışı kalmalı); olay veri yolundan (activity_events) bildirim türetmek (alıcı hesabı ve tercih süzmesi yine gerekir, kutuya okundu durumu eklenemez).

## ADR-067 — Burndown ve Velocity raporları

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.11, §6.1.7; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - **Veri kaynağı:** `sprint_snapshots` tablosu, sprint başına **gün başına tek satır** (`sprintId + date` benzersiz, aynı gün yeniden yazılırsa güncellenir): toplam, biten ve kalan puan ile öğe sayıları. Yazılma anları: sprint başlarken, her gün 23:55'te (pg-boss, `sprint.snapshot`, Europe/İstanbul), sprint tamamlanırken (bitmeyen işler devredilmeden **önce**, böylece son nokta kalan işi gösterir). Başlangıç taahhüdü `sprints.committed_points` olarak başlatma anında dondurulur; ilk gün görüntüsünün sonradan ezilmesi taahhüdü bozmaz.
  - **Burndown:** kalan puan (Done kategorisi dışındaki toplam), ideal çizgi (taahhütten bitiş gününde sıfıra, takvim günü bazında) ve **scope change** (aktif sprint'e eklenen/çıkarılan puan; `sprint_item_events` içindeki `SCOPE_CHANGE` kayıtları, gün bazında net). Gün atlanırsa (sunucu kapalıydı) son görüntü taşınır. Aktif sprint'te **bugünün noktası canlı** hesaplanır, gece işi beklenmez. Süre aşılırsa eksen bugüne uzar. Planlı sprint'in burndown'ı yoktur; iptal edilen sprint iptal gününe kadar gösterilir. Hesap saf bir fonksiyondur (`buildBurndown`, shared) ve birim testlidir.
  - **Velocity:** son 10 tamamlanmış sprint için taahhüt edilen ve tamamlanan puan; tamamlanan, sprint kapanırken dondurulan `completed_points`'tir (brief §6.1.7). Ortalama, planlama kapasite göstergesiyle aynı kuraldır (son 3 sprint, `averageVelocity`). Taahhüdü olmayan eski kayıtlarda taahhüt boş gösterilir.
  - **Saat dilimi:** gün sınırları `Europe/Istanbul` (sabit `REPORT_TIME_ZONE`); Space başına saat dilimi ayarı sonraya.
  - **İzin ve ekran:** `report.view` (tüm Scrum rolleri). Space'te yeni "Raporlar" sekmesi: sprint seçicili Burndown (başlangıç/kalan/kapsam değişikliği kartları ve grafik), altında Velocity grafiği ve erişilebilir tablo. Grafikler Recharts ile (ADR-005), rota ayrı pakete bölünür.
  - **Hata yalıtımı:** görüntü yazılamazsa loglanır, sprint başlatma/tamamlama bozulmaz; gece işi sonraki turda dener.
- **Alternatifler:** Burndown'ı yalnızca olay geçmişinden (`activity_events`, `sprint_item_events`) yeniden hesaplamak (durum geçmişi puan değişimleriyle birlikte tutulmadığı için güvenilmez, her istekte pahalı); görüntüyü yalnızca gece yazmak (başlangıç/bitiş günü ve sunucu kapalı günler eksik kalır); taahhüdü ilk görüntüden türetmek (aynı gün yeniden yazılınca bozuluyor — testte yakalandı).
- **Bilinen sınırlar:** Burn-up, CFD, lead/cycle time ve dışa aktarma Faz 4'te (brief §5.11 [F2] satırları). Puan sonradan değişirse (tahmin düzeltme) geçmiş günler değişmez, yalnızca sonraki görüntüler yeni değeri taşır.

## ADR-068 — Epic özeti ve Epic listesi

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.7, §6.2.3; ayrıntılar geliştirici varsayılanı)
- **Karar:**
  - **İlerleme kuralı değişmez** (ADR-045): doğrudan alt öğelerin point ağırlıklı tamamlanma oranı; hiçbirinde puan yoksa adet bazlı. Üstüne **özet** eklenir: toplam/biten puan, toplam/biten/devam eden adet ve puanı girilmemiş alt öğe sayısı (ilerlemenin neden adet bazına düştüğü görünür olsun).
  - **Kapsam:** yalnızca Epic'in doğrudan alt öğeleri (Story/Bug); Story altındaki Task'lar Epic ilerlemesine ayrıca girmez (Story'nin kendisi sayılır). Silinen ve arşivlenen öğeler sayılmaz.
  - **Ekranlar:** Space'te "Epic'ler" sekmesi (liste, ilerleme çubuğu, özet) ve Epic detayında "Toplam" satırı. Epic'e göre filtreleme/gruplama Backlog ve List'te zaten vardı (Faz 1/2). Epic'in sprint dağılımı ve zaman çizelgesi (Roadmap) Faz 4'tedir.
  - **Salt okunur özet:** Epic listesi `space.view` izniyle okunur; ek izin yok.
- **Alternatifler:** Epic özetini detay yanıtına gömüp ayrı liste ucu açmamak (liste ekranı her Epic için detay çekmek zorunda kalır); özeti veritabanında saklamak (alt öğe değişince tutarsız kalma riski, hesap ucuz).

## ADR-069 — Doküman sayfaları

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.12; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** sayfalar bir **Space'e** aittir (Workspace düzeyinde doküman sonra); sayfa ağacı `parentId` ile kurulur, en çok 6 seviye, kardeş sırası kesirli anahtarla (ADR-014). Yetki Space rolünden gelir: okuma `doc.view`, yazma `doc.write` (Stakeholder okur, Developer ve üstü yazar); özel Space sayfaları üye olmayana 404. Arşivli Space salt-okunurdur.
  - **İçerik:** Tiptap JSON (ADR-048) ve aynı sunucu doğrulaması; doküman editöründe H1–H3, tablo ve ayırıcı eklenir (izinli düğümlere `table`, `tableRow`, `tableHeader`, `tableCell` girdi). Görsel yükleme ve emoji seçici bu adımda yok (Unicode emoji yazılabilir); görsel, ek altyapısı (ADR-056) dokümana bağlanınca eklenecek.
  - **Eşzamanlılık:** eşzamanlı ortak düzenleme yok (brief [F2]). Her sayfada `revision` sayacı vardır; kayıt isteği son bildiği revision'ı taşır ve eşleşmezse **409 `DOC_CONFLICT`** ile reddedilir, üzerine yazılmaz. Arayüz bu durumda uyarı gösterip sayfayı yenilettirir. Tarayıcıda kayıtlar tek sıraya girer (başlık ve içerik aynı anda uçmaz); sekme gizlenirken bekleyen değişiklik hemen gönderilir.
  - **Otomatik kayıt:** yazarken 1,5 sn (başlıkta 0,8 sn) sonra ve odak çıkınca; ayrı "Kaydet" düğmesi yok.
  - **Sürümler:** aynı yazarın art arda kayıtları **10 dakika içinde tek sürümde birleşir**; yazar değişirse ya da süre dolarsa yeni sürüm açılır; sayfa başına en çok 100 sürüm (en eskiler silinir). Sürüme dönmek içeriği ve başlığı geri getirir ve **yeni bir sürüm** olarak kaydedilir (geçmiş silinmez). Her kayıt ayrı sürüm olsaydı otomatik kayıt geçmişi şişirirdi.
  - **Silme:** sayfa ve tüm alt sayfaları aynı zaman damgasıyla çöp kutusuna gider, birlikte geri gelir; üst sayfa hâlâ çöpteyse sayfa köke döner. 30 gün sonra kalıcı silinir (ADR-041'deki temizlik işi). Taşıma döngü ve derinlik kuralıyla denetlenir (`checkDocMove`, saf ve birim testli).
  - **Ekran:** Space ağacında "Dokümanlar" bağlantısı (`/spaces/:id/docs?doc=<id>`), solda sayfa ağacı (alt sayfa ekle, yukarı/aşağı, taşı, sil), sağda editör, üst sayfalar, kayıt durumu, sürüm geçmişi ve çöp kutusu pencereleri. Kenar çubuğundaki genel "Dokümanlar F3" yer tutucusu kaldırıldı.
  - **Arama:** düz metin (`plain_text`) saklanır; global aramaya katılması ve içindekiler/TOC sonraya.
- **Alternatifler:** Her kaydı ayrı sürüm yapmak (geçmiş okunmaz olur); iyimser kilit yerine son yazan kazanır (sessiz veri kaybı); Yjs/CRDT ile ortak düzenleme (F2 kapsamı, bu adımda gereksiz karmaşıklık); sürümleri farklarla (diff) saklamak (geri yükleme ve önizleme karmaşıklaşır, sayfalar küçük).
- **Bilinen sınırlar:** ortak düzenleme, şablonlar, gömülü görev listesi, dışa aktarma, sayfa düzeyi izin yok (brief [F2]); görsel ve ek yok; çöp kutusu yalnızca Space içinde görünür.

## ADR-070 — Doküman bağlantıları ve yorumları

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.12, Akış G; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Bağlantı:** sayfa ↔ iş öğesi çoktan çoğa (`doc_item_links`, bileşik anahtar); her tipten öğe (Epic, Story, Task, Bug…) bağlanabilir. Bağlama `doc.write` ister ve öğeyi **göremeyen** kullanıcı için öğe yokmuş gibi 404 döner. Bağlantı listeleri okuyanın yetkisine göre süzülür: görmediği Space'teki öğe sayfada, görmediği Space'teki sayfa görevde listelenmez. Çift bağlama sessizce yok sayılır. Bağlama dokümandan yapılır; görev tarafı yalnızca "Dokümanlar" listesini gösterir.
  - **Yorumlar:** görev yorumlarıyla **aynı `comments` tablosu** (yeni `docId` sütunu; `workItemId` boşaltıldı, CHECK ile ikisinden tam biri dolu). Böylece zengin metin, @mention kaydı ve tepkiler yeniden kullanılır; web'de aynı `Comments` bileşeni `scope="docs"` ile çalışır. Yazma `comment.write`, düzenleme yalnızca yazar, silme yazar veya `space.settings`. Silinmiş sayfaya ve arşivli Space'e yorum yazılamaz.
  - **Bildirim:** yorumda etiketlenen kişi `MENTIONED` bildirimi alır (yeni tür yok; tercih anahtarı aynı). Bildirim kaydı sayfa kimliği ve başlığını `data` içinde anlık görüntü olarak taşır, tıklayınca sayfaya gider; e-posta dokümana özel metinle gider. Düzenlemede yalnızca yeni etiketlenenler bilgilendirilir. Sayfa izleyicisi/"COMMENTED" bildirimi bu adımda yok (sayfaların izleyicisi yok).
  - **Aktivite:** bağlama, çözme, yorum ve yorum silme `doc` varlığına aktivite olarak yazılır.
- **Alternatifler:** Ayrı `doc_comments` tablosu (mention ve tepki tablolarını çoğaltmak gerekirdi); bağlantıyı iş öğesi `links` tablosuna eklemek (farklı varlık türleri, farklı yaşam döngüsü); sayfa metnindeki @görev anmalarından otomatik bağlantı türetmek (editör uzantısı gerekir, sonraya).
- **Bilinen sınırlar:** sayfa içine gömülü görev listesi/filtresi ve metinde `MOB-12` ile anma yok (brief [F2]); sayfa izleme/abonelik yok.

## ADR-071 — Sprint retrospektifi

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §14 Faz 3; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Biçim:** her sprint için üç sütunlu pano: **İyi gitti**, **Geliştirilmeli**, **Aksiyonlar**. Maddeler kısa metindir (en çok 500 karakter), yazarı görünür. Sprint başına ayrı "retro oturumu" nesnesi yoktur; sprint'in kendisi bağlamdır (basit, geri dönüp düzenlenebilir).
  - **Ne zaman:** yalnızca **aktif ve tamamlanmış** sprint'lerde; planlı ve iptal edilmişte 409 `RETRO_NOT_AVAILABLE`. Tamamlanmış sprint'te madde eklenebilir (retro genellikle sprint kapandıktan sonra yapılır).
  - **Yetki:** okuma `space.view` (Stakeholder izler); madde ekleme, oy ve göreve çevirme `workItem.write` (Developer ve üstü); silmeyi yazar yapar, başkasınınkini sprint'i yöneten (`sprint.complete`: Scrum Master, PO) siler.
  - **Oylama:** kişi başına madde başına bir oy, aç/kapa; çok oy alan madde sütunda üste çıkar (gizli/anonim oylama ve oy bütçesi yok).
  - **Aksiyon → görev:** ACTION maddesi tek tıkla Space'in ilk List'inde bir **Task** olur (Backlog'a düşer; sprint'e planlamada alınır). Madde göreve bağlı kalır; görev silinirse bağ kopar ve yeniden çevrilebilir. Aynı aksiyon iki kez çevrilemez (`RETRO_ALREADY_CONVERTED`).
  - **Giriş:** Geçmiş listesindeki sprint satırı ve Review sayfası "Retrospektif" bağlantısı verir.
- **Alternatifler:** Retro'yu doküman şablonu olarak kurmak (oylama ve görev çevirme zor); anonim madde (yazar bilgisi moderasyon için gerekli, takım içi güven varsayımı); aksiyonu doğrudan sonraki sprint'e koymak (planlama kararı PO/SM'in).
- **Bilinen sınırlar:** gerçek zamanlı ortak ekran yok (sayfa yenilenince görünür; brief [F2] realtime); sürükle-bırak gruplama, zamanlayıcı ve şablonlar (Başla/Dur/Devam) yok.

## ADR-072 — Roadmap görünümü

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.7 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** Space düzeyinde Epic Roadmap'i. Veri mevcut Epic başlangıç/bitiş tarihleridir (Faz 1); yeni alan veya uç yok. Çubuk bitiş günü dahil çizilir; yalnızca bir tarihi olan Epic tek günlük işaret olur; hiç tarihi olmayan Epic ayrı "Tarihsiz" listesinde kalır.
  - **Eksen:** aylar sütun, en az 4 ay (bugünün ayından), Epic ve sprint tarihlerini kapsayacak şekilde tam aya genişler. Konumlar eksenin yüzdesidir (`barPlacement`, saf ve birim testli); dar ekranda yatay kaydırılır. Bugün dikey çizgiyle gösterilir. Sprint'ler üst bantta (iptal edilenler hariç).
  - **İlerleme:** çubuğun içi Epic ilerlemesiyle (ADR-045/068) dolar; çubuğa tıklamak Epic detayına gider.
  - **Düzenleme:** tarihler Epic detayından değiştirilir. Sürükleyerek tarih değiştirme (brief [F2]) ve tema/inisiyatif gruplama sonraya; çok Space'li Roadmap Dashboard adımında (4.6).
- **Alternatifler:** Epic'leri sprint sütunlarına yerleştirmek (Epic'ler sprint'e bağlı değildir); harici grafik kütüphanesi (basit konumlu `div`'ler erişilebilirlik ve boyut açısından yeterli); sürükle-bırak hemen eklemek (Gantt adımında 4.5 ile aynı etkileşim altyapısı kurulacak).

## ADR-073 — Kurulum anahtarı kaldırıldı

- **Tarih:** 2026-10-03 · **Durum:** Kabul (kullanıcı kararı)
- **Karar:** ADR-034'teki ilk kurulum anahtarı (`SETUP_TOKEN` / açılış logu) kaldırıldı. `/setup` yalnızca hiç kullanıcı yokken açıktır; ilk kullanıcı oluşunca kapanır (aynı anda iki kurulum advisory lock ile engellenir).
- **Gerekçe:** Yerel geliştirme ve deneme sürtünmesi. **Bilinen risk:** sunucu, kurulumdan önce ağa açılırsa ilk erişen kişi yönetici olur. Canlıya çıkarken kurulumu sunucu açılır açılmaz kendiniz yapın ya da bu korumayı geri alın (Faz 6 dağıtım adımında yeniden değerlendirilecek).

## ADR-074 — Takvim görünümü

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.8; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:** List sayfasına List/Table/Board'un yanında **Takvim** görünümü. Aylık ızgara, hafta Pazartesi başlar. Öğe başlangıç–bitiş günlerinin hepsinde görünür; yalnızca bir tarihi varsa o günde. Bir güne sürüklemek (fare/dokunma, 6 px eşik) öğenin tarihlerini **süreyi koruyarak** aynı gün sayısı kadar kaydırır; yalnızca bitiş tarihi varsa onu taşır. Yetki: tarih değişimi `workItem.write` (görev zaten yazma yetkisiyle düzenlenir; yalnızca-kendi-durumu yetkisi tarih taşıyamaz). Hesap saf ve birim testli (`calendarWeeks`, `daysCovered`, `moveItemDates`). Tarihsiz öğeler ızgaranın altında listelenir; bir hücrede 3'ten fazla öğe "+N daha" olur.
- **Alternatifler:** Hafta/gün görünümü ve çok List'li Space takvimi (sonra; Workload ve Dashboard ile birlikte); tarih seçici penceresi (sürükleme tek adımda aynı işi yapar, detay sayfasından zaten düzenlenir).
- **Bilinen sınırlar:** klavye ile sürükleme yok (tarih detay panelinden değiştirilir); aydan aya sürükleme için önce hedef ay açılmalıdır; saat dilimi dönüşümü yok (tarihler gün bazlıdır).

## ADR-075 — Zaman takibi

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.15 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Veri:** `time_entries` bir kişinin bir güne bir göreve girdiği süredir (dakika, 1–1440; CHECK). Gün, kaydın yapıldığı İstanbul günüdür (`REPORT_TIME_ZONE`); gelecek güne giriş yapılamaz. Sayaç `active_timers` tablosundadır ve **kullanıcı başına bir** satırdır (kullanıcı kimliği birincil anahtar); durdurulunca süre `TIMER` kaynaklı girişe dönüşür (tam dakikaya yukarı yuvarlanır, en az 1 dk, en çok 24 saat).
  - **Tek sayaç:** başka göreve geçmek çalışan sayacı otomatik kaydedip durdurur; aynı görevde yeniden başlatmak etkisizdir. Sayacı bırakılan görev silinirse sayaç da silinir.
  - **Giriş biçimi:** serbest metin süre (`90`, `1h 30m`, `1,5s`, `1:30`; birimsiz sayı dakika) saf bir çözücüyle (`parseDuration`) çözülür; hatalı girişte satır içi uyarı çıkar.
  - **Yetki:** süre girmek, silmek ve sayaç `workItem.write` ister (Developer ve üstü); Stakeholder görür. Girişi yazarı siler, `space.settings` sahibi de silebilir. Arşivli Space'te giriş yapılamaz.
  - **Tahmin karşılaştırması:** Task/Sub-task saat tahminiyle (ADR-045) harcanan süre çubuk olarak karşılaştırılır, aşılırsa kırmızı olur. Üst öğede alt öğeler dahil toplam ayrıca gösterilir; Story/Epic puanla tahmin ettiği için süre karşılaştırması yapılmaz (yalnızca harcanan).
  - **Zaman çizelgesi:** Space için kişi × gün tablosu (haftalık gezinme, en çok 62 gün), gün ve kişi toplamları ve en çok zaman harcanan işler; `report.view` ister. Üst çubukta çalışan sayaç (görev bağlantısı, geçen süre, durdur) her sayfada görünür.
- **Alternatifler:** Sayacı yalnızca tarayıcıda tutmak (sekme kapanınca kaybolur, cihazlar arası tutarsız); başlangıç/bitiş saatli girişler (saat dilimi ve çakışma karmaşıklığı, timesheet için günlük toplam yeterli); fatura/ücret alanları (kapsam dışı).
- **Bilinen sınırlar:** CSV/PDF dışa aktarma (brief [F2]) ve proje bazlı çok Space'li rapor Dashboard adımında (4.6); onay akışı ve kilitli dönemler yok; Space saat dilimi ayarı yok.

## ADR-076 — Kişi bazlı iş yükü

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §14 Faz 4; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** Space düzeyinde tek tablo: her kişi için açık (Done olmayan) iş adedi, puan, kalan süre, geciken ve 7 gün içinde bitecek iş sayısı ve bu hafta harcanan süre (ADR-075). Epic'ler (kapsayıcı) ve silinen/arşivli işler sayılmaz. İsteğe bağlı sprint süzgeci (aktif ve planlı sprint'ler); süzgeçsiz hâl tüm açık işlerdir.
  - **Paylaşım kuralı:** birden çok kişiye atanmış iş her kişinin **adedine tam** girer; puan ve kalan süre atananlar arasında **eşit bölünür** (toplam iş yükü iki kez sayılmaz). Atanmamış işler ayrı "Atanmamış" satırındadır.
  - **Kalan süre:** saat tahmini olan işlerde `tahmin − harcanan` (öğe başına en az 0). Tahmini olmayan iş süreye katkı yapmaz, yalnızca adet ve puana girer.
  - **Kapasite:** kişi başına haftalık kapasite verisi henüz yok; bu yüzden tablo kapasiteye karşı yüzde değil, kişiler arası **göreli** çubuklar gösterir. Kapasite alanı (izin günleri, haftalık saat) Dashboard/kapasite adımında düşünülecek.
  - **Yetki:** `report.view`. Hesap saf ve birim testlidir (`buildWorkload`).
- **Alternatifler:** Puanı her atanana tam saymak (toplam şişer); kapasiteyi sabit 40 saat varsaymak (yanıltıcı, ayar olmadan güvenilmez); çok Space'li workspace iş yükü (Dashboard adımında).
- **Bilinen sınırlar:** tarih bazlı yük dağılımı (hangi hafta ne kadar) ve aşırı yük uyarısı yok; Gantt adımıyla (4.5) birlikte zaman ekseninde yük düşünülebilir.

## ADR-077 — Gantt, bağımlılık ve kritik yol

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.10 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Veri:** Gantt, Space'in tarihli işlerinden kurulur (başlangıç ve/veya bitiş tarihi olan; bağımlılığı olan tarihsiz iş de satır olur, çubuksuz "tarihsiz" yazar). Üst-alt ilişkisi girintiyle gösterilir. Bağımlılık için yeni kavram yok: mevcut **"bloklar" (BLOCKS)** bağlantısı bitiş–başlangıç bağımlılığı sayılır ("A, B'yi bloklar": B, A bitmeden başlayamaz). Yalnızca iki ucu da aynı Space'te ve silinmemiş bağlantılar çizilir.
  - **Kritik yol:** bağımlılık grafiğindeki en uzun zincir, iş sürelerinin (başlangıç–bitiş, bitiş dahil gün; tarih eksikse 1) toplamına göre. Saf ve birim testli (`analyzeSchedule`, Kahn sırası + en uzun yol). Döngü varsa uyarı gösterilir ve yol hesaplanmaz. Bu, tam CPM değildir (serbest bolluk/erken-geç tarih yok); tarihler kullanıcı tarafından girildiği için "çizelgeye göre en uzun zincir" kastedilir.
  - **Çakışma:** ardıl iş öncülün bitiş gününde veya öncesinde başlıyorsa bağımlılık "çakışıyor" sayılır (turuncu kesikli ok ve üstte uyarı). Sistem tarihleri **otomatik kaydırmaz**.
  - **Düzenleme:** çubuk sürüklenince işin iki tarihi aynı gün kadar kayar (süre korunur) ve `PATCH items/:id` ile kaydedilir; `workItem.write` ister, aksi halde salt okunur. Bağımlılık ekleme/silme görev detayındaki mevcut bağlantı arayüzünden yapılır. Çubuk uçlarını çekerek süre değiştirme ve oktan bağımlılık çizme sonraya.
  - **Ekran:** Space ağacında "Gantt": sol sütunda iş listesi, sağda ay eksenli iz, bugün çizgisi, ilerleme dolgulu çubuklar (renk Epic rengi), SVG oklar. Kritik yoldaki çubuklar kırmızı çerçeveli, oklar kalın kırmızı.
- **Alternatifler:** Ayrı bağımlılık tablosu ve türleri (SS/FF/SF; BLOCKS zaten mevcut ve görev detayında yönetiliyor); bağımlılık değişince tarihleri otomatik kaydırmak (beklenmedik tarih değişiklikleri; önce uyarı); harici Gantt kütüphanesi (boyut, tema ve erişilebilirlik; basit konumlu öğeler yeterli).
- **Bilinen sınırlar:** klavye ile tarih kaydırma yok (detay panelinden değişir); yalnızca BLOCKS türü; milisaniye değil gün hassasiyeti; çok Space'li Gantt ve baseline karşılaştırması yok.

## ADR-078 — Pano, akış raporları ve CSV dışa aktarma

- **Tarih:** 2026-10-03 · **Durum:** Kabul (brief §5.11 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Akış raporları** (`GET spaces/:spaceId/flow?days=7–180`): kümülatif akış (CFD), haftalık throughput, lead/cycle time ve bug trendi. Ayrı bir olay deposu kurulmadı: işin durum geçmişi **`activity_events`** içindeki `item.updated` kayıtlarındaki `statusId {from,to}` değişikliklerinden yeniden kurulur (ADR-015). Oluşturulma anındaki kategori, ilk geçişin `from` değeridir; hiç geçişi olmayan iş için güncel kategori. Epic'ler (kapsayıcı) ve silinen işler dışarıda. Hesap saf ve birim testlidir (`cumulativeFlow`, `countByWeek`, `cycleStats`). Günler `Europe/Istanbul`.
  - **Tanımlar:** _Lead time_ = oluşturulma → tamamlanma; _cycle time_ = ilk Active'e giriş → tamamlanma (Active'e hiç girmeden biten işte 0 gün); yalnızca seçilen dönemde tamamlanan işler sayılır; ortalama, medyan ve P85 (en yakın sıra yöntemi) verilir. Bug trendi, o haftada açılan ve kapanan Bug sayısıdır.
  - **Burn-up:** sprint snapshot'larındaki (ADR-067) toplam kapsam ve biten puan serileri; Raporlar sayfasında Burndown ile aynı grafik alanında sekme olarak.
  - **Pano:** Space başına, **kullanıcıya özel** düzen (`dashboard_layouts`): sekiz widget'lık katalog (aktif sprint, velocity, CFD, throughput, lead/cycle, bug trendi, iş yükü, Epic ilerlemesi), her biri yarım (M) ya da tam (L) genişlik, gizlenebilir, yukarı/aşağı taşınabilir. Sunucu kaydı normalleştirir (bilinmeyen/tekrarlı widget atılır, yeni katalog öğeleri sona eklenir) ve düzen değişikliği anında ekrana yansır. Sürükle-bırak yerine düğmeler seçildi (klavye ve ekran okuyucu erişilebilirliği). Scrum kapalı Space'te sprint/velocity/Epic widget'ları uyarı gösterir. Yetki `report.view`.
  - **CSV dışa aktarma:** tarayıcıda üretilir (sunucuya yük yok): zaman çizelgesi ve pano akış verisi. RFC 4180 tırnaklama, Excel için UTF-8 BOM ve **formül enjeksiyonuna karşı** `= + - @` ile başlayan metinlerin önüne `'` eklenir (`toCsv`, saf ve birim testli). PDF dışa aktarma yok.
- **Alternatifler:** Her durum geçişi için ayrı geçmiş tablosu (aktivite kaydı zaten aynı bilgiyi taşıyor; ileride ölçek sorunu olursa türetilmiş tabloya geçilir); gece işiyle günlük CFD snapshot'ı (geçmişe dönük hesap gerektirmez ama bugüne kadarki veri eksik kalırdı); pano düzenini Workspace geneline koymak (kişiler farklı widget ister); PDF dışa aktarma (yazdırma ekranı Faz 6).
- **Bilinen sınırlar:** durum kategorisi o günkü hâliyle değil **şu anki** durum-kategori eşlemesiyle hesaplanır (Faz 5'te özel durum akışı gelince eski eşleme tutulmalı); çok Space'li (workspace düzeyi) pano ve widget ekleme kataloğu sonraya; olay deposu çok büyürse akış sorgusu yavaşlayabilir (180 gün sınırı bu yüzden).

## ADR-079 — Kayıtlı görünümler

- **Tarih:** 2026-10-04 · **Durum:** Kabul (brief §5.14 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** görünüm bir **List'e** bağlıdır ve o sayfanın adres durumunu saklar: görünüm türü (List/Table/Board/Takvim), arama, durum/öncelik/tip/atanan/etiket/bitiş süzgeçleri, sıralama, gruplama ve Board satır gruplaması. Açık yan panel (`item`) saklanmaz. Tablo sütun seçimi tarayıcıya özel kalır (kullanıcı tercihi).
  - **Kişisel ve paylaşımlı:** kişisel görünümü List'i gören herkes kaydeder (Stakeholder dahil); **paylaşımlı** görünüm için düzenleme yetkisi (`workItem.write`) gerekir ve List'i gören herkese görünür. Güncelleme/silme sahibe ve Space yöneticisine (`space.settings`) aittir; sahip silinirse paylaşımlı görünüm kalır. Başkasının kişisel görünümü var olduğu bile sızmaz (404).
  - **Sınırlar:** kişi başına List'te en çok 50 görünüm, ad en çok 60 karakter ve kişi + List başına benzersizdir; yapılandırma yalnızca bilinen anahtarları içerebilir ve en çok 4 KB'tır.
  - **Esneklik:** ayar sunucuda serbest JSON olarak saklanır, **uygulanırken web'de anahtar anahtar doğrulanır** (`searchFromConfig`): sonradan bir seçenek kalkarsa geçerli kalanlar uygulanır, bozuk olan atlanır, sunucu şeması değişmeden kayıtlar bozulmaz.
  - **Arayüz:** List başlığında "Görünümler" menüsü: kayıtlılar (paylaşımlı rozetli), geçerli durumla eşleşen etkin olarak işaretlenir ve düğmede adı görünür; "geçerli görünümü kaydet…", etkin görünümü güncelle ve sil.
  - **Düzeltme:** Liste arama kutusu yerel metni adresten gelen dış değişikliklere (süzgeçleri temizle, görünüm uygulama) uymuyor, eski metni geri yazıyordu; dışarıdan gelen değer artık kutuya yansır.
- **Alternatifler:** Görünümü Space düzeyinde tutmak (süzgeç seçenekleri List'e özel: durumlar, etiketler); web'in `ViewSearch` şemasını sunucuda birebir doğrulamak (iki yerde bakım, eski kayıtlar kırılır); tablo sütunlarını da kaydetmek (sütun tercihi şimdilik yerel).
- **Bilinen sınırlar:** görünümü yeniden adlandırma yok (sil ve yeniden kaydet); sıralı/sabitlenmiş görünümler yok; Space geneli (çok List) görünüm yok.

## ADR-080 — WIP limiti

- **Tarih:** 2026-10-04 · **Durum:** Kabul (brief §5.8 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** limit **durum** başınadır (`statuses.wip_limit`, 1–999, boş = sınırsız) ve Space'in tüm Board'larına (List panosu, Sprint panosu) uygulanır. Yalnızca **Space ayarlarında** (`space.settings`) konur; API `PATCH spaces/:spaceId/statuses/:statusId`.
  - **Uyarır, engellemez:** Board sütun başlığı "sayı / limit" gösterir; limite ulaşınca sarı, aşınca kırmızı. Kartı limiti aşan sütuna bırakmak çalışır ve bir uyarı bildirimi gösterir. Sunucu limiti zorlamaz (durum değişikliği hep geçer); bu bilinçli bir seçimdir, çünkü limit ekip kuralıdır, sistem kilidi değil.
  - **Sayım:** Board'da görünen kartlar (süzgeç ve sprint kapsamı uygulanmış hâliyle); alt görevler ve satır gruplaması sayıyı değiştirmez. Saf kural `wipState` (birim testli).
- **Alternatifler:** Sunucuda sert engel (durum geçişi 409; kaçış yolu ve yetki kuralı gerekir); limiti Board'a göre ayrı tutmak (aynı durum iki panoda farklı limit karışıklığı); sütun başlığından düzenleme (şimdilik ayarlar).
- **Bilinen sınırlar:** limit Board dışında (List/Tablo) gösterilmez; limit aşımı bildirim/e-posta üretmez.

## ADR-081 — Özel durum akışları

- **Tarih:** 2026-10-04 · **Durum:** Kabul (brief §5.8 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** durum akışı **Space** bazındadır (List'e özel değil); tüm List ve Board'lar aynı durumları paylaşır. Space ayarlarında (`space.settings`) durum eklenir, yeniden adlandırılır, renklenir, kategorisi değişir, yukarı/aşağı düğmeleriyle sıralanır (klavye erişilebilir; sürükle-bırak yok) ve silinir. API: `POST/PATCH/DELETE spaces/:spaceId/statuses[/:statusId]`, `POST …/move`.
  - **Kategori:** her durum NOT_STARTED / ACTIVE / DONE kategorisinden birine bağlıdır; raporlar, Done kuralları (DoD, açık alt öğe) ve tamamlanma zamanı kategoriye bakar, ada değil. Kategori değişince o durumdaki işlerin `completedAt` değeri tutarlı kılınır (Done'a geçen boşsa şimdi, Done'dan çıkan temizlenir).
  - **Akış kuralı** (`checkWorkflow`, saf ve birim testli): akışta en az bir Done ve bir Done-dışı durum bulunur; ilk durum Done olamaz (yeni işler ilk durumda başlar); en çok **20** etkin durum; durum adı Space içinde (büyük/küçük harf duyarsız) benzersiz. İhlal 409 (`STATUS_WORKFLOW_INVALID`, `STATUS_LIMIT`, `STATUS_NAME_TAKEN`).
  - **Silme = arşiv:** durumu silerken işler zorunlu olarak seçilen etkin başka bir duruma taşınır (`?moveTo`, boş durumda gerekmez; `STATUS_MOVE_TARGET_INVALID`). Her taşınan iş için sistem işaretli `item.updated` olayı yazılır; durum kaydı `archivedAt` ile **arşivlenir**, silinmez. Böylece eski aktivite kayıtları ve akış raporları (`activity_events` içindeki durum kimlikleri) eşlemeyi kaybetmez; arşivli durum seçeneklerde, Board'da ve yeni işlerde görünmez.
  - **WIP limiti** (ADR-080) aynı düzenleyicide.
- **Alternatifler:** List bazında akış (ClickUp'ın List'e özel durumu: Space'te Scrum/rapor tutarlılığını bozar); durumu kalıcı silip eski olayları yetim bırakmak; kategori yerine ada bakan kurallar; sürükle-bırak sıralama (erişilebilirlik için düğme).
- **Bilinen sınırlar:** akış raporları durumun **şu anki** kategorisiyle hesaplanır; bir durumun kategorisi sonradan değişirse geçmiş rapor da o kategoriyle yeniden yorumlanır (kategori değişiklikleri sürüm geçmişi tutulmuyor); durum değişimi izin/otomasyon kurallarına bağlanmıyor (5.6); Space şablonları durum akışını 5.5'te taşıyacak.

## ADR-082 — Özel alanlar

- **Tarih:** 2026-10-04 · **Durum:** Kabul (brief §5.8 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** alan tanımı **Space** düzeyindedir (`custom_fields`: ad, tür, seçenekler, sıra); o Space'in tüm List'lerindeki işlere uygulanır. Sekiz tür: metin, sayı, tarih, liste, çoklu seçim, kişi, URL, onay kutusu. Tanım yönetimi `space.settings`, okuma `space.view`. Ayarlarda ekle, adlandır, sırala (düğmeler), seçenekleri düzenle, sil. Tür oluşturulduktan sonra değişmez.
  - **Değerler işte, JSON olarak:** `work_items.customFields` (alan kimliği → değer). Ayrı değer tablosu kurulmadı: liste yanıtı ek sorgu olmadan değerleri taşır, işle birlikte kopyalanır/silinir ve ölçek (≤200 kullanıcı) sorgu sayısını sorun etmez. Değerler `PATCH items/:itemId` içinde `customFields: { alanId: değer | null }` ile yazılır (yalnızca verilen alanlar değişir, `null` temizler); `workItem.write` ister. Değişiklik aktivite kaydına `customFields {from,to}` olarak yazılır, aynı değer kayıt üretmez.
  - **Doğrulama (saf, birim testli `checkFieldValue`):** metin ≤2000 karakter (kırpılır, boş = temizle); sayı sonlu ve |n| ≤ 1e12; tarih gerçek bir gün (`YYYY-MM-DD`); URL yalnızca `http(s)` ve ≤2000 karakter (`javascript:` vb. reddedilir); liste/çoklu seçim tanımlı seçenek kimlikleri (çoklu tekrarsız, boş dizi = temizle); kişi bir workspace üyesi (sunucuda denetlenir); onay kutusu boolean. Geçersiz değer ve tanımsız alan 422 `CUSTOM_FIELD_VALUE_INVALID`.
  - **Sınırlar:** Space başına en çok 30 alan, alan başına en çok 50 seçenek; ad (büyük/küçük harf duyarsız) Space içinde benzersiz, seçenek adları alan içinde benzersiz.
  - **Silme ve seçenekler:** alan silinince işlerdeki değerleri tek SQL ile temizlenir. Seçenek silinirse işlerdeki o seçenek kimliği kayıtta kalır ama **okurken yok sayılır** (tabloda boş görünür, düzenlenince atılır); seçenek kimlikleri güncellemede korunur, böylece yeniden adlandırma değerleri bozmaz.
  - **Space dışına çıkış:** özel alan Space'e özel olduğu için başka Space'e **taşıma** ve **kopyalama**da değerler düşer; aynı Space içinde kopya değerleri korur.
  - **Arayüz:** iş detayında "Özel alanlar" bölümü (türe uygun girdi; metin/sayı/URL odak çıkınca veya Enter ile, diğerleri anında kaydeder); Table görünümünde "Sütunlar" menüsünden alan başına sütun (`cf:<alanId>` kimliğiyle, tarayıcıya özel sütun tercihine yazılır, silinen alanın kimliği atılır).
- **Alternatifler:** Ayrı `custom_field_values` tablosu (sıralama/süzgeç sorgusu için daha iyi indeks, ama her liste yanıtına birleşim ve ilerideki değer geçmişi dışında kazanç yok; ölçek gerekirse JSON'dan taşınır); workspace düzeyi alanlar (Space'ler farklı süreç kullanır, ClickUp'ta da Space/List kapsamı var); serbest metin her alanı (türlü doğrulama, tabloda biçim ve ileride süzgeç için tür gerekli).
- **Bilinen sınırlar:** özel alana göre **süzgeç, sıralama, gruplama** yok; Board kartında ve kayıtlı görünümde özel alan sütunu saklanmıyor; CSV dışa aktarma henüz özel alanları içermiyor (5.7); alan değer geçmişi yalnızca aktivite kaydında; formül/hesaplanan alan, zorunlu alan ve alan başına izin yok; kaldırılan seçenekler kayıtta artık kimlik olarak durur.

## ADR-083 — Şablonlar

- **Tarih:** 2026-10-04 · **Durum:** Kabul (brief §5.8 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Yakala ve uygula:** şablon, var olan bir kayıttan **yakalanır** (sıfırdan tasarım ekranı yok) ve sonra yeni kayıt üretir. Tek tablo `templates` (tür `ITEM | LIST | SPRINT | DOC | SPACE`, ad, JSON yük). Yük **sunucuda üretilir**, istemciden hiç kabul edilmez; uygulanırken Zod ile yeniden doğrulanır, bozuksa 409 `TEMPLATE_INVALID`.
  - **Türler:** _İş_: tip, başlık, açıklama, öncelik, puan/saat, etiketler (ada göre), özel alan değerleri, checklist'ler ve bir seviye alt işler. _List_: List'teki üst düzey işler (her biri alt işleriyle) → yeni List. _Sprint_: hedef, kapasite notu ve **süre (gün)** → verilen başlangıç gününden yeni sprint (iş taşımaz). _Doküman_: başlık ve içerik → yeni sayfa. _Space_ (workspace geneli): durum akışı (WIP limitli), özel alanlar (seçenekleriyle), DoD/DoR, ölçek/sprint ayarları, List adları → "Şablondan başla" ile yeni Space.
  - **Uygulama mevcut servislerden geçer** (iş için `WorkItemsService.create`, List/Sprint/Doküman/Space için kendi servisleri): okunabilir ID, aktivite, bildirim ve tüm iş kuralları aynen işler. Yeni işler hedef List'in ilk durumunda başlar, atanan yoktur. Hedefte olmayan etiketler/özel alan değerleri sessizce düşer.
  - **Yetki:** iş şablonu kaydetmek/kullanmak `workItem.write`; List şablonu kullanmak `space.lists.manage`, Sprint `sprint.plan`, Doküman `doc.write`; List/Sprint/Doküman şablonu **kaydetmek** ve Space şablonunu kaydetmek `space.settings` (Space şablonu için kaynak Space'te ayar yetkisi, kullanmak için Space oluşturma yetkisi). Silme: Space ayarı yetkisi (iş şablonunu sahibi de silebilir).
  - **Sınırlar:** tür başına 50 şablon, ad (büyük/küçük harf duyarsız) kapsam + tür içinde benzersiz (veritabanı ifade indeksiyle de korunur); List şablonu en çok 100 iş, iş şablonu en çok 50 alt iş.
  - **Arayüz:** Space ayarlarında "Şablonlar" (liste, kullan, sil, List/Sprint/Doküman'dan kaydet) ve "Space şablonları"; iş detayında "Şablon olarak kaydet"; List sayfasında "Şablondan ekle"; Space oluşturma penceresinde "Şablondan başla".
- **Alternatifler:** Şablon düzenleme ekranı (yakala + yeniden kaydet daha az yüzey; ileride istenirse); iş şablonlarını Space dışı (workspace) tutmak (özel alan/etiket/durum Space'e özel); istemciden serbest yük kabul etmek (doğrulama ve güvenlik yüzeyi).
- **Bilinen sınırlar:** şablon yeniden adlandırma/güncelleme yok (sil ve yeniden kaydet); Sprint şablonu işleri taşımaz; List şablonu Folder yapısını ve atananları taşımaz; Space şablonu üyeleri, Folder'ları ve işleri taşımaz; Space şablonundaki List adları varsayılan List'in yerine geçer; otomasyon (5.6) ve dokümanlar arası bağlantılar şablona dahil değil.

## ADR-084 — Otomasyonlar

- **Tarih:** 2026-10-04 · **Durum:** Kabul (brief §5.8 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kural modeli:** Space başına en çok 30 kural (`automations`): ad, açık/kapalı, **tetikleyici**, **koşullar** ve **eylemler** (en çok 5, sırayla). Tetikleyiciler: iş oluşturuldu, durum değişti (isteğe bağlı hedef durum), öncelik değişti (isteğe bağlı hedef öncelik). Koşullar (VE ile; verilmeyen kısıt getirmez): iş tipi, öncelik, etiketlerden biri, atanmamış. Eylemler: kişi ata, bildirim gönder (atananlar / bildiren / belirli kişi + mesaj), öncelik değiştir, durum değiştir, özel alan güncelle, alt görev oluştur. Kural JSON olarak saklanır, kayıtta Zod ve Space ilişkileri (durum, kişi, etiket, alan ve değer türü) doğrulanır; geçersiz kural 422 `AUTOMATION_INVALID`.
  - **Çalıştırma:** iş servisleri (oluştur, güncelle, toplu güncelle) işlem bittikten sonra dahili bir olay veri yoluna (`AutomationEvents`) olay bırakır; motor açılışta işleyicisini kaydeder (iş modülü motoru bilmez, döngüsel bağımlılık yok). Eylemler **aynı istekte, hemen** çalışır; böylece sonuç tutarlı ve testlenebilir. Eylemler mevcut servislerden geçer (`update`, `create`), yani durum akışı, DoD, açık alt öğe ve özel alan kuralları aynen geçerlidir; kural ihlali eylemi **başarısız** yapar (günlüğe `FAILED` + hata kodu), asıl değişiklik geri alınmaz.
  - **Yetki:** kural yönetimi ve günlük `space.settings`. Eylemler **sistem adına** çalışır (alan bazlı yetki denetimi atlanır), çünkü yetkiyi kuralı tanımlayan Space yöneticisi verir; değişiklik aktivite kaydında tetikleyen kullanıcının adıyla görünür. Bildirim yeni tür `AUTOMATION` (tercihlerde kapatılabilir, e-posta dahil).
  - **Döngü koruması:** çalışan kurallar bir **zincirde** izlenir (`automationChain`, istek bağlamında). Bir kural zincirde zaten varsa tekrar çalışmaz (`SKIPPED`, `LOOP_REPEAT`), zincir en çok **3** basamaktır (`LOOP_DEPTH`). Böylece A→B→A ve kendini tetikleyen kurallar sonlanır. Saf kural `checkAutomationLoop`, `matchesTrigger`, `matchesConditions` birim testlidir.
  - **Günlük:** her çalışma `automation_runs` kaydı (öğe, `OK/SKIPPED/FAILED`, mesaj); kural başına son 100 tutulur, ayarlarda son 30 görünür. Koşula uymayan olay günlüğe yazılmaz (gürültü olmasın).
  - **Arayüz:** Space ayarlarında "Otomasyonlar": ekle/düzenle penceresi (tetikleyici, koşullar, eylem satırları), aç/kapat, sil, çalışma günlüğü.
- **Alternatifler:** Arka plan kuyruğunda (pg-boss) asenkron çalıştırma (hata yeniden deneme ve yük izolasyonu iyi ama sonuç gecikir; ölçek gerektirirse taşınır); eylemleri doğrudan veritabanına yazmak (kuralları atlar, aktivite/DoD tutarsız olur); yalnızca zincir derinliği ile korumak (A→B→A üç tur dönerdi).
- **Bilinen sınırlar:** zamana bağlı tetikleyici (ör. bitiş tarihi geçti) ve "atandı", "yorum yazıldı" tetikleyicisi yok; koşullarda VEYA/özel alan koşulu yok; eylemler başarısız olunca yeniden denenmez; durum değişikliği eylemi DoD zorunluysa başarısız olabilir; kurallar arası çalışma sırası oluşturulma sırasıdır; Space şablonu (5.5) otomasyonları taşımıyor; eylem sonucu bildirimleri kendi tetikleyen kullanıcıya gitmez (kendini bilgilendirme kuralı).

## ADR-085 — CSV içe/dışa aktarma

- **Tarih:** 2026-10-05 · **Durum:** Kabul (brief §5.14 [F2]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** yalnızca **CSV** (kullanıcı kararı 2026-10-04: ClickUp/Jira içe aktarma şimdilik yok). Birim **List**: dışa aktarma List'in tüm işlerini (üst ve alt, liste sırasıyla, en çok 5000) verir; içe aktarma seçili List'e iş ekler. Menü: List başlığında "Veri".
  - **Dışa aktarma** (`GET lists/:listId/export`): `ID, Type, Title, Status, Priority, Assignees (e-posta), Labels, Points, Estimate hours, Start date, Due date, Parent, Created, Completed, Description` + Space'in özel alanları (ad başlıklı sütun; liste/çoklu seçim etiketiyle, kişi e-postayla). Satırlar JSON olarak gelir, dosya tarayıcıda `toCsv` ile üretilir (UTF-8 BOM, tırnaklama, formül enjeksiyonu koruması ADR-078); yetki `space.view`.
  - **İçe aktarma, iki adım:** `POST …/import/preview` yazmadan doğrular (eşleme verilmezse başlıklardan önerir: TR/EN eş anlamlılar ve özel alan adları, aksanlar ve büyük/küçük harf duyarsız), `POST …/import` uygular. Yetki `workItem.write`. Ayraç (`,` `;` sekme), BOM, tırnaklı çok satırlı hücre ve CRLF desteklenir; dışa aktarmadaki formül kaçışı geri alınır (gidiş-dönüş testli). Önizleme ilk 5 satırı, sorunlu satırları (kod + alan + değer) ve içe aktarılabilir satır sayısını gösterir.
  - **Eşlenen alanlar:** başlık (zorunlu), tip, durum (ada göre), öncelik, atananlar (e-posta ya da ad), etiketler (yoksa oluşturulur), puan, saat tahmini, başlangıç/bitiş (`YYYY-MM-DD`, `G.A.YYYY`, `G/A/YYYY`), üst öğe, açıklama (düz metin → paragraflar), ID/dış kimlik ve özel alanlar (türüne göre ayrıştırılır). Tip verilmezse üst öğeye göre `Sub-task/Task/…`, yoksa Task. Tahmin, hiyerarşi ve Scrum modu kuralları önizlemede de uygulanır.
  - **Güncelle-ya-da-oluştur:** ID sütunu, aynı Space'te **öğe anahtarı** (`MOB-3`) veya önceden içe alınmış **dış kimlik** (`externalSource='csv'` + `externalId`) ile eşleşirse öğe güncellenir (yalnızca dolu hücreler; boş hücre silmez; tip ve üst öğe değişmez), eşleşmezse oluşturulur ve ID dış kimlik olarak saklanır. Böylece aynı dosya tekrar yüklenince çoğalma olmaz ve dışa aktarılan dosya düzenlenip geri yüklenebilir. Üst öğe, anahtar veya dosyadaki dış kimlikle verilir; üstler altlardan önce işlenir, çözülemeyen `PARENT_NOT_FOUND`.
  - **Hata davranışı:** satır bazlı; hatalı satır atlanır ve raporlanır (en çok 100 sorun), geri kalanı içe alınır. Satırlar mevcut servislerle tek tek yazılır (okunabilir ID, aktivite, otomasyon tetikleyicileri aynen çalışır).
  - **Sınırlar:** dosya en çok 5 MB ve **500 satır** (aşarsa 422 `IMPORT_TOO_LARGE`; daha büyük veri parçalanır); API JSON gövde sınırı 100 KB'tan **6 MB'a** çıkarıldı (tüm uçlar için; alan doğrulamaları sınırlı olduğundan kabul edildi).
- **Alternatifler:** Yükleme `multipart` ile (JSON gövde sınırı sorunu çıkmaz ama dosya depolama/akış katmanı ve geçici dosya gerekir); asenkron arka plan işi (büyük dosyada iyi, ama 500 satır sınırında gereksiz karmaşa); dışa aktarmanın tarayıcıda görünen süzgeçli satırlarla sınırlanması (şimdilik tüm List); XLSX desteği.
- **Bilinen sınırlar:** sprint, yorum, ek, bağlantı (blocks), izleyen ve zaman kaydı içe/dışa aktarılmaz; durum eşlemesi yalnızca ad (olmayan durum satırı reddeder, otomatik oluşturmaz); kişi alanında aynı ad iki üyede varsa ilki yerine e-posta tercih edilmeli; 500 satırlık içe aktarma satır satır yazıldığı için birkaç saniye sürebilir; ClickUp/Jira dışa aktarma dosyalarının özel biçimleri (alt görev iç içe sütunları vb.) özel olarak ele alınmaz; JSON gövde sınırı global olduğu için kimlik doğrulamasız uçlar da 6 MB'a kadar gövde okur.

## ADR-086 — Kişisel API token'ları

- **Tarih:** 2026-10-05 · **Durum:** Kabul (brief §5.18 [F3]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Herkese açık API = mevcut REST API:** ayrı bir "public API" katmanı kurulmadı; tüm `/api` uçları, kullanıcı adına verilen **kişisel erişim token'ı** ile `Authorization: Bearer smt_…` başlığıyla kullanılabilir. Yetkiler token sahibinin rolleriyle aynıdır (token yetki genişletmez). OpenAPI belgesi geliştirmede `/api/docs`'ta (üretimde kapalı; ADR kararı değişmedi).
  - **Saklama:** token 256 bit rastgele, `smt_` önekli; veritabanında yalnızca **SHA-256 özeti** tutulur, düz değer oluşturma yanıtında **bir kez** gösterilir; listede ilk 10 karakter (önek) ve ad görünür.
  - **Kısıtlar:** kullanıcı başına en çok 20 etkin token; isteğe bağlı süre (30/90/365 gün ya da süresiz); **salt okunur** seçeneği (GET dışı 403 `TOKEN_READ_ONLY`); iptal anında geçerli; son kullanım zamanı dakikada bir güncellenir.
  - **Yetki sınırı:** token ile `/api/auth*` (oturum, şifre, profil) ve `/api/tokens*` uçlarına erişilemez (403 `TOKEN_NOT_ALLOWED`); böylece çalınan token hesabı ele geçirmez ve kendini çoğaltamaz. Token yönetimi yalnızca oturumla (web arayüzü).
  - **CSRF:** Bearer başlığı tarayıcının otomatik göndermediği bir kimlik bilgisidir; token isteklerinde CSRF denetimi atlanır. Cookie ile gelen istekler değişmedi.
  - **Arayüz:** Ayarlar → "API erişimi": oluştur (ad, süre, salt okunur), tek seferlik kopyalama kutusu, etkin token listesi, iptal, curl örneği.
- **Alternatifler:** OAuth2 istemci kaydı (kurum içi betikler için aşırı); workspace düzeyi servis hesabı token'ı (kişiye bağlı denetim izi ve yetki daha basit; ileride eklenebilir); token başına kapsam listesi (şimdilik yalnızca okuma/yazma).
- **Bilinen sınırlar:** token başına Space/workspace kısıtı yok (sahibin tüm yetkisi); istek başına oran sınırı yalnızca genel kurallara bağlı; denetim günlüğünde token ile yapılan değişiklik kullanıcı adıyla görünür, hangi token olduğu ayrıca işaretlenmez; üretimde OpenAPI belgesi kapalı olduğundan uç listesi ayrıca yayımlanmalı.

## ADR-087 — Giden webhook'lar

- **Tarih:** 2026-10-05 · **Durum:** Kabul (brief §5.18 [F3]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam:** webhook **Space** düzeyindedir (Space başına en çok 10); ad, adres, biçim (ADR-088), seçilen olaylar ve açık/kapalı. Olaylar: `item.created`, `item.status_changed`, `item.priority_changed`, `comment.created`, `sprint.started`, `sprint.completed` (+ elle `ping` testi). Yönetim ve günlük `space.settings` yetkisiyle.
  - **Olay kaynağı:** otomasyon motorunun kullandığı dahili olay yolu (`AutomationEvents`, ADR-084) çok dinleyicili yapıldı ve yorum/sprint olaylarıyla genişletildi. İş servisleri dinleyicileri bilmez; webhook servisi açılışta kaydolur. Dinleyici hatası asıl işlemi ve diğer dinleyicileri etkilemez.
  - **Teslimat:** olay → `webhook_deliveries` kaydı (yük anlık görüntü olarak saklanır) → `webhook.deliver` kuyruk işi (pg-boss; 5 yeniden deneme, üstel geri çekilme). `QUEUE_ENABLED=false` iken (testler) aynı istekte çalışır. Her deneme 10 sn zaman aşımlıdır, **yönlendirme izlenmez**, yalnızca 2xx başarıdır; durum `OK/FAILED`, deneme sayısı, HTTP kodu ve hata günlüğe yazılır; webhook başına son 50 kayıt tutulur.
  - **İmza (Genel biçim):** gövde JSON; başlıklar `X-Scrum-Event`, `X-Scrum-Delivery`, `X-Scrum-Timestamp` ve `X-Scrum-Signature: sha256=HMAC_SHA256(secret, "<timestamp>.<gövde>")`. Anahtar (`whsec_…`) oluşturmada **bir kez** gösterilir; alıcı zaman damgasını kontrol ederek tekrar saldırısını önleyebilir.
  - **SSRF koruması:** adres yalnızca `http(s)`, kimlik bilgisi içeremez; bulut meta veri adresleri (`169.254.*`, `metadata.google.internal`) **her zaman** yasaktır. Dahili/özel ağ adresleri (`localhost`, `10.*`, `192.168.*`, `172.16–31.*`, `*.internal`, IPv6 yerel) `WEBHOOK_ALLOW_PRIVATE_HOSTS` ile yönetilir: verilmezse yalnızca production dışında izinli (kurum içi Mattermost vb. için üretimde bilinçli açılır). Kapalıyken gönderim anında DNS çözümlenip özel adrese çözülen adlar da reddedilir.
  - **Yük:** `{ event, workspaceId, space{id,key,name}, actor{id,name,locale}, item{id,key,title,type,status,priority} | sprint{id,name,goal}, commentId?, url }`.
- **Alternatifler:** Aktivite kaydını doğrudan okuyan ayrı bir "outbox" işi (olay kaybı olmaz ama işlem içi yazım ve ek tablo/iş gerekir; ölçek gerektirirse); yalnızca workspace düzeyi webhook (Space yöneticisi kendi kanalını yönetemez); imzasız genel istek.
- **Bilinen sınırlar:** olay bırakma işlemi bittikten sonra yapılır ve süreç o anda çökerse olay kaybolabilir (en az bir kez garantisi yok, "outbox" değil); `item.updated` gibi ayrıntılı alan değişimi, atama, etiket ve silme olayları yok; DNS çözümlemesi ile bağlantı arasında rebinding penceresi kalır; imza anahtarı düz saklanır (HMAC için gerekli) ve döndürülemez (sil ve yeniden oluştur); teslimatı elle yeniden gönderme yok.

## ADR-088 — Slack ve Teams sohbet bildirimleri

- **Tarih:** 2026-10-05 · **Durum:** Kabul (brief §5.18 [F3]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Webhook altyapısı üzerinde biçim:** ayrı bir entegrasyon hesabı/OAuth uygulaması kurulmadı; kullanıcı Slack'te "Incoming Webhook" ya da Teams'te "Workflows → webhook isteği alındığında" adresini webhook olarak ekler ve **biçim** olarak Slack/Teams seçer. Aynı olay seçimi, teslimat günlüğü, yeniden deneme ve SSRF kuralları geçerlidir; bu biçimlerde imza yoktur (alıcı bunu doğrulamaz) ve gizli anahtar üretilmez.
  - **Mesaj:** olayı yapan kişinin diline (TR/EN) göre kısa cümle + ayrıntı satırı; öğe/sprint adresine bağlantı. Slack: `{ text }` (mrkdwn bağlantı `<url|başlık>`). Teams: Adaptive Card içeren `message` (Workflows webhook'u; "Scrum Manager'da aç" düğmesi).
- **Alternatifler:** Slack OAuth uygulaması / Teams botu (kanal seçimi ve iki yönlü komut sağlar ama uygulama kaydı, kurumsal onay ve genel adres gerektirir); eski Office 365 Connector `MessageCard` biçimi (Microsoft emekli ediyor).
- **Bilinen sınırlar:** tek yönlü (komut/eylem düğmesi yok); mesaj dili alıcı kanala göre değil olayı yapan kişiye göre; mesajda alan ayrıntısı (örn. eski durum) yok; Teams Adaptive Card'ının her kanal türünde aynı görünmesi garanti edilmez; Google Chat/Mattermost için ayrı biçim yok (Genel biçim kullanılabilir).

## ADR-089 — GitHub/GitLab commit ve PR bağlantısı

- **Tarih:** 2026-10-05 · **Durum:** Kabul (brief §5.18 [F3]; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Yön:** yalnızca **gelen** webhook (sağlayıcı → uygulama); uygulama GitHub/GitLab API'sine bağlanmaz, hesap/OAuth uygulaması ve kurumun dışarıya açık adresi dışında bir şey gerekmez. Workspace yöneticisi (`workspace.settings`) Ayarlar → Entegrasyonlar'da entegrasyon oluşturur (ad + sağlayıcı), webhook adresini (`/api/integrations/git/:id`) ve gizli anahtarı sağlayıcıya girer; anahtar **bir kez** gösterilir. Workspace başına en çok 10 entegrasyon; açıp kapatılabilir, son olay zamanı görünür.
  - **Doğrulama:** adres oturum/CSRF istemez (`@Public` + yeni `@SkipCsrf`) ve **kendi imzasıyla** doğrulanır: GitHub `X-Hub-Signature-256` = `sha256=HMAC(anahtar, ham gövde)` (ham gövde JSON ayrıştırıcısının `verify` kancasında saklanır), GitLab `X-Gitlab-Token` = anahtar; sabit zamanlı karşılaştırma. Hatalı imza, devre dışı ya da bilinmeyen entegrasyon aynı **401**'i verir (varlığı sızdırılmaz).
  - **Olaylar:** GitHub `push` (her commit) ve `pull_request`; GitLab `Push Hook` ve `Merge Request Hook`. Diğer olaylar yok sayılır (202, 0 bağlantı). Saf ve birim testli ayrıştırıcılar (`parseGithubEvent`, `parseGitlabEvent`) olayları ortak `GitEvent` biçimine çevirir.
  - **Anahtar eşleme:** commit mesajı, PR/MR başlığı, gövdesi ve dal adındaki `PRJ-142` biçimli anahtarlar (`extractItemKeys`: büyük harfli 2–10 karakter önek) bu workspace'te var olan, silinmemiş işlerle eşlenir (olay başına en çok 20 anahtar). Bulunamayan anahtar sessizce atlanır.
  - **Bağlantı kaydı:** `git_links` (iş, sağlayıcı, tür COMMIT/PULL_REQUEST, depo, dış kimlik, başlık, adres, PR durumu açık/birleşti/kapandı, yazar); aynı iş + depo + dış kimlik tek satırdır, PR olayları durumu ve başlığı **günceller**, tekrar gelen olay çoğaltmaz. Yeni bağlantı ve durum/başlık değişimi aktivite kaydına (`item.git_linked` / `item.git_updated`, aktör yok) yazılır. İş detayında "Geliştirme" bölümü (bağlantı, depo, kısa sha/PR no, durum rozeti) ve aktivite akışında cümle.
  - **Güvenlik/yan etki:** webhook yalnızca bağlantı üretir; iş durumunu, atamayı veya başka alanı **değiştirmez** (PR birleşince otomatik "Tamamlandı" yapılmaz; bunun için ileride otomasyon tetikleyicisi eklenebilir).
- **Alternatifler:** GitHub App/OAuth ile çift yönlü entegrasyon (PR durumu çekme, işte "PR oluştur" düğmesi; uygulama kaydı ve kurumsal onay gerektirir); depoları periyodik tarama (uzun gecikme, kimlik bilgisi saklama); anahtarı yalnızca commit mesajında aramak (dal adı ve PR gövdesi yaygın kullanım).
- **Bilinen sınırlar:** yalnızca GitHub ve GitLab (Bitbucket/Azure DevOps yok); yeni bağlantılar yalnızca olay geldiğinde oluşur, geçmiş commit/PR'lar taranmaz; webhook adresinin sağlayıcıdan erişilebilir olması kurum ağına bağlıdır; tek bir workspace entegrasyonu tüm depolardan olay alabilir (depo kısıtı yok); PR yeniden adlandırılırsa eski başlık güncellenir ama anahtar kaldırılırsa bağlantı silinmez; oran sınırı yok (imzasız istekler 401 ile erken reddedilir).

## ADR-090 — Yapay zekâ destekli öneriler

- **Tarih:** 2026-10-05 · **Durum:** Kabul (brief §5.19 [F3] opsiyonel; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Kapsam (ilk sürüm):** üç özellik, hepsi iş detayında "Yapay zekâ" menüsünde: **işi özetle** (açıklama, kriterler/checklist, alt işler, son 10 yorum), **hikâye + kabul kriteri öner** (Story/Task/Bug; kullanıcı hikâyesi taslağı ve 3–8 kriter) ve **Epic'i Story'lere böl** (3–8 öneri). Sprint özeti/retrospektif taslağı ve benzer iş tespiti ilk sürümde yok.
  - **Öneri, otomatik uygulama değil:** model hiçbir şeyi kendisi yazmaz; sonuç ekranda "öneri; kaydetmeden önce kontrol et" notuyla gösterilir, kullanıcı **Açıklamaya ekle / Kabul kriterleri listesi olarak ekle / Story'yi oluştur** düğmeleriyle onaylar ve bu işlemler mevcut yetkili yazma uçlarından geçer (aktivite kaydı, yetki ve doğrulama aynen çalışır). Özet `space.view` ile, öneriler `workItem.write` ile istenir.
  - **Sağlayıcı ve gizlilik:** Anthropic Messages API (`ANTHROPIC_API_KEY`, `AI_MODEL` varsayılan `claude-sonnet-5-5`, `AI_BASE_URL`). **Anahtar tanımlı değilse özellik tamamen kapalıdır** (arayüzde görünmez, uçlar 503 `AI_DISABLED`). Etkinleştirmek, işin metninin kurum dışındaki bir servise gideceği anlamına gelir; bu bilinçli bir yönetici kararıdır (anahtarı sunucu ortamına koyan kişi). Modele yalnızca ilgili işin metni gider (en çok 12.000 karakter); kullanıcı adları yalnızca yorum yazarı olarak geçer, e-posta/kimlik gönderilmez.
  - **Güvenilmeyen girdi:** iş içeriği `<item>` etiketleri arasında "talimat izleme, yalnızca içerik" uyarısıyla verilir; çıktılar yalnızca metin olarak gösterilir (HTML/komut çalıştırılmaz). Yapılandırılmış çıktılar JSON olarak istenir, kod çiti olsa da ayıklanır ve Zod şemasıyla doğrulanır; geçersizse 502 `AI_FAILED` (şemadan geçmeyen veri uygulanmaz).
  - **Maliyet/sınır:** kullanıcı başına dakikada en çok 10 istek (`AI_RATE_LIMIT`, bellekte; aşılırsa 429 `AI_RATE_LIMITED`), istek başına 60 sn zaman aşımı, çıktı üst sınırı 600–1500 token. Yanıt dili kullanıcının dil tercihine (TR/EN) göredir.
  - **Test:** testler ve E2E gerçek API'ye hiç gitmez: yerel sahte model sunucusuna yönlendirilir (ortam değişkenleri uygulama yüklenmeden önce ayarlanır).
- **Alternatifler:** Sağlayıcı soyutlaması (çoklu model/yerel model; tek sağlayıcıyla başlamak daha basit, gerektiğinde `complete` ayrılır); özelliği iş değişikliklerine otomatik uygulamak (denetim ve güven sorunu); Workspace düzeyi açma/kapama ayarı (şimdilik sunucu anahtarı yeterli; kurumda birden çok workspace olursa eklenir).
- **Bilinen sınırlar:** kabul kriterleri öneri listesi ayrı bir checklist olarak eklenir (işin mevcut "Kabul kriterleri" bölümüne otomatik yazılmaz); Epic bölme önerisinde mevcut alt işler modele verilir ama kopya engellenmez; istek sınırı tek süreçte bellektedir (çok süreçte süreç başına); kullanım/maliyet kaydı tutulmaz; model yanıtı yanlış olabilir (uyarı notu bu yüzden); özet ve öneriler önbelleğe alınmaz.

## ADR-091 — Paket boyutu optimizasyonu ve Docker ile üretim kurulumu

- **Tarih:** 2026-10-05 · **Durum:** Kabul (ADR-028'in uygulaması; ayrıntılar geliştirici varsayılanı, onay bekliyor)
- **Karar:**
  - **Web paketi:** ilk açılışta inen giriş parçası 488 KB → 96 KB (sıkıştırmasız). Sık değişmeyen kütüphaneler ayrı, uzun süre önbelleklenen parçalara bölündü (`react`, `tanstack`, `i18n`, `zod`); dil dosyaları ayrı parça oldu ve yalnızca etkin dil iner (diğeri dil değişince), uygulama etkin dil yüklenmeden çizilmez. Ağır modüller zaten rota bazında tembel yükleniyordu (grafikler ~400 KB, zengin metin editörü ~470 KB yalnızca ilgili sayfada). Caddy yanıtları zstd/gzip ile sıkıştırır; parmak izli dosyalar 1 yıl `immutable` önbelleklenir, `index.html` her zaman tazelenir.
  - **API çalışma paketi:** 415 MB → ~54 MB. `pnpm deploy --prod` sırasında `auto-install-peers` kapatıldı (`@prisma/client`'ın isteğe bağlı eşi olarak gelen Prisma CLI, Studio, PGlite, TypeScript vb. ~250 MB çalışma zamanında gereksiz); Prisma sorgu derleyicisinin PostgreSQL dışındaki motorları ile kaynak haritası/tip/belge dosyaları silinir. Budanmış paket yerelde üretim modunda çalıştırılarak doğrulandı (sağlık, veritabanı sorgusu, CSRF, iş kuyruğu).
  - **Docker Compose (tek sunucu):** `postgres` (17, Debian tabanlı — Türkçe arama glibc `en_US.UTF-8` yerel ayarı ister; kalıcı volume, iç ağda, port dışarı açılmaz) → `migrate` (yalnızca Prisma CLI içeren küçük imaj; `migrate deploy` çalıştırıp çıkar) → `api` (Node 24 alpine, root olmayan kullanıcı, sağlık kontrolü, dosya ekleri volume'de) → `web` (Caddy: statik arayüz, `/api` ters vekil, alan adı verilirse otomatik HTTPS, güvenlik başlıkları, yönetim API'si kapalı) ve `backup` (her gün belirli saatte `pg_dump` + dosya ekleri arşivi, N günden eskiler silinir). Tüm ayarlar kök `.env` dosyasından (`.env.example` şablonu); zorunlu değerler (`APP_URL`, `POSTGRES_PASSWORD`) verilmezse Compose başlamaz. Kurulum, güncelleme, yedek/geri yükleme ve sorun giderme `docs/DEPLOY.md`'de.
  - **Uyumluluk düzeltmeleri:** API, Docker ağındaki ters vekile güvenir (`trust proxy: loopback, uniquelocal`; aksi halde oran sınırı tüm kullanıcıları vekilin tek IP'si sayardı); boş ortam değişkeni (`KEY=`) verilmemiş sayılır.
- **Alternatifler:** Tek imajda API + statik dosya (Caddy'nin otomatik HTTPS'i ve sıkıştırması kaybolur); Kubernetes/Helm (tek sunucu için aşırı); `migrate`'i API açılışına gömmek (çalışma imajına Prisma CLI gerekir, boyut artar); zod yerine zod/mini (paylaşılan şemaların büyük çaplı değişimi; ölçülen kazanç ~60 KB).
- **Bilinen sınırlar:** Docker imajları bu ortamda indirme izni verilmediği için **derlenip çalıştırılmadı** (Compose dosyası `docker compose config` ile doğrulandı, API paketi Docker dışında aynı adımlarla doğrulandı); ilk kurulumu yapan kişi Owner olur (ADR-073), kurulum açığa çıkmadan yapılmalı; yedekler aynı sunucuda tutulur, dışarı kopyalamak yöneticiye kalır; tek sunucu (yatay ölçek, yüksek erişilebilirlik yok); `faz1-auth` E2E testi Mailpit gerektirdiği için doğrulanmadı.

## ADR-092 — Yönetici doğrudan hesap oluşturur

- **Tarih:** 2026-10-05 · **Durum:** Kabul (kullanıcı isteği: e-posta altyapısına bağlı kalmadan hesap açma)
- **Karar:** Ayarlar → Üyeler'de "Hesap oluştur": ad, e-posta, rol, isteğe bağlı şifre. `POST /workspaces/:id/members` (`members.manage`). Şifre verilmezse sunucu 12 karakterlik (karışık karakterlersiz) geçici şifre üretir; düz şifre yanıtta **bir kez** döner, veritabanında yalnızca özeti saklanır. Hesap hemen kullanılabilir, e-posta gönderilmez; kişi giriş yapıp profilinden şifresini değiştirir. Aynı kurallar davetle aynıdır: Owner rolü verilemez, Guest en az bir Space ile açılır (Stakeholder olarak), aynı üye ikinci kez açılamaz (409 `ALREADY_MEMBER`); e-posta başka bir workspace'te hesaba aitse yalnızca bu workspace'e eklenir ve şifresi değişmez. Aktivite kaydı `member.created`. Davet akışı alternatif olarak durur (ADR-034 değişmedi).
- **Alternatifler:** İlk girişte şifre değiştirmeyi zorunlu kılmak (kullanıcı modeline alan ve yönlendirme gerekir; şimdilik yöneticiye düşen sorumluluk); toplu CSV ile hesap açma.
- **Bilinen sınırlar:** geçici şifreyi güvenli ileten yönetici sorumludur; ilk girişte şifre değişimi zorunlu değildir; şifre politikası yalnızca alt sınır (8 karakter) denetler.

## ADR-093 — Doküman arama, sayfa ekleri ve görev listesi (Faz 7.5)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (yönetici yol haritası: önce Project Management, sonra Document Management)
- **Karar:** Global arama (`GET /search`) artık doküman sayfalarını da döndürür (`docs`): başlık (parça eşleşme) ve metin (Türkçe FTS, ön ek); yalnızca `doc.view` izni olan Space'lerden, silinen sayfalar hariç. `docs` için GIN dizinleri (`to_tsvector('turkish', title || plainText)`, `title gin_trgm_ops`). Dosya ekleri sayfalara da bağlanır: `attachments.docId` (CHECK: `workItemId` ile `docId`'den tam biri dolu), uçlar `docs/:docId/attachments` (yükle `doc.write`, indir/önizle `doc.view`, sil `doc.write`); güvenlik kuralları görev ekleriyle aynıdır (ADR-056). Süresi dolan çöpteki sayfaların dosyaları da diskten silinir. Editöre görev listesi (`taskList`/`taskItem`, onay kutulu) eklendi; sunucu doğrulaması `checked` değerinin boolean olmasını ister.
- **Alternatifler:** Ekleri ayrı tabloya koymak (aynı depolama/güvenlik mantığını çoğaltır); sayfa içine görsel gömme ve slash menüsü (ek bir görsel düğümü ve güvenlik incelemesi ister, ertelendi).
- **Bilinen sınırlar:** ek görselleri metin içine gömülmez, sayfanın altındaki Ekler bölümünde listelenir; arama sonuçlarında metin parçası (snippet) gösterilmez.

## ADR-094 — Tekrarlayan görevler (Faz 7.1)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (kullanıcı: ClickUp'taki tekrarlayan görev yapılsın)
- **Karar:** `work_items.recurrence` (`{freq: DAILY|WEEKLY|MONTHLY|YEARLY, interval: 1–365}`). Kural bitiş tarihi ister (`RECURRENCE_NEEDS_DUE_DATE`) ve Epic'te kullanılmaz (`RECURRENCE_NOT_ALLOWED`). Görev Done kategorisine geçince (tek tek, toplu veya otomasyonla) `RecurrenceService` aynı List'te kopyasını üretir (alt öğelerle, ilk durumda, işaretsiz checklist ile); bitiş tarihi bir sonraki tekrara kayar ve geçmişte kalmaz, başlangıç ve alt öğe tarihleri aynı kadar kayar. Kural yeni örneğe geçer, eskisinden silinir; böylece her an tek aktif örnek vardır ve eski örneği yeniden açıp kapatmak ikinci kopya üretmez. Aylık/yıllık tekrarda gün hedef ayda yoksa ayın son gününe oturur. Etkinlik: `item.recurred`.
- **Alternatifler:** Kuralı eskisinde bırakıp her tamamlamada üretmek (yeniden aç/kapat çoğaltır); önceden toplu üretmek (çok sayıda gelecek görev, kural değişince tutarsızlık).
- **Bilinen sınırlar:** "tamamlanma tarihine göre" ve "belirli hafta günü" kuralları yok; "bugün" UTC'ye göre hesaplanır; yeni örnek sprint'e otomatik girmez (backlog'a düşer).

## ADR-095 — Kişisel görev hatırlatıcıları (Faz 7.3)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (kullanıcı: ClickUp'taki hatırlatıcı yapılsın)
- **Karar:** `reminders` tablosu (kullanıcı, görev, zaman, not, `sentAt`). Her kullanıcı yalnızca kendi hatırlatıcılarını görür ve siler; kurmak için görevi görebilmek (`space.view`) yeter. Bir görevde kullanıcı başına en çok 10 bekleyen hatırlatıcı, zaman gelecekte ve en çok 366 gün ileride olmalı (`REMINDER_IN_PAST`, `REMINDER_LIMIT`). Her dakika çalışan zamanlanmış iş (`reminders.send`, pg-boss) zamanı gelenleri `sentAt` ile sahiplenerek (çift gönderim yok) `REMINDER` türünde uygulama içi bildirim ve e-posta olarak gönderir; kanallar bildirim tercihlerine uyar. Gönderilenler listede üstü çizili kalır, kullanıcı siler. Silinen görev için gönderilmez.
- **Alternatifler:** Görevin kendisine tek `remindAt` alanı (kişisel olmaz, çoklu hatırlatma yok); işi görev oluştururken kuyruğa gecikmeli göndermek (iptal/değişiklik zor).
- **Bilinen sınırlar:** hatırlatma anında kullanıcının Space'e erişimi yeniden doğrulanmaz (kurulurken erişimi vardı; bildirimde yalnızca görev anahtarı ve başlığı yer alır); en fazla dakikalık hassasiyet; tekrarlayan hatırlatıcı yok.

## ADR-096 — Formlar (Faz 7.4)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (kullanıcı: ClickUp'taki Form görünümü yapılsın)
- **Karar:** `forms` tablosu (Space'e ve hedef List'e bağlı; ad, açıklama, açılacak tip TASK/STORY/BUG, alan listesi, açık/kapalı). Tanımlama `space.settings` ile (en çok 20 form/Space). **Doldurma `space.view` yetkisiyle**: Space'i görebilen herkes, Stakeholder/Guest dahil, formla görev açabilir; bu, onlara genel görev yazma yetkisi vermeden "talep/hata bildirimi" toplamanın yoludur. Form alanları: başlık (her zaman zorunlu) + isteğe bağlı açıklama, öncelik, bitiş tarihi, atanacak kişi (her biri zorunlu işaretlenebilir; formda olmayan alanlar gönderilse bile yok sayılır). Görev `WorkItemsService.create` ile hedef List'te açılır (tüm doğrulamalar ve ITEM_CREATED otomasyonları çalışır), bildiren gönderen olur; açıklama doğrudan yazılır, etkinlik `item.form_submitted`. Kapalı form 409 `FORM_DISABLED`; yöneticiler kapalı formları da görür, diğerleri yalnızca açıkları.
- **Alternatifler:** Giriş yapmadan doldurulan herkese açık bağlantı (kimlik doğrulamasız yazma yüzeyi: spam, kötüye kullanım ve oran sınırı tasarımı ister; güvenlik fazına bırakıldı); özel alan ve etiket alanları (ayrı doğrulama; sonraya).
- **Bilinen sınırlar:** yalnızca oturum açmış workspace üyeleri doldurabilir; özel alan/etiket/dosya alanı yok; formdan gelen görevi ayırt eden işaret yalnızca etkinlik akışındadır.

## ADR-097 — Hedefler (Faz 7.9)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (kullanıcı: ClickUp'taki Goals yapılsın)
- **Karar:** `goals` (workspace düzeyinde) ve `goal_items` tabloları; iki tür: **görev bazlı** (`TASKS`: bağlı görevlerin Done kategorisindeki oranı) ve **sayısal** (`NUMBER`: başlangıç, güncel, hedef değer ve birim; ilerleme başlangıçtan hedefe kat edilen yol, azaltma hedefleri de çalışır, %0–100'e kırpılır; saf hesap `goalPercent`). Yetki, ilk sürüm "free ClickUp" yalınlığında: **Guest dışındaki her workspace üyesi** hedef oluşturur, düzenler, siler ve görev bağlar; hedef başına en çok 200 görev, workspace başına 200 hedef. İlerleme okuyanın görebildiği Space'lerdeki görevlerle hesaplanır; görülemeyen görevler listelenmez, yalnızca sayısı (`hiddenItemCount`) verilir. Silinen görev hedefte sayılmaz. Tür sonradan değiştirilemez; görev bazlı hedefe sayısal alan, sayısal hedefe görev bağlanamaz (`GOAL_WRONG_KIND`).
- **Alternatifler:** Hedefleri klasörlere ayırmak (ClickUp'ta var; ilk sürümde gereksiz); Space'e bağlı hedefler (çapraz Space hedefleri kısıtlanırdı); ilerlemeyi anlık görüntü olarak saklamak (geçmiş grafiği için; şimdilik her okumada hesaplanır).
- **Bilinen sınırlar:** hedef sahibine bildirim yok; ilerleme geçmişi/grafiği yok; yalnızca tarih ve sayı hedefi (para birimi, evet/hayır türü yok); yetkiler güvenlik fazında rol bazlı daraltılacak.

## ADR-098 — Birebir mesajlaşma (Faz 7.8)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (kullanıcı: mesajlaşma hem DM hem yorumlar olarak olsun; yorumlar zaten var)
- **Karar:** `conversations` (iki üye arasında tek konuşma; `userLowId < userHighId` CHECK'i ve benzersiz dizin aynı çiftin ikinci konuşma açmasını engeller; tarafların son okuma anı ve son mesaj anı tutulur) ve `messages` (düz metin, en çok 4000 karakter, gönderen silebilir → `deletedAt`, içerik arayüze gitmez). Yalnızca iki taraf okur/yazar; üçüncü kişi için konuşma yokmuş gibi 404. **Guest mesajlaşamaz ve Guest ile konuşma açılamaz** (üye listesi de Guest'e kapalıdır, ADR-035). Konuşma ilk mesaja kadar listede görünmez. Okunmamış sayısı, karşı tarafın son okumadan sonraki silinmemiş mesajlarıdır; mesaj yazmak konuşmayı okunmuş sayar. **Gerçek zamanlı kanal yok:** arayüz açık konuşmayı 4 sn, konuşma listesini/kenar çubuğu rozetini 15 sn'de bir yoklar (ADR-018 gerçek zamanlıyı F2'ye bırakmıştı; WebSocket geçişi API'yi bozmadan yapılabilir). Mesajlar için e-posta/bildirim kutusu bildirimi üretilmez, rozet yeterlidir.
- **Alternatifler:** Grup konuşmaları ve kanallar (üyelik, yönetim ve yetki gerektirir; talep edilmedi); WebSocket/SSE (ek altyapı, şimdilik yoklama yeterli).
- **Bilinen sınırlar:** mesaj düzenleme, dosya eki, tepki ve arama yok; konuşma silinemez; 50'şer mesajlık sayfalama API'de var, arayüzde "daha eski" yükleme düğmesi henüz yok; çevrimdışı e-posta bildirimi yok.

## ADR-099 — Doküman dışa aktarma ve sürüm farkı (Faz 7.6)

- **Tarih:** 2026-10-06 · **Durum:** Kabul
- **Karar:** Sayfa istemcide Markdown'a çevrilip indirilir (`docToMarkdown`; başlık, biçimler, bağlantı, listeler, görev listesi, kod bloğu, tablo). PDF için tarayıcının yazdırma iletişimi kullanılır; yazdırma stili yalnızca sayfa gövdesini basar. Sürüm geçmişinde seçili eski sürüm, güncel sürümle satır tabanlı (LCS) farkla karşılaştırılabilir; eklenen/silinen satırlar renk ve +/− işaretiyle, ekran okuyucu için metinle gösterilir. Hepsi saf, birim testli işlevlerdir (`doc-export.ts`); sunucuya yeni uç eklenmedi.
- **Alternatifler:** Sunucuda PDF üretimi (başsız tarayıcı bağımlılığı, Docker imajını büyütür); Word/HTML dışa aktarma (talep yok).
- **Bilinen sınırlar:** iki rastgele sürüm arası fark yok (yalnızca seçili ↔ güncel); fark kelime düzeyinde değil satır (blok) düzeyindedir; PDF biçimi tarayıcıya bağlıdır.

## ADR-100 — Gantt'ta bağımlı işleri otomatik kaydırma (Faz 7.2)

- **Tarih:** 2026-10-06 · **Durum:** Kabul
- **Karar:** Gantt'ta bir çubuk sürüklenince, "Bağımlı işleri otomatik kaydır" açıksa (varsayılan) bitiş-başlangıç kuralı korunur: öncülün bitişine çakışan (başlangıcı ≤ öncül bitişi) ardıllar, ihlali gidermeye yetecek **en az** gün kadar ileri kaydırılır ve zincir ardılların ardıllarına sürer (`cascadeReschedule`, saf ve birim testli; çakışma ölçütü `analyzeSchedule` ile aynı). Geri çekmede ardıllar yerinde kalır, döngüde yalnızca taşınan iş güncellenir. Güncellemeler mevcut `PATCH items/:id` ile öncülden başlayarak sırayla yapılır (yeni API ucu yok; her değişiklik normal doğrulama ve aktivite kaydından geçer). Kapalıysa yalnızca sürüklenen iş taşınır.
- **Alternatifler:** Sunucu tarafında tek işlemde toplu kaydırma (atomik olur ama yeni uç ve yetki/etkinlik mantığı gerektirir); baseline (planlanan tarih anlık görüntüsü) ve sürükleyerek bağımlılık çizme — ertelendi, talep netleşince.
- **Bilinen sınırlar:** zincirin ortasında bir hata olursa önceki kaydırmalar kalır ve hata gösterilir; tarihsiz ardıllar kaydırılmaz; baseline ve bağımlılık çizme yok.

## ADR-101 — Ekipler (Faz 7.7)

- **Tarih:** 2026-10-06 · **Durum:** Kabul (kullanıcı: ekip/grup özelliği yapılsın)
- **Karar:** `teams` ve `team_members` tabloları (workspace düzeyinde; ad workspace içinde benzersiz, renk, üyeler). Guest dışındaki her üye ekip oluşturur, düzenler, siler (yönetici "Team Management en yalın hâli" önceliği; yetkiler güvenlik fazında daraltılacak). Üyeler yalnızca Guest olmayan workspace üyeleri olabilir; Guest ekip listesini göremez. Ayarlar → Ekipler sayfasında yönetilir. **Kullanım:** görev/atanan seçicisinde "Ekibi ekle" kısayolu ekibin tüm üyelerini mevcut atananlara ekler. Atama yine kişi bazlıdır (ekip bir atanan türü değildir): ekip sonradan değişirse eski atamalar etkilenmez, bildirimler ve iş yükü hesapları değişmeden çalışır.
- **Alternatifler:** Ekibi doğrudan atanan türü yapmak (üyelik değişince tüm geçmiş atamalar, bildirimler ve iş yükü raporları yeniden tanımlanır; büyük etki); yorumlarda `@ekip` etiketi (mention düğümü ve bildirim dağıtımı değişir, ertelendi).
- **Bilinen sınırlar:** `@ekip` etiketleme ve ekip bazlı iş yükü görünümü yok; ekip silinince yalnızca grup kalkar.

## ADR-102 — Sprint ağacı, sürükle-bırak ve alt öğe yapma (Faz 8.1, 8.2, 8.7)

- **Tarih:** 2026-10-09 · **Durum:** Kabul (yönetici isteği; kullanıcı: hiyerarşi korunsun)
- **Karar:** Kenar çubuğunda "Backlog ve sprint'ler" satırı açılır; altında Space'in tüm sprint'leri (durum noktası ve öğe sayısıyla) listelenir, tıklayınca o sprint'in panosu açılır. Backlog sayfası tek bir sürükle-bırak bağlamıdır: Backlog ve her sprint birer bırakma alanıdır (boşken de); öğe Backlog ↔ sprint ↔ sprint sürüklenir (`POST backlog/move`, aktif sprint onayı korunur). Bir satır başka satırın **üzerine ≥ 48 px sağa** bırakılırsa o satırın alt öğesi olur (`POST items/:id/nest`); **Üst öğenin tipi hiçbir zaman değişmez:** tip kuralı izin veriyorsa öğe olduğu gibi alt öğe olur (Story → Epic'in altı; Task → Story'nin altı); izin vermiyorsa ve alt öğesiz bir Task ise Sub-task'a dönüşür (`planNest`: Task/Bug üstüne). Epic dışı bir üste giren öğe sprint'ten çıkar (üstüyle birlikte izlenir; aktif sprint'ten çıkış üyelik geçmişine yazılır). Görev anahtarına (MOB-12) tıklamak `/items/MOB-12` bağlantısını panoya kopyalar; adres görevi doğrudan açar. Sprint/Backlog listesi "Listeyi kopyala" ile sekmeyle ayrılmış metin olarak panoya alınır (Excel'e yapışır).
- **Alternatifler:** Üst görevi otomatik Epic yapmak (yöneticinin ilk önerisi; tip bütünlüğünü, tahmin birimlerini ve raporları bozar — kullanıcı reddetti); sprint ağacını ayrı rota yapmak (gereksiz sayfa).
- **Bilinen sınırlar:** sürükleyerek alt öğe yapmanın fare dışı yolu "Üst öğe seç…" menüsü olarak henüz yok; çok öğeli seçimin toplu sürüklenmesi yok.

## ADR-103 — Denetim günlüğü (Faz 8.3)

- **Tarih:** 2026-10-09 · **Durum:** Kabul (yönetici isteği: "kimin ne zaman ne yaptığı loglardan görülmeli")
- **Karar:** Mevcut `activity_events` (append-only, ADR-015) tek doğruluk kaynağıdır; yeni tablo yok. `GET workspaces/:id/audit` kişi, nesne türü, eylem öneki ve tarih aralığıyla süzer, imleçle 50'şer sayfalar; `workspace.audit.view` izni (Sahip/Yönetici) gerekir. Ayarlar → Denetim günlüğü sayfası zamanı, kişiyi, nesneyi (görev için bağlantı) ve eylemi gösterir; görünür sayfa CSV olarak indirilir. Kayıt kapsamına ekip, doküman düzenleme (yeni sürüm açıldığında), CSV/Excel içe aktarma, yedek alma/geri yükleme ve sprint içe aktarma eklendi.
- **Alternatifler:** Ayrı denetim tablosu (aynı veri iki yerde); dosya tabanlı log (aranamaz).
- **Bilinen sınırlar:** oturum açma/çıkma ve ayar değişiklikleri (webhook, API anahtarı) henüz günlükte değil; CSV yalnızca yüklenmiş sayfaları içerir; kayıt saklama süresi/arşivleme yok.

## ADR-104 — Sprint Excel dışa/içe aktarma (Faz 8.4)

- **Tarih:** 2026-10-09 · **Durum:** Kabul (yönetici isteği)
- **Karar:** `exceljs` ile `.xlsx`: "Sprint" (ad, hedef, tarihler, durum), "Items" (CSV dışa aktarmasıyla **aynı sütunlar**: ID, Type, Title, Status, Priority, Assignees, Labels, Points, Estimate hours, dates, Parent, Description, özel alanlar) ve "Links" (Source, Type, Target) sayfaları. Üst öğesi dosyada olmayan satırın "Parent" hücresi boş bırakılır (dosya başka Space'e taşınabilir). İçe aktarma mevcut CSV hattını yeniden kullanır (`CsvService.importTable`): ID'si bu Space'te olan öğeler **güncellenir**, olmayanlar seçilen List'te **oluşturulur**; üst öğeler ve bağımlılıklar yeni kimliklere çevrilir; uygun öğeler (Story/Bug/Task, üst düzey, bitmemiş) yeni ya da seçilen sprint'e alınır. Önce doğrulama (önizleme), sonra yazma. Backlog da dışa aktarılır.
- **Alternatifler:** Yalnızca CSV (Excel'de Türkçe karakter/ayırıcı sorunları, çok sayfa yok); öğeleri hep yeni açmak (aynı Space'te düzenleyip geri yükleme senaryosu çalışmaz).
- **Bilinen sınırlar:** yorum, checklist ve ek taşınmaz (bunlar için Space/Sprint yedeği); Excel'de silinen satır uygulamada silinmez; 5 MB dosya sınırı.

## ADR-105 — Space ve Sprint yedeği (Faz 8.5)

- **Tarih:** 2026-10-09 · **Durum:** Kabul (yönetici isteği: sıkıştırılmış yedek, geri yükleme)
- **Karar:** Yedek tek bir ZIP'tir (`fflate`): `manifest.json` (biçim, sürüm, tür, sayılar, kullanıcı e-postaları), `data.json` (tablo satırları olduğu gibi) ve `files/<ek kimliği>` (ek dosyaları). Kapsam tablo listesiyle belirlenir (`backup-tables.ts`): durum, klasör, liste, etiket, özel alan, sprint (+üyelik geçmişi), iş öğesi (+atananlar, etiketler, checklist, bağlantılar, yorumlar, ekler), doküman (+sürümler). **Geri yükleme her zaman yeni kayıt açar:** Space yedeği yeni anahtarla yeni Space olur (anahtar çakışırsa 409); Sprint yedeği seçilen Space'e yeni sprint olarak eklenir (durumlar/etiketler adla eşlenir, öğe numaraları Space sayacından verilir). Tüm kimlikler yenilenir; tablolar arası bağlar ve sayfa/açıklama içindeki görsel adresleri yeni kimliklere çevrilir; kullanıcılar e-postayla eşlenir (bulunamayan atanan atlanır, yazar boş kalır). Tek işlemde yazılır, hata olursa hiçbir şey kalmaz; ek dosyaları işlem bittikten sonra diske yazılır. Space yedeği `space.settings`, sprint yedeği `sprint.plan` ister; Space geri yükleme yalnızca Sahip/Yönetici (workspace ayarı izni). Zip bombasına karşı sıkıştırılmış 200 MB / açılmış 600 MB sınırı ve yalnızca bilinen dosya adları açılır.
- **Alternatifler:** `pg_dump` (tüm veritabanı; Space bazında geri yüklenemez); alan alan elle eşleme (yeni alan eklenince yedek eksik kalır — genel dökümde kendiliğinden taşınır).
- **Bilinen sınırlar:** zaman kayıtları, formlar, otomasyonlar, şablonlar, webhook'lar, hedefler, bildirimler, Space üyeleri/rolleri ve mesajlar yedeğe girmez; geri yüklenen Space'te Space üyeliği yeniden verilmelidir; Sprint yedeğinde dokümanlar yoktur; yorum tepkileri/anmalar taşınmaz.

## ADR-106 — Dokümanda görsel ve Word dışa aktarma (Faz 8.6)

- **Tarih:** 2026-10-09 · **Durum:** Kabul (yönetici isteği: tablo, görsel, link; Word)
- **Karar:** Zengin metne `image` düğümü eklendi; `src` **yalnızca** bu uygulamanın ek uç noktasından biri olabilir (`/api/workspaces/…/docs|items/…/attachments/…?preview=1`), dış adres ve `data:` reddedilir (hem sunucu hem görüntüleyici doğrular). Editör: araç çubuğundan seç, panodan yapıştır ya da sürükle-bırak; dosya sayfanın eki olarak yüklenir (PNG/JPEG/GIF). "Word olarak indir" tarayıcıda `docx` ile üretilir (başlıklar, biçimler, bağlantılar, listeler, görev listesi, tablo, alıntı, kod, görsel gömülü). Geri al/yinele (araç çubuğu + Ctrl+Z / Ctrl+Shift+Z) ve sürüm listesi/geri dönme zaten vardı; E2E ile kanıtlandı. **Hata düzeltmesi:** `setEditable()` güncelleme olayı yayınlıyordu; bu yüzden her sayfa açılışında 1,5 sn sonra gereksiz otomatik kayıt yapılıyor, `revision` ve sürüm sayısı şişiyor ve gerçek düzenlemeyle yarışıyordu. Artık sessiz.
- **Alternatifler:** Sunucuda Word üretimi (ek bağımlılık/yük); base64 gömülü görsel (belge boyutu sınırı 200 KB, yedek ve arama şişer).
- **Bilinen sınırlar:** görsel boyutlandırma ve hizalama yok; açıklama (görev) editöründe görsel yok; WebP desteklenmez; Word'de bilgi kutusu/altyazı yok.

## ADR-107 — Story Point her görevde, alt görev toplamı, yüzde ve sprint özeti (Faz 9.1)

- **Tarih:** 2026-10-12 · **Durum:** Kabul (yönetici isteği, 11 madde)
- **Karar:**
  - **Puan her tipte** girilir (`points`); geçerli değerler Fibonacci 1,2,3,5,8,13,21,34,55 (ölçeği T-shirt/serbest olan Space'ler eskisi gibi). Saat tahmini Task/Sub-task'ta ayrıca durur. ADR-045'in "puan yalnızca Epic/Story/Bug" kuralı kalktı.
  - **Alt görev toplamı:** Sub-task'ı olan işin puanı alt görevlerin puanları toplamıdır ve elle değişmez (`WORK_ITEM_POINTS_FROM_SUBTASKS`, arayüzde kilitli). Toplam **veritabanı tetikleyicisiyle** (`sync_subtask_points`) yazma anında tutulur; böylece raporlar, velocity, CSV/Excel içe aktarma, sürükleyerek alt öğe yapma, silme/geri alma ve yedekten dönme tek kuralla tutarlı kalır. Son Sub-task kalkınca üst işte son toplam kalır ve puan yeniden elle girilebilir olur. Alt görevlerin hiçbirinde puan yoksa üst puan dokunulmaz.
  - **Yüzde:** `percentDone` (0–100). Atanan kişi (ya da yazma yetkisi olan) girer; Epic'te girilmez, alt görevli işte alt görevlerden puan ağırlıklı hesaplanır. Done durumundaki iş %100 sayılır.
  - **Sprint özeti:** `SprintSummary` toplam puan, biten puan, puan ağırlıklı toplam yüzde ve kişilere dağılım taşır. Birden çok kişiye atanmış işin puanı eşit bölünür (kişi toplamları sprint toplamına eşit kalır); atanmamış işler ayrı satırdır. Backlog'da sprint başlığındaki özet düğmesi ve Sprint panosunda açılır.
  - **Önceliğe göre renk:** Board kartı ve Backlog satırı için aç/kapa; tercih tarayıcıda (kullanıcıya özel) saklanır.
  - **Kanban:** Her sprint'in panosu zaten vardı (Sprint panosu, sprint seçici); sprint menüsüne "Kanban panosunu aç" kısayolu eklendi. Kanban = işlerin durum sütunlarında kartlarla izlendiği, WIP limitiyle akışın görünür tutulduğu pano.
  - **JSON dışa aktarma:** `GET sprints/:id/export.json` (biçim `egebis-seyir.sprint`, sürüm 1): sprint, özet, öğeler (anahtar, bağlantı, durum, atananlar, puan, yüzde…), bağımlılıklar.
  - **URL:** Görev `/items/MOB-12` (vardı); sprint `/sprints/<id>` → sprint panosuna yönlenir; menü ve panodan "Bağlantıyı kopyala".
- **Alternatifler:** Toplamı okurken hesaplamak (rapor/velocity sorguları ham `points` kullanıyor, her biri değişirdi); uygulama katmanında her yolda güncellemek (CSV, yedek, sürükleme gibi çok yol, unutma riski); kişi başına ayrı yüzde (çok atananlı işte karmaşık, tek alan yeterli görüldü).
- **Bilinen sınırlar:** CSV/Excel ile içe aktarılan üst işin puanı, bir sonraki alt görev değişikliğine kadar alt görev toplamını ezebilir; yüzde işe tek değerdir (kişi başına değil); JSON yalnızca dışa aktarılır (içe aktarma Excel/yedekle).

## ADR-108 — Görselli kullanıcı kılavuzu ve uygulama içi Yardım (Faz 9.2)

- **Tarih:** 2026-10-15 · **Durum:** Kabul (istek: Sprint/Task/Sub-Task oluşturma ve düzenleme için işaretli görsellerle kılavuz; hem doküman hem uygulama içi)
- **Karar:** Kılavuz içeriği tek kaynaktır: `apps/web/src/features/help/guide.<tr|en>.json` (bölüm → blok: paragraf, adım listesi, ipucu/uyarı, tablo, numaralı işaretli görsel + açıklama listesi). Aynı JSON iki çıktıyı besler: (1) uygulamada `/help` sayfası (üst çubukta **Yardım** düğmesi, hesap menüsünde "Yardım ve kılavuz", `?section=` ile bölüme doğrudan bağlantı, arayüz diline göre TR/EN) ve (2) Word (`scripts/docs/make-guide-docx.cjs`, `apps/web/public/help/*.docx`, sayfadaki "Word olarak indir"). Görseller elle çekilmez: `e2e/guide-screenshots.spec.ts` (`GUIDE_SHOTS=1 [GUIDE_LANG=en]`) gerçek arayüzü sürer, her ekrana kırmızı numaralı çerçeve/daire ekleyip `public/help/<dil>/*.png` üretir; arayüz metinleri `locales/<dil>/common.json`'dan okunur, böylece iki dil aynı akışla üretilir ve arayüz değişince görseller yeniden üretilebilir.
- **Alternatifler:** Elle ekran görüntüsü + resim düzenleyicide işaretleme (arayüz değişince eskir, iki dil ayrı iş); harici yardım sitesi/video (bakım yükü, çevrimdışı çalışmaz); kılavuzu yalnızca Word yapmak (uygulama içinde bağlam yok).
- **Bilinen sınırlar:** Görseller TR ve EN arayüzde üretilir ancak Space durum adları gibi kullanıcı verileri iki dilde de aynı örnek verinin adıdır; Word'de içindekiler sayfa numarasız liste; arayüz değişince `GUIDE_SHOTS` ile görseller ve Word yeniden üretilip commit'lenmelidir.

## ADR-109 — Task'ı Epic'e dönüştürme (Faz 9.3)

- **Tarih:** 2026-10-16 · **Durum:** Kabul (istek: proje Epic/Task'lara bölündükten sonra çok kapsamlı çıkan bir Task Epic'e çevrilebilsin; isteğe bağlı)
- **Karar:** `POST items/:id/convert-to-epic` (`work-item.write`). Yalnızca **Task** dönüşür (`WORK_ITEM_NOT_PROMOTABLE`) ve Space Scrum modunda olmalıdır (basit listede Epic yok). Epic üst öğe, sprint, saat tahmini, tamamlanma yüzdesi ve tekrar taşımadığı için tek işlemde: tip → Epic; üst Story bağı kopar; sprint'ten çıkar (sprint üyelik geçmişine REMOVED yazılır, aktif sprint'te `sprint.plan` ister, kapalı sprint'te 409); `estimateHours`, `percentDone`, `recurrence` temizlenir. Epic'in altında Sub-Task geçerli olmadığı için **Sub-Task'lar Story'ye döner** ve Epic'in altında kalır. Story Point, başlık, açıklama, kişiler, etiketler, yorumlar, ekler ve bağımlılıklar korunur; son Sub-Task toplamı Epic'in puanında kalır (ADR-107 tetikleyicisi bu geçişte puanı ezmez). Aktivite `item.updated` (`type: TASK → EPIC`, varsa `parentId`). Arayüz: Task satırı **⋯** menüsü ve detay paneli **⋯** menüsünde "Epic'e dönüştür", onay penceresi neyin değişeceğini sayar.
- **Alternatifler:** Task'ı silip Epic'i baştan yazmak (yorum/ek/geçmiş kaybolur); Sub-Task'ları silmek ya da dönüşümü engellemek (veri kaybı / kullanışsız); dönüşümü geri alınabilir yapmak (Epic'e sonradan eklenen Story'lerin akıbeti belirsiz olurdu).
- **Bilinen sınırlar:** Dönüşüm geri alınamaz (Epic → Task yok); Story/Bug/Sub-Task dönüştürülemez; toplu dönüştürme yok.

## ADR-110 — Story tipi kaldırıldı: hiyerarşi Epic → Task → Sub-Task (Faz 9.4)

- **Tarih:** 2026-10-16 · **Durum:** Kabul (istek: hiyerarşi Epic'ten sonra Task, Task'tan sonra Sub-Task olsun; Story çıkarılsın). ADR-044/045/061/065/109'daki Story anlatımlarının yerine geçer.
- **Karar:** İş öğesi tipleri **Epic, Task, Sub-Task, Bug**. Üst-alt kuralı: Epic üst öğe almaz; **Task → Epic'e bağlanabilir ya da bağımsız**; **Sub-Task → Task veya Bug**; **Bug → bağımsız, Epic veya Task**. Story'nin üstlendiği roller Task'a geçti: Sprint'e **Task ve Bug** girer (Epic'in altındaki Task de, kendi başına); DoR/DoD ve "tahminsiz" vurgusu **Task ve Bug** içindir; Epic ilerlemesi/özeti doğrudan alt Task/Bug'lardan hesaplanır; formlarla **Task ve Bug** açılır; "bölme" artık **Task'ı Sub-Task'lara** böler; YZ "Epic'i böl" önerisi Task üretir. Task'ı Epic'e dönüştürmede (ADR-109) Sub-Task'lar **Task** olur. Sürükleyerek alt öğe yapma kuralı aynıdır (Task → Task/Bug üstüne = Sub-Task). Dış kaynaktan (CSV/Excel/ClickUp) gelen "Story/Hikaye/User Story" satırları Task olarak içe aktarılır.
- **Veri geçişi (`20261016100000_remove_story_type`):** Mevcut Story'ler Task olur. Story'nin altındaki Task'lar Sub-Task olur; onların Sub-Task'ları (üçüncü seviye) Story'ye (yeni Task'a) bağlanır. Formlar, kayıtlı görünüm, şablon ve otomasyon JSON'undaki `STORY` değerleri `TASK` yapılır. PostgreSQL enum değeri silemediği için `WorkItemType` yeniden oluşturulur (alt görev toplamı tetikleyicisi tür değişimi boyunca kaldırılıp aynen geri konur).
- **Alternatifler:** Story'yi veritabanında tutup arayüzden gizlemek (iki doğru kaynak, sızan tip); Story'leri Epic'e çevirmek (Epic sprint'e girmez, planlama kaybolur); Story altındaki Task'ları silmek (veri kaybı).
- **Bilinen sınırlar:** Eski etkinlik kayıtlarındaki "Story" metinleri olduğu gibi kalır; Story'li dış dosyalarda tip bilgisi Task'a iner; geri dönüş (Task → Story) yoktur.

## ADR-111 — İngilizce terimler, dile göre görünen varsayılan adlar, büyük "New" düğmesi (Faz 10.1)

- **Tarih:** 2026-10-17 · **Durum:** Kabul (istek: dil ve terimler İngilizce; yeni bölümler ve düğmeler dikkat çekici ve büyük; İngilizce modda sol menüde "Görevler" yazmasın).
- **Karar:** (1) Üst çubuğa gradyanlı, 44 px yüksekliğinde **"+ New"** düğmesi (`variant="cta"`, `size="xl"`) eklendi: Task, Epic, Bug ve Space tek menüden; kısayol **N**. Task/Epic/Bug için Space ve List seçmeli oluşturma penceresi açılır, açık olan Space/List varsayılandır, dosya eklenebilir (ADR-114). Sidebar'daki "Space oluştur" ve boş durum düğmeleri de aynı büyük stile geçti; satır içi hızlı oluşturmanın "Ekle ↵" bağlantısı gerçek düğme oldu. (2) Space oluşturulurken veritabanına yazılan **varsayılan liste adı** ("Görevler"/"Tasks") ve **durum adları** ("Yapılacak", "To Do"…) gösterilirken kullanıcının diline çevrilir (`lib/default-names.ts`); kullanıcının kendi verdiği adlar olduğu gibi kalır. (3) Alan terimleri (Epic, Task, Sub-Task, Bug, Sprint, Backlog…) Türkçe arayüzde de İngilizce kalır.
- **Alternatifler:** Varsayılan adlar için veritabanında `isDefault` işareti (migration + tohumlama değişikliği; ad eşleştirmesi aynı sonucu verir ve mevcut kayıtları da düzeltir).
- **Bilinen sınırlar:** Kullanıcı bir listeye bilerek "Görevler" ya da "Tasks" adını verirse arayüz dili değişince o ad da çevrilir.

## ADR-112 — Özel roller ve düzenlenebilir izin matrisi (Faz 10.2)

- **Tarih:** 2026-10-17 · **Durum:** Kabul (istek: roller Ayarlar'da özelleştirilebilsin). ADR-011'deki "F2 özel rol = veri" notunu hayata geçirir.
- **Karar:** **Ayarlar → Roles** sayfası: Space ve Workspace rolleri için izin matrisi; sistem rollerinin izinleri tek tıkla açılıp kapatılır (anında kaydedilir), "Varsayılana döndür"; yeni **özel rol** oluşturma/yeniden adlandırma/silme (kullanımdaysa başka role devir). Rol anahtarı artık serbest metin (`OWNER`, `DEVELOPER`… ya da `custom_<uuid>`); atama uçları rolü veritabanından doğrular (`ROLE_NOT_FOUND`). **Özel workspace rolü "Member" katmanındadır** (`Role.baseKey = 'MEMBER'`): Owner/Admin/Guest kuralları (`roleTier`) bu katmana bakar; Admin ayrıcalığı (tüm Space'lere erişim) özel role verilemez. **Korumalar** (`validateRolePermissions`): OWNER kilitli; Admin üye ve ayar yönetimini kaybedemez; özel rolde `workspace.delete` olamaz; her Space rolü `space.view` içerir; bilinmeyen/yinelenen izin reddedilir. İzin kataloğu (`PERMISSION_CATALOGUE`) arayüzün tek kaynağıdır; spec her izni doğrular. Yeni izin: `workItem.access.manage` (ADR-113).
- **Alternatifler:** Özel rolün katmanını (Admin/Member) seçtirmek (Admin katmanı "tüm Space'ler" ayrıcalığını da getirir; karışıklık); rol atamasını rol kimliğine çevirmek (API sözleşmesi bozulur).
- **Bilinen sınırlar:** Özel Guest katmanı yoktur; davet e-postasında özel rolün adı yerine "Member" yazar; özel rol izinleri sonradan kısıtlanırsa üyeler bir sonraki istekte anında etkilenir (önbellek yok).

## ADR-113 — Öğe bazlı erişim: miras, ekleme ve gizli öğe (Faz 10.3)

- **Tarih:** 2026-10-17 · **Durum:** Kabul (istek: yetkiler Space'ten Epic/Task/Sub-Task'a kalıtsal olsun; öğeye özel yetkilendirme yapılabilsin). ADR-035'te "ileride eklenebilir" denen öğe bazlı paylaşımı kapatır.
- **Karar:** Varsayılan: öğe **Space erişimini miras alır**. Bir öğede **Share** düğmesiyle kişi/takım + Space rolü eklenebilir ("ekleme": Space rolüne ek) ve öğe **Gizli** yapılabilir ("kısıtlama": yalnızca listedekiler + Owner/Admin + öğeyi oluşturan görür; listedeki rol, Space rolünün yerini alır). Ayar **alt ağaca iner**; alt öğe kendi kaydını açarsa en yakın kayıt geçerlidir. Veri: `work_item_access` + `work_item_access_entries`; alt ağaç için `work_items.accessRootId` (en yakın kayıtlı üst, kendisi dahil) **veritabanı tetikleyicileriyle** tutulur (ekleme, `parentId` değişimi, kayıt ekleme/silme). Etkin izin `itemPermissions()` (shared) ile hesaplanır. **Zorlama:** (a) tenant Prisma uzantısı (`$allOperations`) her `WorkItem` sorgusuna "gizli köklerin altında değil" koşulunu ekler — liste, backlog, board, sprint, rapor, dışa aktarma, Gantt, arama… tek noktadan; ham SQL'li arama ve etkinlik akışı aynı koşulu elle taşır; (b) `SpacePermissionGuard`, `itemId` rotalarında etkin izni öğeden hesaplar, üst öğe verilerek oluşturmada üst öğedeki yazma rolünü hesaba katar. **Yönetim:** yeni izin `workItem.access.manage` (Product Owner, Scrum Master); yükseltme yok (başkasına kendi izinlerinden fazlası verilemez; Owner/Admin hariç); Guest'e yalnızca Stakeholder; gizli yapan kişi listede yoksa kendi Space rolüyle eklenir. API: `GET/PUT/DELETE items/:id/access`; etkinlik kaydı `item.access_changed`.
- **Alternatifler:** Her istekte özyinelemeli CTE (liste sorgularını yavaşlatır); öğe bazlı izin kontrolünü her serviste elle yazmak (kaçırma riski, ~90 sorgu noktası).
- **Bilinen sınırlar:** (1) Öğe erişimi **Space'e görünürlüğü olan** kişiler içindir; özel (private) Space'te üye olmayana öğe vermek Space'i açmaz (önce Space'e Stakeholder olarak eklenir). (2) Toplu işlemler (`bulk`) ve başka modeller üzerinden dolaylı okumalar (zaman girdileri, hedefler, doküman bağlantıları) Space düzeyinde izinle çalışır; gizli öğenin kimliği bu yollardan doğrudan istenirse 404 döner ama bu modellerdeki toplamlar gizli öğeyi içerebilir. (3) Raporlardaki toplamlar izleyene göre değişebilir.

## ADR-114 — Dosya eki: her tür kabul, güvenli indirme (Faz 10.4)

- **Tarih:** 2026-10-17 · **Durum:** Kabul (istek: dosya ekleme düzeltilsin, Task ve Epic'te çalışsın, tüm formatlar desteklensin). ADR-056'daki uzantı yasağını ve içerik reddini kaldırır.
- **Karar:** **Her dosya türü kabul edilir** (exe, bat, sh dahil). Güvenlik indirme tarafında: yalnızca resim (png/jpeg/gif/webp) ve PDF satır içi önizlenir; diğer her şey `application/octet-stream` olarak saklanır, `Content-Disposition: attachment` ile iner, `default-src 'none'; sandbox` CSP'si korunur. Uzantı resim/PDF diyor ama içerik başkaysa dosya **reddedilmez**; türü içerikten alınır (tanınmazsa octet-stream) ve önizlenmez. Sınır **100 MB** (`MAX_UPLOAD_MB`, Caddy 128 MB), öğe başına 50 ek. `Content-Disposition` RFC 6266'ya uygun: ASCII yedek ad + `filename*=UTF-8''…` (`'()*` yüzde-kodlu). Arayüz: ek bölümünde büyük sürükle-bırak/tıkla/**yapıştır** alanı, yükleme sayacı; Epic dahil her tipte açık; **oluştururken** dosya seçilebilir ("New" penceresi).
- **Alternatifler:** Yalnızca engel listesini kısaltmak (istek "tüm formatlar"); virüs tarama (ayrı iş; ClamAV kancası eklenebilir).
- **Bilinen sınırlar:** İndirilen çalıştırılabilir dosyanın güvenliği kullanıcıya aittir; sunucuda tarama yoktur.

## ADR-115 — Kanban Space modu ve Space geneli board (Faz 10.5)

- **Tarih:** 2026-10-17 · **Durum:** Kabul (istek: Kanban board eklensin). Brief §5.9 "Bağımsız Kanban"ı karşılar.
- **Karar:** Space oluştururken **Scrum** ya da **Kanban** seçilir (mevcut `scrumEnabled=false` modu "Kanban" adını aldı: sprint/backlog/Epic yok; Task, Sub-Task, Bug). Her Space'in kenar çubuğunda **Kanban board** bağlantısı vardır: `GET spaces/:spaceId/kanban` Space'in tüm açık listelerinin öğelerini döner; sayfa (`/spaces/:id/kanban`) ortak `BoardView`'u kullanır — sütunlar = durumlar, sürükleyince durum (DoD/engelli uyarısı dahil `status-guard`), WIP uyarısı (ADR-080), swimlane, **liste/kişi/metin süzgeci**, karta tıklayınca yan panel, **sütunun altından hızlı kart ekleme** (seçili listeye, o durumla). Alt görevler panoda ayrı kart olmaz.
- **Alternatifler:** Yeni `Space.mode` enum'u (mevcut boolean aynı ayrımı taşıyor; veri geçişi gereksiz); her listeye ayrı Kanban (zaten var: List "Board" sekmesi).
- **Bilinen sınırlar:** Sütun içi elle sıralama (rank) ve sütun daraltma yoktur; panoda süzgeç kaydedilmiş görünüme bağlanmadı; CFD/lead-time raporları yoktur.

## ADR-116 — Listede sürükle-bırak: Task'ı Sub-Task yapma ve "Ayır" (Faz 11)

- **Tarih:** 2026-10-18 · **Durum:** Kabul (istek: listede bir Task'ı başka bir Task'ın üstüne sürükleyince onay penceresiyle Sub-Task olsun; Sub-Task, sürüklerken altta ortada çıkan "Ayır" alanına bırakılınca ana Task'tan ayrılıp Task olsun; yalnızca Task ve Sub-Task taşınsın).
- **Karar:** List görünümünde Task ve Sub-Task satırlarının solunda (üzerine gelince) sürükleme tutamacı vardır (`@dnd-kit/core`). Bırakılabilecek hedefler yalnızca **Task** satırlarıdır; alt görevi olan bir Task başka bir Task'ın altına alınamaz (Sub-Task'ın alt öğesi olmaz), öğe kendi alt ağacına bırakılamaz. Bırakınca **onay penceresi**: "HTK-2, HTK-1 öğesinin Sub-Task'ı olsun mu?" → mevcut `POST items/:id/nest` (ADR-102). Üst öğesi olan bir öğe sürüklenirken ekranın altında ortada büyük **"Ayır"** alanı çıkar; oraya bırakılıp onaylanınca yeni `POST items/:id/unnest` çağrılır: Sub-Task bağımsız **Task** olur, Epic altındaki Task yalnızca Epic'ten ayrılır. Etkinlik kaydı `item.updated` (parentId/type).
- **Alternatifler:** Onaysız anında taşıma (yanlışlıkla bırakma riski); "Ayır"ı satır menüsüne koymak (istek sürükleme).
- **Ek (Faz 11.1, 2026-10-18):** Sürükleme "masaüstünde klasör taşımak" gibi: satırın tamamından tutulur (tutamaç klavye için kalır), imlece satırın havaya kaldırılmış kopyası yapışır (gölge, eğimsiz), eski yerinde kesik çizgili yuva kalır; kopyanın altında bırakınca ne olacağı yazar ("HTK-1 altına Sub-Task olarak taşı" / "Ayır" / "Buraya bırakılamaz"). Geçerli hedef satır mor vurgulanır, geçersiz satırlar (Epic, Bug, kendi alt ağacı) soluklaşır; geçersiz yere bırakınca kopya yerine süzülür. Kopya ve "Ayır" alanı `document.body`ye portal ile çizilir (bir üst kapsayıcı `fixed` konumu bozuyor, alan listenin ortasında kalıyordu); alan ekranın en altında ve bildirimlerin üstündedir.
- **Bilinen sınırlar:** Table görünümünde sürükleme yok; sürükleme sıralamayı değiştirmez (yalnızca üst-alt ilişkisi).

## ADR-117 — Bug ekranı: Bug sahibi, atama, Bug durumu ve bildirimler (Faz 11)

- **Tarih:** 2026-10-18 · **Durum:** Kabul (istek: Bug'lar listede görünmesin; Sprint panosundaki kırmızı **Bugs** düğmesiyle açılan ekranda olsun; Bug'ı açan kişi Bug sahibi olsun, ayrıntıları girsin; yönetici birine atasın; Atanmadı/Atandı/İşleniyor/Çözüldü durumları; her adım e-postayla bildirilsin — Jira mantığı).
- **Karar:** Bug'lar List/Table görünümünden ve satır içi hızlı oluşturmadan çıkarıldı. Sprint panosunun ve Kanban panosunun başlığında kırmızı **Bugs** düğmesi (açık Bug sayısıyla) `/spaces/:id/bugs` ekranını açar: durum sekmeleri (Tümü, Atanmadı, Atandı, İşleniyor, Çözüldü), tablo (Bug, önem, durum, Bug sahibi, atanan, açılış), büyük kırmızı **Bug aç** formu (sorun, önem, öncelik, tekrar adımları, beklenen/gerçek sonuç, ortam, dosyalar). "New → Bug" bu formu açar. Veri: `work_items.bugStatus` (`UNASSIGNED | ASSIGNED | IN_PROGRESS | RESOLVED`); Bug'ı açan `reporterId` = **Bug sahibi**. API: `GET/POST spaces/:id/bugs`, `PUT items/:id/bug-assignee`, `PUT items/:id/bug-status`. **Yetkiler:** yeni `bug.report` (tüm Proje rolleri, Stakeholder dahil) ve `bug.assign` (Product Owner, Scrum Master; Owner/Admin hep); Bug'ın atananı genel güncellemeden de yalnızca `bug.assign` ile değişir; durumu atayan, yazma yetkisi olan ya da Bug'a atanmış kişi değiştirir. **Eşitleme:** atanınca Atandı, atama kalkınca Atanmadı; İşleniyor/Çözüldü panodaki durumu ilgili kategoriye (ACTIVE/DONE) taşır; panoda durum değişince Bug durumu da eşitlenir. **Bildirimler** (uygulama içi + e-posta, kullanıcı tercihine tabi): `BUG_REPORTED` (atayacak kişilere), `ASSIGNED` (atanana), `BUG_STATUS` (Bug sahibi, atanan, izleyenler).
- **Alternatifler:** Bug için ayrı durum seti (Space durum akışı) — iki kaynak karışırdı; Bug'ları ayrı tabloda tutmak — sprint/board/rapor bütünlüğü bozulurdu.
- **Bilinen sınırlar:** Bir Bug'ın tek atananı vardır (Bug ekranında); Bug'lar sprint panosunda ve backlog'da yine görünür (sprint'e alınmış iş olarak).

## ADR-118 — "Space" adı arayüzde "Proje" (Faz 11)

- **Tarih:** 2026-10-18 · **Durum:** Kabul (istek: Space'in adı Proje olsun, ClickUp ile aynı olmasın; yalnızca ad değişsin; New menüsünden Space oluşturma çıksın).
- **Karar:** Arayüz metinlerinde "Space" → TR **Proje** (ekleriyle: Projede, Projeyi, Projeler…), EN **Project**. Kod, API, veritabanı ve izin anahtarları (`space.*`) değişmedi. Kılavuz metinleri de aynı adı kullanır. "New" menüsünde artık yalnızca Task, Epic ve Bug var; yeni Proje sol menüdeki **Proje oluştur** düğmesiyle açılır.

## ADR-119 — Ayarlar → Genel: "Test e-postası gönder" (Faz 11.2)

- **Tarih:** 2026-10-20 · **Durum:** Kabul (sunucuda e-posta gitmiyordu; nedeni görünmüyordu).
- **Karar:** `POST workspaces/:id/settings/mail-test` (`workspace.settings` izni): yöneticinin **kendi** adresine test e-postası yollar. Normal e-postalardan farkı: kuyruğu (pg-boss) **atlar** ve SMTP'ye doğrudan bağlanır; böylece hata, 5 kez yeniden deneyen kuyrukta günlüğe gömülmez, çağırana döner. Yanıt her zaman 200: `{ ok, to, server, code, detail }` (`server` = `host:port`; şifre hiçbir zaman dönmez). SMTP bağlantısı 10 sn, soket 15 sn zaman aşımlıdır (engelli port dakikalarca asılı kalmasın). `SMTP_USER` var ama `SMTP_PASS` boşsa sunucuya gitmeden `SMTP_PASS_EMPTY` döner. Arayüz hata koduna göre Türkçe/İngilizce ipucu gösterir (`SMTP_PASS_EMPTY`, `EAUTH` Gmail uygulama şifresi, `ETIMEDOUT/ECONNREFUSED` port engeli, `ENOTFOUND` ad çözümü, `EENVELOPE` gönderen adresi) ve sunucunun ham cevabını altına yazar.
- **Alternatifler:** Kuyruk hatalarını arayüzde listelemek (pg-boss iş tablosunu açmak gerekir); yalnızca günlüğü okumak (yönetici sunucuya girmek zorunda kalır).
- **Bilinen sınırlar:** yalnızca SMTP gönderimini sınar; alıcı tarafındaki spam filtresi görünmez. Test mesajı `MAIL_TRANSPORT=memory` iken bellekte kalır.

## ADR-120 — SMTP ayarı uygulamadan girilir (Faz 11.2)

- **Tarih:** 2026-10-20 · **Durum:** Kabul (istek: Gmail uygulama şifresi gibi bilgiler dosya düzenlemeden, Ayarlar'dan ve yalnızca admin tarafından girilsin).
- **Karar:** Ayarlar → Genel'deki "E-posta gönderimi" kutusunda sunucu, port, SSL/TLS, kullanıcı adı, şifre ve gönderen girilir. API: `GET/PUT/DELETE workspaces/:id/settings/mail` (`workspace.settings`, yani Owner/Admin). Veri sunucu başına tek satırlık `mail_settings` tablosundadır (`id = 1` kısıtlı); satır yoksa `.env` değerleri geçerlidir, `DELETE` ("Sunucu ayarına dön") satırı siler. Gönderim her seferinde ayarı okur (önbellek yok), böylece değişiklik anında geçerli olur; `MAIL_TRANSPORT=memory` (testler) her zaman önce gelir. **Şifre** `AES-256-GCM` ile şifreli saklanır (`v1:<iv>:<etiket>:<veri>`); anahtar veritabanında değil, `SETTINGS_SECRET` ortam değişkeninden ya da ilk kullanımda üretilip `UPLOAD_DIR/.secrets/settings.key` dosyasına (yalnız sahibi okur) yazılır. Böylece veritabanı dökümü tek başına şifreyi ele vermez. API şifreyi **hiçbir zaman** döndürmez (yalnız `passwordSet`); `PUT`'ta `password` verilmezse korunur, `""` verilirse silinir. Google adreslerinde uygulama şifresindeki boşluklar atılır. Etkinlik kaydına (`workspace.mail_updated/mail_reset`) şifre değeri değil yalnızca `set/cleared` yazılır. Anahtar kaybolursa şifre çözülemez ve arayüz `SMTP_PASS_UNREADABLE` ile şifreyi yeniden girmeyi ister. "Kaydet ve test et" önce kaydeder, sonra ADR-119'daki test e-postasını yollar.
- **Alternatifler:** Şifreyi düz metin saklamak (veritabanı yedeği sızarsa şifre de sızar); anahtarı veritabanında tutmak (şifrelemenin anlamı kalmaz); yalnızca `.env` (kullanıcının istediği "dosyayla uğraşma" olmaz).
- **Bilinen sınırlar:** Ayar workspace'e değil sunucuya aittir (tek workspace'li kurulum varsayımı); anahtar dosyası `uploads` volume'ündedir, dosya yedeğiyle birlikte taşınmalıdır (yalnız veritabanı yedeği yeni sunucuda şifreyi çözemez, şifre yeniden girilir); tek süreç; OAuth2/Gmail API yok, yalnızca SMTP.

## ADR-121 — New menüsünde Sprint ve "Hızlı tur" kılavuzu (Faz 11.3)

- **Tarih:** 2026-10-21 · **Durum:** Kabul (istek: New menüsünün en üstüne Sprint oluştur eklensin, Backlog sayfasındaki oluşturma neyse o açılsın; sunum için basit bir uygulama içi kılavuz).
- **Karar:** New menüsünün ilk seçeneği **Sprint**; yalnızca `sprint.plan` iznine sahip olunan **Scrum** Proje'si varsa görünür (Kanban Proje'de sprint yoktur). Backlog sayfasındaki `SprintDialog` aynen yeniden kullanılır (ad/tarih önerisi, doğrulama, aynı çeviriler); hedef Proje sırasıyla açık sayfadaki Proje, tek uygun Proje, yoksa önce Proje sorulur. Oluşturunca Backlog sayfasına gidilir. Sunum için **Hızlı tur** (TR/EN) önce Yardım kılavuzunun ilk bölümü olarak eklendi, sonra istek üzerine kılavuzdan çıkarılıp ayrı bir Word belgesine taşındı (`docs/presenter/sunum-kilavuzu.{tr,en}.json`; `GUIDE_JSON=… node scripts/docs/make-guide-docx.cjs tr <çıktı>` ile üretilir). İçeriği:: Seyir'in tek cümlelik anlatımı, 10 adımlık "ekranda göster / söyleyeceğin cümle" sunum akışı, hazırlık ipucu ve sık sorulan sorular; mevcut görselleri yeniden kullanır. Uygulama içi Yardım kılavuzu bu bölümü içermez.
- **Alternatifler:** Ayrı bir sunum sayfası/rotası (iki içerik kaynağı, eskime riski); Sprint'i yalnızca açık Proje'de göstermek (Proje dışındayken kullanılamaz).
- **Bilinen sınırlar:** Birden çok uygun Proje varken Proje dışındaki sayfalardan Sprint seçilirse bir ara soru çıkar; sunum akışı elle yazılmış metindir, arayüz değişirse güncellenmelidir.

## ADR-122 — Uygulama adresi (e-posta bağlantıları) uygulamadan girilir (Faz 11.3)

- **Tarih:** 2026-10-21 · **Durum:** Kabul (sorun: sunucuda davet e-postası geliyor, ama "Daveti kabul et" bağlantısı `http://localhost:8092/invite/…` adresini açtığı için "siteye ulaşılamıyor" hatası veriyor; sebep sunucudaki `.env` içinde `APP_URL=http://localhost:8092` kalması).
- **Karar:** Ayarlar → Genel'e **Uygulama adresi** bölümü eklendi (`GET/PUT workspaces/:id/settings/app-url`, `workspace.settings`). Sunucu başına tek satırlık `app_settings` tablosu (`id = 1`); satır yoksa `APP_URL` (.env) geçerlidir, `PUT { url: null }` ("Sunucu ayarına dön") satırı siler. Davet, şifre sıfırlama, bildirim, hatırlatıcı e-postaları, webhook yükündeki bağlantılar ve sprint JSON dışa aktarımı artık adresi her seferinde `AppSettingsService.publicUrl()` ile okur (önbellek yok, değişiklik hemen geçerli); sondaki `/` atılır. Adres yalnızca `http(s)://sunucu[:port][/yol]` biçiminde kabul edilir (`javascript:` vb. reddedilir). Arayüz, kayıtlı adres kullanıcının tarayıcıda açtığı adresten farklıysa (ör. localhost) uyarı gösterir ve tek tıkla tarayıcıdaki adresi önerir. Değişiklik etkinlik kaydına (`workspace.app_url_updated`, eski/yeni adres) yazılır.
- **Alternatifler:** İstek başlığından (`Origin`/`Host`) türetmek (kimlik doğrulamasız şifre sıfırlamada başlık enjeksiyonuyla kimlik avı bağlantısı üretilebilir; reddedildi); yalnızca `.env` (kullanıcının istediği "dosyayla uğraşma" olmaz).
- **Bilinen sınırlar:** Adres workspace'e değil sunucuya aittir; yanlış adres girilirse yönetici bağlantıları kendi bozar (uyarı bu yüzden var); eski e-postalardaki bağlantılar güncellenmez.

- **Ek (Faz 11.3, 2026-10-21):** Bug ekranına giriş artık Scrum sayfalarının üst sekmelerinde, **Raporlar**'ın yanında kırmızı **Bugs** sekmesidir (açık Bug sayısı rozetiyle; `ScrumTabs`). Sprint panosunun sağ üstündeki kırmızı düğme kaldırıldı; Kanban Proje'de sekme olmadığı için oradaki kırmızı düğme durur. Ayrıca onay kutuları (`input[type=checkbox]`) tarayıcının kendi çizimi yerine tek bir stille çizilir (açık kutu, işaretlenince marka moru + beyaz tik, kısmi seçimde çizgi); bazı ortamlarda tarayıcı çizimi koyu dolu kutu gibi görünüyordu.

## ADR-123 — Sürükleme performansı: bırakma hedefi imleç konumundan bulunur (Faz 11.4)

- **Tarih:** 2026-10-21 · **Durum:** Kabul (sorun: Task'lar sürüklenirken FPS çok düşüyor, kasma hissi; ayrıca Backlog'ta satırın her yerinden sürükleme isteği).
- **Ölçüm (Playwright + CDP, 120 Task):** Listede 40 fare hareketi boyunca liste 64, satırlar toplam 9.636 kez yeniden çizildi; Backlog'ta satırlar toplam 15.216 kez (her harekette ~126 satır). Neden: her satır dnd-kit'e ayrı bırakma alanı ya da sıralama öğesi olarak kayıtlıydı (`useDroppable`, `useSortable`); imleç her satıra girdiğinde bağlamı kullanan tüm satırlar yeniden çiziliyordu.
- **Karar:** Satırlar artık yalnızca sürüklenebilir (`useDraggable`); bırakma hedefi imleç konumundan (`document.elementsFromPoint` + `requestAnimationFrame`) bulunur. Hedef vurgusu, geçersiz satırların soluklaşması ve Backlog'taki yerleşme çizgisi React durumu yerine doğrudan DOM özniteliğiyle (`data-drop-state`, `data-drop-invalid`, `data-drop-after`, `data-drop-over`, `data-drop-top`) verilir; sürükleme niyeti (kopyadaki yazı, Ayır alanı) küçük bir dış depodan (`useSyncExternalStore`) okunur; liste satırı `memo`'ludur. Kopya ve Ayır alanındaki bulanıklık (backdrop-blur) kaldırıldı, gölgeler sadeleştirildi. Sonuç: liste 9.636 → 376 satır çizimi (başlangıç/bitiş dışında harekette yeniden çizim yok), Backlog 15.216 → 920. Backlog'ta da satır her yerinden tutulabilir; bırakılacak yer mor çizgiyle, alt öğe yapma sağa çekince satır vurgusuyla gösterilir. Tutamak ve satır menüsündeki "Sprint'ine taşı" klavye/ekran okuyucu yolu olarak kalır.
- **Alternatifler:** Satırları `React.memo` ile sarıp dnd-kit bağlamını olduğu gibi bırakmak (işlev girdileri her çizimde değiştiği için bayat kapanış riski); sanallaştırmayı 100'den daha düşük satıra çekmek (kaydırma maliyeti artar).
- **Bilinen sınırlar:** Sürükleme sırasında klavye ile taşıma (KeyboardSensor) kaldırıldı; satır menüsündeki taşıma seçenekleri kullanılır. Ölçümler geliştirme (dev) modunda alındı; üretim derlemesi React'in geliştirme ek yüklerini taşımadığı için daha hızlıdır. Kanban/Sprint panosu kartları bu değişikliğin dışındadır.

## ADR-124 — Task taşıma, Epic altında gruplama ve Epic'e dönüştürürken ad (Faz 12)

- **Tarih:** 2026-10-21 · **Durum:** Kabul (kaynak: toplantı notları; Faz 12 = notların 1–3. ve 8. maddeleri).
- **Karar:**
  - **Taşı…:** Task, Bug ve Epic detayının en altında **Taşı…** düğmesi (Sub-Task kendi başına taşınmaz, üstüyle gider). Pencerede **Proje** (varsayılan kendi Proje'n; yazma yetkin olanlar) ve **Sprint** seçilir (açık sprint'ler, "Backlog" ya da "değiştirme"). Başka Proje için mevcut `POST items/:id/move` (ADR-047) kullanılır, ardından sprint için `POST spaces/:id/backlog/move`. **Epic taşınınca altındaki Task'lar ve Sub-Task'ları birlikte gelir**; sprint seçimi Epic'in Task'ları için uygulanır. Kanban Proje'de sprint seçimi çıkmaz.
  - **Düzeltme (hata):** Space'ler arası taşıma sprint bağını silmiyordu: öğe başka Proje'nin sprint'ine bağlı kalıyordu. Artık taşınan alt ağaç sprint'inden çıkar (`sprint_item_events` içine `REMOVED` yazılır, burndown tutarlı kalır) ve hedefte Backlog'a düşer.
  - **Gruplama:** Backlog sayfasında seçim kutuları sprint satırlarında da var; farklı sprint'ler ve Backlog'tan birlikte seçilebilir. Çubukta **Epic altında grupla**: var olan bir Epic ya da yeni bir Epic (ad girilir). API `POST spaces/:id/items/group { itemIds, epicId }` (`work-item.write`): tüm öğeler önce doğrulanır (`planNest`: Sub-Task ve Epic uygun değil → 422), sonra tek işlemde taşınır; biri uygun değilse hiçbiri değişmez. Alt öğeleri olan Task alt öğeleriyle birlikte gelir (alt öğeler Task'a bağlı kalır), sprint üyelikleri değişmez. Çubukta ayrıca "Backlog'a al" seçeneği eklendi.
  - **Epic'e dönüştürme (ADR-109):** pencere artık onay kutusu değil bir formdur; Epic'in **adı değiştirilebilir** (`POST items/:id/convert-to-epic { title? }`; gövdesiz istek eskisi gibi çalışır). Sub-Task'lar yine Task olur ve Epic'in altında kalır.
- **Alternatifler:** Gruplamayı öğe öğe `nest` çağrılarıyla yapmak (kısmen uygulanmış bir grup bırakabilirdi); Epic taşırken çocuk Task'ları istemcide taşımak (kopuk durum riski); eski sprint bağını korumak (başka Proje'nin sprint'i, raporları bozar).
- **Bilinen sınırlar:** Taşınan öğe eski anahtarını (ör. `BRN-1`) korur, hedef Proje'nin sayacına yeniden numaralanmaz (ADR-047); toplu **Proje** değiştirme yalnızca tek öğede (Taşı…) vardır; aktif sprint'e/sprint'ten taşıma kapsam değişikliği olarak kaydedilir.

## ADR-125 — Scrum'da Görevler Backlog'a taşındı: sürükleyerek Sub-Task yapma/ayırma Backlog'da (Faz 13)

- **Tarih:** 2026-10-21 · **Durum:** Kabul (kaynak: toplantı notları "Görevler kısmı kalkacak", kullanıcı isteği).
- **Karar:**
  - **Kenar çubuğu:** Scrum Proje'sinde kök List'ler (ör. "Görevler") sol menüde listelenmez; görevler "Backlog ve sprint'ler" sayfasından yönetilir. Klasörler ve Kanban Proje'leri değişmez; List sayfası (`/lists/:id`) adresle ve Proje sayfasından açılabilir.
  - **Backlog'da Görevler listesindeki sürükleme (ADR-116/123) aynen:** satır tutulup başka bir **Task satırının ortasına** bırakılınca onay penceresinden sonra Sub-Task olur (eski "sağa 48 px çek" kuralı kalktı). Satırın üst/alt çeyreği ya da boş alan "araya bırak" demektir: sıra veya sprint değişir. Kopya (ghost) imlece yapışır ve altında niyeti yazar ("X altına taşı", "Sprint'e taşı", "Ayır"). Epic ve Bug alt öğe yapılmaz ve hedef olmaz; Bug sprint'ler arasında taşınabilir.
  - **Alt öğeler Backlog'da:** alt öğesi olan Task'ın solunda aç/kapat oku; açılınca Sub-Task'lar girintili listelenir. Sub-Task sürüklenince ekranın altında **Ayır** alanı çıkar (bırakınca onayla bağımsız Task olur); bir sprint'e ya da Backlog'a bırakılırsa ayrılır ve oraya yerleşir; başka bir Task'ın ortasına bırakılırsa o Task'a geçer.
  - Uygulama: `backlog-dnd.ts` (`resolveBacklogDrop` `nestOn`/`detach`, niyet deposu), `backlog-drag-parts.tsx` (kopya ve Ayır alanı), `backlog-subtasks.tsx`. API değişmedi (`items/:id/nest`, `items/:id/unnest`, `spaces/:id/backlog/move`).
- **Alternatifler:** Görevler sayfasını Backlog'a gömmek (iki farklı sıralama modeli, karmaşık); sağa çekme kuralını korumak (kullanıcı Görevler listesindeki davranışı istedi).
- **Bilinen sınırlar:** Satırın ortasına bırakmak sprint'e taşıma yerine alt öğe yapma anlamına gelir; boş alan, sprint başlığı ya da satır kenarı taşıma içindir (onay penceresi yanlış bırakmayı önler).

## ADR-126 — Toplu Sub-Task yapma/çıkarma ve anında yanıt veren seçim (Faz 14)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kaynak: kullanıcı isteği; toplantı notlarındaki 3 durum ADR-124 ile zaten karşılandı).
- **Karar:**
  - **Toplu işlem çubuğu (Backlog):** seçilen öğelerle ayrıca **Alt görev yap** (seçilen bir Task'ın Sub-Task'ı; Epic, Bug ve alt görevli Task atlanır, pencerede sayısı yazar) ve **Üst öğeden çıkar** (Sub-Task bağımsız Task olur, Epic altındaki Task Epic'ten ayrılır) düğmeleri eklendi. Sprint'e taşıma ve Epic altında gruplama ADR-124'teki gibi; yalnızca Sub-Task seçiliyken bu ikisi gizlenir (Sub-Task sprint'e girmez). Alt öğelerin de kutucuğu vardır; seçim sprint'ler ve alt öğeler arasında birlikte yapılabilir.
  - **Epic adı:** Epic'e dönüştürmede ad Task'ın adıyla gelir (ADR-124); gruplarken **yeni Epic adı** da seçilen ilk Task'ın adıyla dolu gelir, ikisi de değiştirilebilir.
  - **Kutucuk gecikmesi (düzeltme):** seçim React durumunda tutulduğundan her tıklamada sayfa ve tüm satırlar yeniden çizilip tıklama geç tepki veriyordu. Seçim artık küçük bir dış depodur (`selection.ts`, `useSyncExternalStore`); her kutucuk yalnızca kendi değerine abone olur, satırlar `memo` ile korunur (işlev özellikleri en güncel çağrılır). 60+ satırlı listede tıklama→işaret gecikmesi testle ölçülür (< 250 ms).
  - Alt öğe listesi, üst öğenin alt öğe sayısı değişince yeniden okunur (art arda yapılan toplu işlemde eski liste kalmasın).
  - API değişmedi: toplu işlemler istemcide `items/:id/nest` ve `items/:id/unnest` çağrılarını sırayla yapar.
- **Alternatifler:** Toplu işlemi tek bir API çağrısına almak (grup gibi atomik olurdu); şimdilik her öğe zaten kendi doğrulamasından geçtiği ve uygunsuzlar önceden atlandığı için ertelendi.
- **Bilinen sınırlar:** Toplu Sub-Task yapma atomik değildir: ağ ya da yetki hatasında işlenenler kalır, kalanlar yapılmaz (hata bildirilir). Aktif sprint'teki bir öğe Sub-Task yapılırsa sprint'ten çıkar (ADR-102).

### ADR-126 eki — Grupla ve Epic'e dönüştür ayrımı

- **Grupla** ("Epic altında grupla", kutucukla seçince çıkan çubuk): Task'lar olduğu gibi bir Epic'in altına girer; pencerede önizleme yazar ("N öğe taşınacak; Sub-Task'ları onlarla gelir, toplam M alt görev"). Yeni Epic adı seçilen ilk Task'ın adıyla dolu gelir.
- **Dönüştür** ("Epic'e dönüştür", tek Task'ın satır menüsü ve detay sayfası): Task'ın kendisi Epic olur; pencerede "X Epic olacak, N alt görevi Task olup altında kalacak" önizlemesi ve değiştirilebilir ad alanı (varsayılan Task adı) vardır.
- **Tek Task seçili ve alt görevi varsa** çubuktaki "Epic altında grupla" penceresi iki seçenek sunar (Epic altına al / Epic'e dönüştür); seçime göre aynı pencerede ilgili form gösterilir. Çoklu seçimde bu soru çıkmaz.

## ADR-127 — Toplu taşımada hızlı liste ve "Farklı sprint…" penceresi (Faz 14.1)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kullanıcı isteği).
- **Karar:**
  - Backlog'daki seçim çubuğunun "Sprint'e taşı…" listesi artık **en çok 3 sprint** gösterir: seçilenler tek bir sprint'teyse oradan bakınca 1 önceki + 2 sonraki (kaynak sprint listede yok); Backlog'taysa aktif sprint ve ondan sonraki ikisi. Her durumda "Backlog (sprint yok)" ve en altta **Farklı sprint…** vardır (`sprint-window.ts`, birim testli).
  - **Farklı sprint…** penceresi: önce **Proje** (varsayılan bu Proje; sprint planlayabildiğin Scrum Proje'leri seçilebilir), altında seçilen Proje'nin açık sprint'leri; ada göre arama ve **kaydırdıkça devam eden** liste (12'şer; yüzlerce sprint olsa da liste sınırlı yükseklikte kalır). Seçim yapılınca özet kutusu **hangi öğelerin hangi sprint'e (ve Proje'ye) taşınacağını** yazar; **Taşı** ile onaylanır, sonuç bildiriminde de aynı hedef görünür.
  - Aynı Proje'de taşıma mevcut yolu kullanır (aktif sprint için kapsam değişikliği onayı korunur); başka Proje'ye önce öğeler taşınır (`items/:id/move`), sonra sprint atanır (öğeler eski anahtarını korur, ADR-047).
  - Seçim çubuğu Backlog bölümünden çıkarıldı ve ekranın altında yüzer (ADR-126 sonrası): üstteki sprint'ten seçince de görünür.
- **Alternatifler:** Tüm sprint'leri listelemek (yüzlerce satırlık açılır liste kullanılamaz olur); sprint listesini sunucudan sayfalamak (şimdilik tüm sprint'ler zaten tek istekle geliyor, istemcide pencerelemek yeterli).
- **Bilinen sınırlar:** Tamamlanmış/iptal sprint'ler hedef olarak listelenmez (salt-okunur). Başka Proje'ye toplu taşıma öğe öğe yapılır, atomik değildir.

### ADR-126 eki 2 — Epic seçimi aranabilir; Epic sayfasında Task'ın Sub-Task'ları görünür

- Gruplama penceresinde Epic seçimi arama kutulu bir listedir (anahtar ve başlıkta arar; "+ Yeni Epic oluştur…" hep listededir).
- **Sub-Task'lar annesiyle birlikte gider** (veride `parentId` Task'ta kalır, ADR-124); ancak Epic'in "Alt öğeler" bölümü yalnızca doğrudan çocukları (Task'ları) gösterdiğinden Sub-Task'lar gitmemiş gibi görünüyordu. Epic sayfasında her Task'ın altında Sub-Task'ları girintili, açılıp kapanır (varsayılan açık) listelenir.

### ADR-126 eki 3 — Seçilen Sub-Task annesiyle taşınır/gruplanır

- Toplu taşıma ve Epic altında gruplamada seçilen bir **Sub-Task** atlanmaz: bağlı olduğu **Task** kullanılır (aynı Task'ın birden çok Sub-Task'ı seçilse de Task bir kez sayılır) ve Sub-Task onunla gider. Çubukta "Sub-Task bağlı olduğu Task ile gider: DMB-33 → DMB-15" yazar. Taşı/Grupla düğmeleri artık seçimde Sub-Task olsa da görünür; Alt görev yap / Üst öğeden çıkar seçilen öğelerin kendisiyle çalışır.

## ADR-128 — Dokümanlarda Word benzeri tablo araçları (Faz 15, Görev 1)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kullanıcı isteği; toplantı notu "Word gibi tablo ekleme").
- **Karar:** Doküman editöründe tek bir **Tablo** düğmesi; tıklayınca açılan panelde:
  - Tablo dışındayken: **ızgaradan boyut seçme** (8×10, fareyle "3 satır × 4 sütun" önizlemesi) ya da **sayı girerek** (en çok 50×50) ekleme; başlık satırıyla eklenir.
  - Tablo içindeyken: üste/alta **satır ekle**, sola/sağa **sütun ekle**, satır/sütun **sil**, **hücreleri birleştir** (Shift+tık ya da sürükleyerek seçilen hücreler), **hücreyi böl**, **başlık satırı/sütunu** aç/kapat, **hücre rengi** (açık tonlu palet + renksiz) ve **tabloyu sil**. Sütun kenarından sürükleyerek **genişlik** ayarlanır; seçili hücreler vurgulanır.
  - Panel düğmeleri editörden odak almaz; imleç tablodaki yerinde kalır. Durum (`useEditorState`) her işlemde güncellenir.
- **Güvenlik:** Hücre öznitelikleri sunucuda doğrulanır (`rich-text.ts`): `colspan/rowspan` 1–50, `colwidth` tam sayı dizisi, `backgroundColor` yalnızca `#rrggbb` (stil enjeksiyonu yok). Salt-okunur görünüm ve **Word'e aktarma** birleşik hücreleri (`gridSpan`/`rowSpan`) ve hücre rengini korur. Renkli hücrede metin her temada koyu yazılır.
- **Kapsam:** Görev açıklamaları (kompakt editör) tablosuz kalır; tablo yalnızca doküman sayfalarındadır (ADR-069).

## ADR-129 — Proje başına video arşivi (Faz 15, Görev 2)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kaynak: toplantı notu "Video arşivi"; kullanıcı: her projede ayrı, klasör + başlık).
- **Karar:**
  - Sol menüde Dokümanlar'ın altında **Video arşivi**. Solda klasör ağacı (Tüm videolar, Klasörsüz, iç içe klasörler; yeni/alt klasör, yeniden adlandır, sil), sağda arama ve video kartları (ilk kare küçük resim, süre, boyut, klasör, tarih, yükleyen). Kart tıklanınca oynatıcı penceresi: video, **başlık**, açıklama, klasör, indir, sil.
  - **Yükleme:** "Video yükle" ya da sayfaya sürükleyip bırakma; birden çok dosya. Başlık dosya adından gelir, değiştirilebilir. Dosya **8 MB'lık parçalarla** gönderilir (ters vekil gövde sınırına takılmaz), sunucuda bellekte tutulmadan diske eklenir; her parça sunucunun aldığı bayttan gönderilir, ağ hatasında yeniden denenir ve 409 ile bildirilen ofsetten **devam eder**. İlerleme bayt düzeyinde görünür, iptal edilebilir; yükleme sürerken sayfadan çıkmaya uyarı verilir.
  - **Doğrulama:** yalnızca tarayıcıda oynatılabilen biçimler (MP4/M4V, MOV, WebM); en çok `MAX_VIDEO_MB` (varsayılan 2048). Tamamlanınca boyut ve **içerik imzası** (`ftyp` / EBML) denetlenir; uymayan dosya silinir. Tamamlanmamış video listede "yükleme tamamlanmadı" görünür, oynatılamaz.
  - **Oynatma:** `GET videos/:id/stream` **HTTP Range** (206) destekler: ileri/geri sarma ve küçük resim için yalnızca gereken bayt okunur; içerik türü sabit, `nosniff`. Kart küçük resmi yalnızca ekranda görünür olunca yüklenir.
  - Yetki: görme `doc.view`, yükleme/düzenleme/silme `doc.write`. Klasör silinince alt klasörler silinir, videolar silinmez, Klasörsüz'e düşer.
- **Alternatifler:** Mevcut ek altyapısı (tek istekte, bellekte, 100 MB) — büyük videoda bellek ve vekil sınırı sorunu; harici video servisi — şirket içi kurulumda dış bağımlılık istenmedi.
- **Bilinen sınırlar:** Videolar Proje yedeğine (`backup.zip`) eklenmez (boyut); disk yedeği `UPLOAD_DIR` ile alınır. Yarım kalan yüklemeler otomatik temizlenmez (kayıt silinince dosya da silinir). Küçük resim sunucuda üretilmez (tarayıcı ilk kareyi gösterir).

## ADR-130 — Epic işlemlerinin ayrımı: Grupla (Sub-Task'ları götür seçeneği) ve Dönüştür (Faz 15, Görev 3)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kullanıcının 3 durumu; ADR-124 ve ADR-126 eklerini değiştirir).
- **Karar:**
  - **Grupla** ("Epic altında grupla", çubuk): seçilen Task'lar var olan ya da yeni Epic'in (adı ilk Task'ın adıyla dolu) altına girer. Seçilenlerde Sub-Task'lı Task varsa pencerede **"Sub-Task'ları da birlikte götür"** anahtarı çıkar:
    - **Açık:** hiyerarşi korunur (Epic → Task → Sub-Task).
    - **Kapalı (varsayılan):** Sub-Task'lar ayrılır, **bağımsız Task** olur, Epic dışında kalır; eski Task'ın açık sprint'indeyse o sprint'te durur (sprint üyelik geçmişine yazılır).
    - Önizleme kutusu seçime göre ne olacağını yazar. API: `items/group { withSubtasks }` (gövdede yoksa `true`, eski istemciler için).
  - **Dönüştür** ("Epic'e dönüştür"): ayrı işlemdir; tek Task seçilince çubukta düğme olarak (ve satır menüsü/detayda) çıkar. Ad varsayılan Task'ın adıdır, değiştirilebilir; önizleme "X Epic olacak, N alt görevi Task olup altında kalacak" der. Gruplama penceresindeki mod seçimi kaldırıldı.
- **Neden:** Gruplama ve dönüştürme aynı pencerede seçilince kullanıcı iki işlemi karıştırıyordu; Sub-Task'ların ne olacağı açıkça seçilmeli.

## ADR-131 — Backlog görünümü: renkli seçim çubuğu ve alt görev rozeti (Faz 15, Görev 4a)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kullanıcı: "göz ayırt edebilsin, kullanıcı dostu olsun").
- **Karar:** Kutucukla seçince çıkan çubuk marka renginde (mor degrade) yüzer; seçili sayısı beyaz rozetle, her işlem kendi renginde beyaz düğme: Sprint'e taşı (mor), Epic altında grupla (mor), Epic'e dönüştür (turuncu), Alt görev yap (mavi), Üst öğeden çıkar (kırmızı). Düğmelerin üzerine gelince ne yaptıkları yazar; **Esc** seçimi temizler (açık pencere yokken). Alt görev sayısı renkli hap rozettir (açıkken dolu renk). Kod: `selection-bar.tsx`.

## ADR-132 — İş yükü: Space → Proje → Sprint seçimi, hatırlanan seçim (Faz 15, Görev 4b)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kullanıcı: Space = workspace).
- **Karar:**
  - İş yükü artık workspace düzeyinde bir sayfa (`/workload`, sol menüde "İş yükü"); Proje menüsündeki "İş yükü" o Proje'yi seçip bu sayfayı açar.
  - Seçimler: **Space** (workspace; değiştirmek uygulamanın workspace'ini değiştirir) → **Proje** ("Tüm projeler" ya da bir Proje) → **Sprint** (yalnızca Scrum Proje'sinde). Space ve Proje seçimi **hatırlanır** (cihazda, workspace başına) ve kullanıcı değiştirene kadar kalır.
  - Proje seçilmezse kullanıcının raporlarını görebildiği **tüm Proje'ler** toplanır (gizli/izinsiz Proje'ler sayılmaz); sprint seçilmezse **Proje geneli**.
  - Sprint varsayılanı **en son sprint**: aktif varsa o, yoksa son tamamlanan, yoksa ilk planlanan. Sprint seçici aranabilir: açılınca **son 3 sprint**, yazınca tüm sprint'lerde ada göre arar; "Proje geneli" seçeneği hep vardır. Sprint seçimi Proje değişince varsayılana döner.
  - API: `GET workspaces/:wid/workload?spaceId=&sprintId=` (eski Proje ucu korunur; pano bileşeni kullanır).

## ADR-133 — Backlog'da tıklama güvenilirliği ve hız (Faz 15, Görev 5)

- **Tarih:** 2026-10-22 · **Durum:** Kabul (kullanıcı: "butona rahat tıklayalım, kasmasın").
- **Ölçüm (90 Task'lı Backlog, geliştirme modu):** satır içi düğmeye basıp fare 8 px kayınca tıklama **kayboluyordu** (sürükleme başlıyordu); toplu taşımadan sonra 11 istek ve ~300 ms takılma; açılışta ~600 ms uzun görev.
- **Karar:**
  - **Tıklama:** satır sürüklemesi düğme, kutucuk, form alanı ve menü öğelerinin üstünden başlamaz (`lib/drag-start.ts`); sürükleme tutamacı (`data-drag-handle`), boş alan ve başlık bağlantısı sürüklenebilir kalır. Backlog ve Görevler listesinde geçerli; kalıcı e2e testi var.
  - **Tazeleme:** Backlog işlemleri (taşı, grupla, alt görev yap/çıkar) sonrası workspace'teki tüm sorgular yeniden çekilmez; hepsi eskimiş işaretlenir, yalnızca ekrandaki Proje/List/sprint/öğe sorguları hemen çekilir (`refreshAfterBacklogChange`). İstek 11 → 7–9.
  - **Biçimleyiciler:** `Intl.DateTimeFormat`/`RelativeTimeFormat` dil ve seçenek başına önbelleğe alınır (listede her tarih için yeniden oluşturuluyordu).
  - **Satır menüsü** ilk tıklamada kurulur (yüzlerce satırda menü bileşeni baştan kurulmaz). Açılıştaki uzun görevler ~600 → ~490 ms (geliştirme modu; üretim derlemesi belirgin şekilde daha hızlıdır).
- **Not:** Rota bazlı kod bölme ve dil dosyalarının tembel yüklenmesi zaten vardı; ana paket ~104 KB (33 KB gzip).
