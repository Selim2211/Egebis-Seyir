# Faz 2 Planı — Scrum Çekirdeği

> Kapsam: brief §14 Faz 2 (Backlog, sprint, Board, DoD/DoR, raporlar, bildirimler). Branch: `feat/faz-2`.
> Kararlar: ADR-060 (kullanıcı onaylı), ADR-061, ADR-062 (geliştirici varsayılanı).
> Veritabanı: yerel PostgreSQL 18 (`LOCALE 'en-US'`), `pnpm db:migrate` ve `pnpm test:int` çalışır.

| #   | Adım                            | İçerik                                                                                                                                                    | Durum      |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 2.1 | Sprint modeli + Product Backlog | Sprint CRUD (planlı), sprint↔öğe atama ve geçmiş, `backlogRank`, Backlog sayfası (sürükle-sırala, Epic filtresi, tahminsiz vurgu, sprint'e taşı)          | Tamamlandı |
| 2.2 | Board                           | Durum sütunları, kart sürükle-bırak ile durum değişimi, swimlane (atanan/epic/öncelik), aktif sprint ve List kaynakları                                   | Tamamlandı |
| 2.3 | Sprint yaşam döngüsü + Planning | Başlat/tamamla/iptal kuralları, Planning ekranı (Backlog ↔ Sprint, puan/kapasite), scope change uyarısı, devir akışı, geçmiş sprintler, Sprint Goal ayarı | Tamamlandı |
| 2.4 | DoD/DoR + Sprint Review         | Space DoD/DoR maddeleri, Done'da DoD checklist, sprint'e alırken DoR işareti, Sprint Review özeti                                                         | Tamamlandı |
| 2.5 | Bildirimler                     | Bildirim merkezi, atama/mention/durum/yorum/sprint olayları, anında e-posta, tür bazında tercih                                                           | Tamamlandı |
| 2.6 | Burndown ve Velocity            | Günlük snapshot işi, Sprint Burndown, Velocity grafiği, rapor ekranı                                                                                      | Tamamlandı |

Faz 2 [F2] etiketli işlerden brief'te sonraya bırakılanlar (Planning Poker, retrospektif, WIP limiti, CFD…) bu fazın adımlarında değildir; Faz 2 yol haritası maddeleri (brief §14) yukarıdaki altı adımla kapsanır.

## 2.1 Ayrıntı

Kararlar: ADR-061 (sprint modeli), ADR-062 (Backlog ve öncelik sırası).

**API** (`/api/workspaces/:wid`)

- `GET|POST spaces/:spaceId/sprints`, `GET|PATCH|DELETE sprints/:sprintId`: planlı sprint tam düzenlenir ve silinir; aktifte tarihler kilitli (brief §6.1.2); tamamlanan/iptal salt-okunur.
- `GET spaces/:spaceId/backlog`: sprint'e atanmamış açık Story/Bug/Task'lar öncelik sırasıyla, Epic'ler, etiketler, planlı/aktif sprint'ler. Sırası boş öğelere ilk okumada sıra verilir.
- `POST spaces/:spaceId/backlog/move` `{ itemIds, sprintId|null, afterId? }`: sprint'e taşı / Backlog'a geri al / sırala. Kapsayıcı değişirse `sprint.plan`, yalnızca sıra değişirse `backlog.rank` (PO). Her taşıma `sprint_item_events` ve aktivite yazar; aktif sprint'te scope change.

**Web**: kenar çubuğunda "Backlog ve sprint'ler" (Scrum açık Space'lerde), `/spaces/$spaceId/backlog`: sprint bölümleri, Backlog (sürükleyerek sırala, arama, Epic süzgeci, tahminsiz vurgusu, çoklu seçim → sprint'e taşı), sprint oluştur/düzenle/sil.

**Doğrulama (2026-10-03):** `test:int` 11 dosya / 123 test yeşil (`sprints.int-spec.ts` 18); web birim 45; Playwright `faz2-backlog` 4/4. Açık: sürükle-bırak ile sıralamanın tarayıcıda elle denenmesi (E2E yalnızca menü ve toplu seçimi kapsar); sprint'ler arası sürükleme 2.3'te.

