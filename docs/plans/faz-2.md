# Faz 2 Planı — Scrum Çekirdeği

> Kapsam: brief §14 Faz 2 (Backlog, sprint, Board, DoD/DoR, raporlar, bildirimler). Branch: `feat/faz-2`.
> Kararlar: ADR-060 (kullanıcı onaylı), ADR-061, ADR-062 (geliştirici varsayılanı).
> Veritabanı: yerel PostgreSQL 18 (`LOCALE 'en-US'`), `pnpm db:migrate` ve `pnpm test:int` çalışır.

| #   | Adım                            | İçerik                                                                                                                                                    | Durum    |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 2.1 | Sprint modeli + Product Backlog | Sprint CRUD (planlı), sprint↔öğe atama ve geçmiş, `backlogRank`, Backlog sayfası (sürükle-sırala, Epic filtresi, tahminsiz vurgu, sprint'e taşı)          | Sırada   |
| 2.2 | Board                           | Durum sütunları, kart sürükle-bırak ile durum değişimi, swimlane (atanan/epic/öncelik), aktif sprint ve List kaynakları                                   | Bekliyor |
| 2.3 | Sprint yaşam döngüsü + Planning | Başlat/tamamla/iptal kuralları, Planning ekranı (Backlog ↔ Sprint, puan/kapasite), scope change uyarısı, devir akışı, geçmiş sprintler, Sprint Goal ayarı | Bekliyor |
| 2.4 | DoD/DoR + Sprint Review         | Space DoD/DoR maddeleri, Done'da DoD checklist, sprint'e alırken DoR işareti, Sprint Review özeti                                                         | Bekliyor |
| 2.5 | Bildirimler                     | Bildirim merkezi, atama/mention/durum/yorum/sprint olayları, anında e-posta, tür bazında tercih                                                           | Bekliyor |
| 2.6 | Burndown ve Velocity            | Günlük snapshot işi, Sprint Burndown, Velocity grafiği, rapor ekranı                                                                                      | Bekliyor |

Faz 2 [F2] etiketli işlerden brief'te sonraya bırakılanlar (Planning Poker, retrospektif, WIP limiti, CFD…) bu fazın adımlarında değildir; Faz 2 yol haritası maddeleri (brief §14) yukarıdaki altı adımla kapsanır.

## 2.1 Ayrıntı

Kararlar: ADR-061 (sprint modeli), ADR-062 (Backlog ve öncelik sırası).

**API** (`/api/workspaces/:wid`)

- `GET|POST spaces/:spaceId/sprints`, `GET|PATCH|DELETE sprints/:sprintId`: planlı sprint tam düzenlenir ve silinir; aktifte tarihler kilitli (brief §6.1.2); tamamlanan/iptal salt-okunur.
- `GET spaces/:spaceId/backlog`: sprint'e atanmamış açık Story/Bug/Task'lar öncelik sırasıyla, Epic'ler, etiketler, planlı/aktif sprint'ler. Sırası boş öğelere ilk okumada sıra verilir.
- `POST spaces/:spaceId/backlog/move` `{ itemIds, sprintId|null, afterId? }`: sprint'e taşı / Backlog'a geri al / sırala. Kapsayıcı değişirse `sprint.plan`, yalnızca sıra değişirse `backlog.rank` (PO). Her taşıma `sprint_item_events` ve aktivite yazar; aktif sprint'te scope change.

**Web**: kenar çubuğunda "Backlog ve sprint'ler" (Scrum açık Space'lerde), `/spaces/$spaceId/backlog`: sprint bölümleri, Backlog (sürükleyerek sırala, arama, Epic süzgeci, tahminsiz vurgusu, çoklu seçim → sprint'e taşı), sprint oluştur/düzenle/sil.

**Doğrulama (2026-10-03):** `test:int` 11 dosya / 123 test yeşil (`sprints.int-spec.ts` 18); web birim 45; Playwright `faz2-backlog` 4/4. Açık: sürükle-bırak ile sıralamanın tarayıcıda elle denenmesi (E2E yalnızca menü ve toplu seçimi kapsar); sprint'ler arası sürükleme 2.3'te.
