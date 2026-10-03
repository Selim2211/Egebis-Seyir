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