## 2.2 Ayrıntı

Karar: ADR-063.

**API**: `GET sprints/:sprintId?tree=true` sprint öğelerini ve tüm alt öğelerini üstlerinin arkasında döner (Board). Durum değişikliği mevcut `PATCH items/:id` ile yapılır.

**Web**: `features/board/*` (saf `board-model`: sütun × satır dağılımı, Epic bulma, toplamlar; `board-view`: dnd-kit ile sürükle-bırak; `board-card`; sprint panosu sayfası ve List Board'u). Rotalar: `/spaces/$spaceId/board` (adres: `sprint`, `lane`, `item`), List sayfasında `view=board&lane=`. Kenar çubuğunda ve Space sayfasında "Sprint panosu" bağlantısı.

**Doğrulama (2026-10-03):** test:int 11 dosya / 124 test; web birim 53; Playwright `faz2-board` 4/4 (menüyle ve gerçek fare sürüklemesiyle durum değişimi, yenileyince kalıcılık, satırlar, yan panel, List Board'u); tüm paket 33 senaryo yeşil, yalnızca Mailpit gerektiren `faz1-auth` bekliyor. Dokunmatik cihazda sürükleme elle denenmedi (menü yolu var).

## 2.3 Ayrıntı

Karar: ADR-064 (ve kullanıcı kararı ADR-060).

**API** (`/api/workspaces/:wid`): `POST sprints/:id/start | complete | cancel`. `complete` gövdesi `{ unfinished: 'BACKLOG' | 'NEXT_SPRINT', nextSprintId? }`. Yeni hata kodları: `SPRINT_ACTIVE_EXISTS`, `SPRINT_GOAL_REQUIRED`, `SPRINT_NOT_ACTIVE`, `SPRINT_CANCEL_NOT_ALLOWED`, `SPRINT_NEXT_INVALID`. Veri: `spaces.sprintGoalRequired`, `sprints.completedPoints`, `SprintItemReason.UNFINISHED`.

**Web**: `SprintActions` (başlat/tamamla/iptal pencereleri; Backlog, Planlama ve Sprint panosunda), Planlama sayfası (`/spaces/$spaceId/planning`, iki bölme + kapasite göstergesi), Geçmiş sayfası (`/spaces/$spaceId/sprints`), `ScrumTabs`, Space ayarlarında "Sprint hedefi zorunlu" anahtarı, kapanan sprint için salt-okunur pano, kapsam değişikliği onayı.

**Doğrulama (2026-10-03):** test:int 12 dosya / 137 test (`sprint-lifecycle` 13); shared 134, web birim 59; Playwright `faz2-lifecycle` 7/7 (başlat → kapsam değişikliği → tamamla/devret → geçmiş → planlamada gerçek fare sürüklemesi → iptal → hedef zorunluluğu ve ayarı); tüm paket 39 yeşil, yalnızca Mailpit gerektiren `faz1-auth` bekliyor. Not: bu çalışma sırasında Space formunda ayar anahtarının eklenmediği (sessiz kalmış bir metin değişimi) lint ile yakalandı ve düzeltildi.

## 2.4 Ayrıntı

Karar: ADR-065 (DoD zorunluluğu için ADR-060).

**API** (`/api/workspaces/:wid`): `PUT items/:id/dor | dod` `{ checked: string[] }`; `GET sprints/:id/review`; `PUT sprints/:id/review-notes`. Space alanları `dodItems`, `dorItems`, `dodEnforced` (PATCH `spaces/:id`). Öğe detayında `readiness`, satırlarda `dor`, sprint özetinde `notReadyCount`. Yeni hata kodları `DOD_INCOMPLETE`, `DOD_ENFORCED`, `READINESS_NOT_APPLICABLE`. Veri: `spaces.dodItems/dorItems/dodEnforced`, `work_items.dodChecked/dorChecked`, `sprints.reviewNotes`.

**Web**: Space ayarlarında DoR/DoD madde düzenleyici ve zorunluluk anahtarı; öğe detayında DoR/DoD bölümü (işaretler anında yansır); Done geçişinde DoD onay penceresi; Backlog satırlarında DoR rozeti; sprint başlatma uyarısı; Review sayfası (`/spaces/$spaceId/review/$sprintId`, Geçmiş ve Pano'dan bağlantı).

**Düzeltilen hatalar (bu adımda bulundu):** (1) `backlog/move` sırası boş öğeleri okuduktan sonra sıralıyordu; ilk taşımada öncelik sırası boş yazılıp bozuluyordu, okumadan önce sıralanıyor. (2) Sprint tamamlama/iptal bildirimi, sprint listeden düştüğü için bileşen kaldırılınca hiç gösterilmiyordu (`mutateAsync` ile düzeltildi).

**Doğrulama (2026-10-03):** test:int 13 dosya / 151 test (`readiness-review` 15); shared 138; Playwright `faz2-readiness` 5/5; tüm paket 45 senaryo yeşil, yalnızca Mailpit gerektiren `faz1-auth` bekliyor.

## 2.5 Ayrıntı

Karar: ADR-066 (e-posta modu için ADR-060).

**API** (`/api/workspaces/:wid/notifications`): `GET ?unread=true&before=ISO`, `GET unread-count`, `POST :id/read`, `POST read-all`, `GET|PUT preferences`. Üretim `NotificationsService.dispatch` ile; çağıranlar: iş öğesi oluşturma/güncelleme (atama, durum), yorum oluşturma/düzenleme (etiket, yorum), sprint başlat/tamamla. Veri: `notifications`, `notification_preferences`, e-posta şablonu `notification-mail.ts` (TR/EN, alıcının diliyle).

**Web**: `/notifications` (Tümü/Okunmamış, tıklayınca okundu + hedefe git, tümünü okundu yap, daha eski), kenar çubuğunda rozetli "Bildirimler", üst çubukta zil, Ayarlar › Bildirimler (tür × kanal anahtarları).

**Doğrulama (2026-10-03):** test:int 14 dosya / 167 test (`notifications` 16: kime/ne zaman, kendine bildirim yok, çift bildirim yok, düzenlemede yalnızca yeni etiket, görünürlük, kutu, sayfalama, tercih kanalları, e-posta); shared 143, web birim 61; Playwright `faz2-notifications` 3/3 (bildirim satırları test için veritabanına eklenir, çünkü ikinci kullanıcı davet e-postası ister); tüm paket 48 senaryo yeşil, yalnızca Mailpit gerektiren `faz1-auth` bekliyor. Gerçek iki kullanıcılı tarayıcı akışı (biri atar, diğeri rozeti görür) Mailpit gelince eklenecek.

## 2.6 Ayrıntı

Karar: ADR-067.

**API** (`/api/workspaces/:wid`): `GET sprints/:sprintId/burndown`, `GET spaces/:spaceId/velocity` (`report.view`). Veri: `sprint_snapshots`, `sprints.committed_points`. Günlük iş `sprint.snapshot` (23:55 İstanbul, pg-boss); sprint başlarken ve tamamlanırken de görüntü yazılır. Hesaplar `packages/shared/src/domain/reports.ts` (saf, birim testli).

**Web**: Space'te "Raporlar" sekmesi (`/spaces/:id/reports`): sprint seçicili Burndown (kartlar, kalan/ideal çizgi, kapsam değişikliği işaretleri), Velocity grafiği ve tablo (Recharts).

**Doğrulama (2026-10-03):** shared birim testleri (`reports` 10); `sprint-reports.int-spec` 8 (boş planlı sprint, başlangıç görüntüsü, canlı bugün noktası, scope change ekleme/geri alma, gece işi tek satır, tamamlamada dondurulan velocity ve kalan iş, 404); Playwright `faz2-reports` 3/3 (boş durum, aktif sprint kalan puan, tamamlanınca velocity tablosu). Ekran görüntüsünden yakalanan hata düzeltildi: tamamlama anındaki görüntü, bitmeyenler devredilmeden önce alınır.
