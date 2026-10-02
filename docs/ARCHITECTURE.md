# Mimari

> Kararların gerekçeleri: `docs/DECISIONS.md`. Ne yaptığımız: `PROJECT_BRIEF.md`.

## 1. Genel görünüm

```
Tarayıcı (React SPA)
   │  HTTPS, cookie oturumu, REST/JSON
   ▼
Caddy (reverse proxy, TLS, web statik)
   │
   ▼
API (NestJS, modüler monolit) ──► PostgreSQL (veri + FTS + pg-boss kuyruğu)
   │                          └──► Yerel disk (ekler, volume)
   └──► SMTP (e-posta)
```

Tek API instance'ı, tek veritabanı. Ek servis yok (Redis, arama motoru, nesne deposu gerekmiyor).

## 2. Monorepo

```
apps/
  api/        NestJS uygulaması
  web/        React + Vite SPA
packages/
  shared/     Zod şemaları, tipler, izin sabitleri, saf Scrum kuralları
docker/       geliştirme ve dağıtım compose dosyaları
docs/         DECISIONS.md, ARCHITECTURE.md
```

**Kural:** `packages/shared` hiçbir çalışma zamanı ortamına (Node/DOM) bağımlı değildir; hem API hem web kullanır.

## 3. Backend modülleri (`apps/api/src/modules/`)

| Modül           | Sorumluluk                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | Kayıt, giriş/çıkış, oturumlar, şifre sıfırlama                                                                                               |
| `users`         | Profil, kişisel tercihler                                                                                                                    |
| `workspaces`    | Workspace, üyelik, davet, workspace rolleri                                                                                                  |
| `access`        | İzinler, roller, policy fonksiyonları, guard                                                                                                 |
| `spaces`        | Space/Folder/List, favoriler, Space üyeleri + Scrum rolleri, ayarlar (tahmin ölçeği, sprint süresi, DoD/DoR, durumlar)                       |
| `work-items`    | Epic/Story/Task/Sub-task/Bug CRUD, hiyerarşi, okunabilir ID, bağımlılık, checklist, kabul kriteri, etiket, izleyici, toplu işlem, çöp kutusu |
| `backlog`       | Product Backlog sıralama (rank)                                                                                                              |
| `sprints`       | Yaşam döngüsü, planning, scope change, devir, review özeti                                                                                   |
| `comments`      | Yorum, tepki, mention                                                                                                                        |
| `attachments`   | Dosya yükleme/indirme (StorageService)                                                                                                       |
| `activity`      | Olay kaydı, aktivite akışları                                                                                                                |
| `notifications` | Uygulama içi + e-posta bildirimleri, tercihler                                                                                               |
| `search`        | Global arama                                                                                                                                 |
| `reports`       | Burndown, velocity                                                                                                                           |
| `docs`          | Doküman sayfaları, hiyerarşi, sürümler, iş öğesi bağlantıları                                                                                |

Altyapı (`apps/api/src/infra/`): `config`, `prisma`, `queue` (pg-boss), `mail`, `storage`, `cls` (istek bağlamı), `logger`.

### Modül iç yapısı

```
modules/sprints/
  sprints.module.ts
  sprints.controller.ts     HTTP: şema doğrulama, izin dekoratörü
  sprints.service.ts        Uygulama mantığı: transaction, repo, olay yayma
  domain/                   SAF iş kuralları (DB yok) → unit test
    sprint-rules.ts
    sprint-rules.spec.ts
```

**Bağımlılık yönü:** controller → service → domain. `domain/` hiçbir şeyi import etmez (shared hariç). Modüller birbirinin Prisma modellerine doğrudan yazmaz; diğer modülün servisini kullanır.

## 4. İstek akışı

```
HTTP isteği
 → requestId + pino log
 → AuthGuard        (cookie → session → user)
 → CLS              (userId, workspaceId isteğe bağlanır)
 → PermissionGuard  (@RequirePermission('sprint.start') → rol izin seti)
 → Zod doğrulama    (shared şeması)
 → Service          (prisma.$transaction)
     → domain kuralı (ör. "tek aktif sprint")
     → yazma (workspaceId kapsamı otomatik)
     → activity_events kaydı (aynı transaction)
 → commit → domain olayı yayınla (bildirim kuyruğu, F2 realtime)
 → yanıt (veya hata kodu: { code: 'SPRINT_ALREADY_ACTIVE' })
```

## 5. Kesişen konular

- **Yetki:** İzin anahtarları `packages/shared/src/permissions`. Varsayılan rol matrisi aynı yerde; DB'ye seed edilir. Web aynı anahtarlarla UI'ı ayarlar, ama asıl kontrol her zaman API'de.
- **Tenant izolasyonu:** Workspace'e ait her tabloda `workspaceId`; Prisma extension CLS'deki workspace ile sorguları kapsar.
- **Olay kaydı:** Her anlamlı değişiklik `activity_events`'e (alan, eski, yeni, aktör, zaman). Raporlar (burndown, scope change) buradan hesaplanır.
- **Hatalar:** API her zaman `{ code, details? }` döner; metin çevirisi web'de (`locales/{tr,en}/errors.json`).
- **Silme:** İş öğesi/doküman/liste soft delete (`deletedAt`) → çöp kutusu. Kalıcı silme yetkili ve loglu.
- **Sıralama:** `rank` string alanı (fractional indexing).
- **Zaman:** `timestamptz` UTC; sprint tarihleri `date`.

## 6. Frontend (`apps/web/src/`)

```
routes/             TanStack Router (dosya tabanlı)
features/<modül>/   api/ (query hook'ları) · components/ · hooks/
components/ui/      shadcn/ui bileşenleri
components/layout/  uygulama kabuğu: sidebar ağacı, topbar
lib/                api istemcisi, i18n, tema, yardımcılar
locales/{tr,en}/    çeviri dosyaları
styles/             tasarım token'ları (CSS değişkenleri)
```

- Sunucu verisi yalnızca TanStack Query ile; optimistic update sık işlemlerde (durum değiştirme, sürükle-bırak).
- Filtre/görünüm durumu URL arama parametrelerinde (paylaşılabilir link).
- Tip ikonu, öncelik rengi, durum rozeti tek bileşenden (tutarlı görsel dil, brief §11).
