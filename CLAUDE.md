# Scrum Manager — Claude Code Rehberi

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
pnpm test:e2e       # Playwright (api + web'i kendisi başlatır)
pnpm --filter @scrum/api db:migrate   # Prisma migration oluştur/uygula
```

API dokümanı: http://localhost:3000/api/docs · Mailpit: http://localhost:8025

## Yapı

- `packages/shared` — Zod şemaları, sabitler, izinler + varsayılan rol matrisi, saf Scrum kuralları. Node/DOM bağımsız. ESM+CJS (tsdown).
- `apps/api` — NestJS 11 (CJS). Modül: `controller → service → domain/` (domain saf, DB'siz unit test). Prisma 7 istemcisi `src/generated/prisma` (git'te yok, `db:generate`).
- `apps/web` — React 19 + Vite 8 SPA, TanStack Router (dosya tabanlı `src/routes`), TanStack Query, Tailwind 4 + shadcn/ui, i18next.

## Konvansiyonlar

- **Hatalar:** API `{ code, details? }` döner (`ApiExceptionFilter`). İş kuralı hatası: `new HttpException({ code: 'X' }, status)`; kod `packages/shared/src/errors/codes.ts`'e, metni `apps/web/src/locales/{tr,en}/common.json` → `errors.X`'e eklenir.
- **Yetki:** İzin anahtarları yalnızca `packages/shared/src/permissions`. Yeni izin → varsayılan rol matrisi + `roles.spec.ts` güncellenir.
- **Tenant:** Workspace'e ait her model `workspaceId` taşır (ADR-012).
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
- Docker Postgres host portu 5433 (5432 makinede dolu).
