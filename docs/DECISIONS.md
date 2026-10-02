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
