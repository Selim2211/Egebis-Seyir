# Egebis Seyir — Claude Code Rehberi

Her oturumda önce şunları oku:

- `PROJECT_BRIEF.md`: NE yapıyoruz (tek doğruluk kaynağı). Kurallar §0, iş kuralları §6, fazlar §14, "bitti" tanımı §15.
- `docs/DECISIONS.md`: NASIL yapıyoruz (ADR'ler). Yeni önemli karar = yeni ADR, kullanıcı onayıyla.
- `docs/ARCHITECTURE.md`: Modül haritası, istek akışı, kesişen konular.

## Çalışma kuralları (brief §0 özeti)

- Varsayım yapma, sor. Büyük kararlar için 2-3 seçenek + öneri sun, onay bekle.
- Fazlara uy; faz bitmeden sonrakine geçme. Faz sonunda özet ver.
- Kapsam değişirse brief'i kullanıcı onayıyla güncelle (§17 değişiklik günlüğü).
- Terimler: brief §16 sözlüğü (Sprint, Epic, Story, Task, Sub-task, Bug…).
- Kullanıcıyla iletişim ve dokümanlar Türkçe; kod içi isimler İngilizce.

## Komutlar (kökten)

```
pnpm db:up          # Postgres (5433) + Mailpit (8025) — Docker Desktop açık olmalı
pnpm dev            # shared watch + api :3000 + web :5173
pnpm lint | typecheck | test | build
pnpm test:int       # API entegrasyon testleri (gerçek Postgres: scrum_test)
pnpm test:e2e       # Playwright: ayrı DB (scrum_e2e) ve portlarla (API 3100, web 5174) kendi sunucularını başlatır
pnpm --filter @scrum/api db:migrate   # Prisma migration oluştur/uygula
```

API dokümanı: http://localhost:3000/api/docs · Mailpit: http://localhost:8025

İlk kurulum: kullanıcı yokken web `/setup`'a yönlendirir; kurulum anahtarı yoktur (ADR-073).

Yerel geliştirme veritabanındaki test hesapları (yalnızca `scrum_dev`): `zeynep@example.com` / `dev-owner-pass` (Owner), `elif@example.com` / `dev-member-pass` (Member). Sıfırlamak için: `pnpm --filter @scrum/api exec prisma migrate reset`.

## Yapı

- `packages/shared` — Zod şemaları, sabitler, izinler + varsayılan rol matrisi, saf Scrum kuralları. Node/DOM bağımsız. ESM+CJS (tsdown).
- `apps/api` — NestJS 11 (CJS). Modül: `controller → service → domain/` (domain saf, DB'siz unit test). Prisma 7 istemcisi `src/generated/prisma` (git'te yok, `db:generate`).
- `apps/web` — React 19 + Vite 8 SPA, TanStack Router (dosya tabanlı `src/routes`), TanStack Query, Tailwind 4 + shadcn/ui, i18next.

## Konvansiyonlar

- **Hatalar:** API `{ code, details? }` döner (`ApiExceptionFilter`). İş kuralı hatası: `new HttpException({ code: 'X' }, status)`; kod `packages/shared/src/errors/codes.ts`'e, metni `apps/web/src/locales/{tr,en}/common.json` → `errors.X`'e eklenir.
- **Yetki:** İzin anahtarları yalnızca `packages/shared/src/permissions`. Yeni izin → varsayılan rol matrisi + `roles.spec.ts` güncellenir.
- **Tenant:** Workspace'e ait her model `workspaceId` taşır ve `apps/api/src/infra/prisma/tenant-scope.ts` → `TENANT_MODELS`'a eklenir (ADR-012). Özellik servisleri `TenantPrismaService.db` kullanır; ham `PrismaService` yalnızca auth/erişim/kurulum altyapısında.
- **Rotalar (API):** Workspace'e ait uçlar `/workspaces/:workspaceId/...` altında; guard'lar üyeliği ve `@RequirePermission(...)` iznini kontrol eder. Space kapsamlı uçlar `@RequireSpacePermission(...)` kullanır; Space rota parametresinden (`spaceId`/`folderId`/`listId`) çözülür, görünmeyen Space 404 (ADR-039). Yeni Space kapsamlı kaynakta `SpaceAccessService.resolveSpaceId` genişletilir. Oturumsuz uçlar `@Public()`, kaba kuvvete açık uçlar `@AuthRateLimit()`.
- **Rotalar (web):** Giriş gerektiren sayfalar `src/routes/_app/`, oturumsuz sayfalar `src/routes/_auth/`. Route dosyaları yalnızca `Route` dışa aktarır; paylaşılan bileşenler `src/components/` altında.
- **Sıralama ve yaşam döngüsü:** `rank` sütunları kesirli anahtar (shared `rankBetween` / `rankForPlacement`), migration'da `COLLATE "C"` (ADR-014). Arşiv `archivedAt`, çöp kutusu `deletedAt`; alt öğeler ebeveynle gizlenir (ADR-041).
- **İş öğeleri:** Okunabilir ID `keyPrefix-number` öğede kalıcıdır, sayaç `spaces.itemCounter` (ADR-033/044). Yeni iş öğesi alanı: shared şema + saf kural (tahmin, tip alanları, hiyerarşi) → servis. Tipe uymayan alan sessizce yok sayılmaz, reddedilir. Arşiv/silme alt ağaca aynı zaman damgasıyla uygulanır (ADR-046).
- **Zengin metin:** Açıklama Tiptap JSON; doğrulama ve düz metin çıkarımı yalnızca shared `domain/rich-text.ts` (izinli düğüm/işaret listesi, web editörü de aynı listeye uyar, ADR-048). Ham HTML hiçbir yerde saklanmaz veya basılmaz.
- **Görünümler:** List/Table süzme, sıralama ve gruplama saf fonksiyonlardır (`apps/web/src/features/work-items/view/view-state.ts`, birim testli); durum adreste (`ViewSearchSchema`). Yeni süzgeç = şema + fonksiyon + test (ADR-052).
- **Dosyalar:** Yükleme yalnızca `StorageService` (`UPLOAD_DIR`) üzerinden; anahtarlar sunucuda üretilir, istemci adı yola girmez. Doğrulama shared `domain/attachments.ts` (uzantı, boyut, içerik imzası); önizleme yalnızca resim/PDF, diğerleri indirme (ADR-056). Yeni dosya türü eklerken önce bu dosyadaki listeleri ve testleri güncelle.
- **Durum:** Kurallar durum adına değil kategoriye bakar (`NOT_STARTED/ACTIVE/DONE`, ADR-013).
- **Değişiklik kaydı:** Anlamlı her değişiklik aynı transaction içinde `activity_events`'e (ADR-015).
- **Görsel dil:** Tip/öncelik/durum ikon ve renkleri yalnızca `apps/web/src/components/work-item/work-item-visuals.tsx`; renk token'ları `apps/web/src/styles/globals.css`.
- **UI metni:** Asla sabit yazma; `t('...')` + iki dilde anahtar.
- **Testler:** Brief §6 kuralları unit testle korunur. API uçları entegrasyon testi, kritik akışlar Playwright.

## Ortam notları (Windows)

- TypeScript 6.0'da sabit (TS 7 typescript-eslint ile uyumsuz). NestJS 11'de (12 ESM, nestjs-zod henüz desteklemiyor). Prisma 7.10 (8 RC).
- SWC bu makinede yüklenemiyor (sandbox ACL); Vitest decorator metadata için Vite/Oxc kullanır (`apps/api/vitest.config.ts`). SWC'ye geri dönme.
- pnpm 12 build script izinleri: `pnpm-workspace.yaml` → `allowBuilds`.
- `shadcn add` sonrası importları kontrol et: CLI `@/lib/utils` yerine `"cn"` paketi import edebiliyor; düzelt ve `cn` paketini kaldır.
- Geliştirme DB: makinedeki yerel PostgreSQL 18 (5432), kullanıcı/şifre `scrum`/`scrum`, veritabanları `scrum_dev` ve `scrum_test`. **Veritabanı `LOCALE 'en-US'` ile (template0) oluşturulmalı**: C locale'de `turkish` metin arama ve ILIKE Türkçe harfleri (ö, ş, ğ…) tanımaz, arama boş döner. Docker imajı varsayılanı (en_US.utf8) doğrudur. `compose.dev.yml` Postgres host portu 5433'tür; Docker kullanılırsa `.env` portu buna göre değişir.
- **Üretim kurulumu:** kökteki `docker-compose.yml` + `docker/` (api/web Dockerfile, Caddyfile, backup.sh) + `.env.example`; kılavuz `docs/DEPLOY.md` (ADR-091). Yerelde Docker imajları kullanıcı izni olmadan indirilmez/çalıştırılmaz; geliştirme yerel PostgreSQL ile yapılır.

- E2E (`pnpm --filter @scrum/web test:e2e`): Docker yerine yerel Postgres için `E2E_DATABASE_URL=postgresql://scrum:scrum@localhost:5432/scrum_e2e` verilir (`scrum_e2e` de `LOCALE 'en-US'` ile oluşturulmalı). Mailpit yoksa yalnızca e-posta bekleyen `faz1-auth` senaryoları başarısız olur. Spec dosyaları aynı workspace'i paylaşır: her spec kendi Space adı/anahtarını kullanmalı.
- API açılışında OpenAPI üretilir: shared şemalarda `z.custom` kullanma (JSON Schema'ya çevrilemez, uygulama açılmaz); `openapi.int-spec.ts` bunu korur.
