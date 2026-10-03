# Faz 3 Planı — Docs ve Epic/Roadmap

> Kapsam: brief §14 Faz 3 (Doküman modülü, sürüm geçmişi, görev bağlama; Epic detay ve ilerleme; Retrospektif ve Sprint Review sayfaları). Branch: `feat/faz-3` (Faz 2 üzerinden).
> Kararlar: geliştirici varsayılanı; kullanıcı onayı bekleyenler `docs/DECISIONS.md` içinde işaretli.
> Sprint Review sayfası Faz 2.4'te yapıldı (ADR-065); bu fazda yalnızca Retrospektif eklenir.

| #   | Adım                        | İçerik                                                                                                                           | Durum      |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 3.1 | Epic detayı ve Epic listesi | Epic puan/adet özeti, Space "Epic'ler" sekmesi (hedef, ilerleme çubuğu, tahminsiz uyarısı)                                       | Tamamlandı |
| 3.2 | Doküman modülü çekirdeği    | Space içinde doküman sayfaları, sayfa ağacı (üst-alt), Tiptap editörü, otomatik kayıt, sürüm geçmişi ve geri yükleme, çöp kutusu | Tamamlandı |
| 3.3 | Doküman ↔ görev bağlama     | Dokümana görev/Epic bağlama, görevden dokümanlara bağlantı, yorum ve @mention, bildirim                                          | Tamamlandı |
| 3.4 | Retrospektif                | Sprint'e bağlı retrospektif sayfası (iyi gitti / gelişmeli / aksiyon), aksiyonları göreve çevirme                                | Tamamlandı |

## 3.1 Ayrıntı

Karar: ADR-068.

**API** (`/api/workspaces/:wid`): `GET spaces/:spaceId/epics` (Space'in Epic'leri: özet, hedef, `progress`, `stats`). `WorkItemDetail.epicStats` (yalnızca Epic). Hesap `packages/shared/src/domain/work-item-progress.ts` (`epicStats`, saf, birim testli).

**Web**: Scrum sekmelerine "Epic'ler" (`/spaces/:id/epics`): her Epic için renk noktası, anahtar, başlık, durum, hedef, ilerleme çubuğu, `%`, puan ve adet özeti, tahminsiz uyarısı. Epic detayında ilerleme satırının altında "Toplam" satırı.

**Doğrulama (2026-10-03):** shared `epicStats` 2 test; `epics.int-spec` 4 (detay özeti, Epic dışı null, liste ve silinen alt öğe, Space yalıtımı/404); Playwright `faz3-epics` 2/2.

## 3.2 Ayrıntı

Karar: ADR-069.

**API** (`/api/workspaces/:wid`): `GET|POST spaces/:spaceId/docs` (ağaç sırasıyla düz liste / oluştur), `GET spaces/:spaceId/docs/trash`, `GET|PATCH|DELETE docs/:docId`, `POST docs/:docId/move|restore`, `GET docs/:docId/versions[/:version]`, `POST docs/:docId/versions/:version/restore`. Veri: `docs`, `doc_versions` (rank sütunu `COLLATE "C"`). Saf kurallar `packages/shared/src/domain/docs.ts` (`isInSubtree`, `docDepth`, `checkDocMove`, `startsNewVersion`). Süresi dolan çöp `purgeExpired` içinde silinir.

**Web**: `/spaces/:id/docs?doc=` (`features/docs`): `DocTree`, `DocEditor` (`useDocSaver` kayıt kuyruğu, revision), `VersionsDialog`, `TrashDialog`, `MoveDocDialog`. `RichTextEditor` `variant="page"` (tablo, H1–H3, ayırıcı); `RichTextView` tabloyu çizer.

**Doğrulama (2026-10-03):** shared `docs` 9 test; `docs.int-spec` 17 (ağaç ve detay, doğrulama, kayıt ve revision, 409 çakışma, boş belge, tablo, sürüm birleştirme/geri yükleme, taşıma ve döngü, çöp kutusu ve süre dolumu, yetki, özel Space, arşivli Space); Playwright `faz3-docs` 4/4 (oluştur ve otomatik kaydet, tablo ve alt sayfa, sürüm önizleme, sil ve geri getir). Tüm paket: int 196, E2E 57 yeşil (yalnızca Mailpit isteyen `faz1-auth` bekliyor).

## 3.3 Ayrıntı

Karar: ADR-070.

**API** (`/api/workspaces/:wid`): `PUT|DELETE docs/:docId/links/:itemId`; `GET|POST docs/:docId/comments`, `PATCH|DELETE docs/:docId/comments/:commentId`, `PUT .../reactions`, `GET docs/:docId/mention-candidates`. `DocDetail.links` ve `WorkItemDetail.docs`. Veri: `doc_item_links`, `comments.docId` (CHECK). Bildirim: `NotificationsService.dispatch({ doc })`, `Notification.doc`.

**Web**: Sayfada "Bağlı görevler" (arama kutulu seçici) ve altında Yorumlar (`Comments scope="docs"`); görev detayında "Dokümanlar"; bildirim merkezi doküman etiketlenmesini sayfaya götürür.

**Doğrulama (2026-10-03):** `doc-collab.int-spec` 9 (iki yönlü bağlantı ve kaldırma, silinen öğe, görünmeyen Space sızıntısı, Stakeholder 403, yorum yaşam döngüsü ve tepki, yetkisiz düzenleme, mention bildirimi ve e-postası, düzenlemede çift bildirim yok, görünmeyen kişi etiketlenemez, arşivli Space); Playwright `faz3-doc-links` 2/2.

## 3.4 Ayrıntı

Karar: ADR-071.

**API** (`/api/workspaces/:wid`): `GET sprints/:sprintId/retro`, `POST sprints/:sprintId/retro/items`, `DELETE .../items/:retroItemId`, `PUT .../items/:retroItemId/vote`, `POST .../items/:retroItemId/task`. Veri: `retro_items`, `retro_votes`; görev oluşturma `WorkItemsService.create` (modül dışa aktarır).

**Web**: `/spaces/:id/retro/:sprintId` (üç sütun, ekleme, oy, sil, göreve çevir); Geçmiş satırı ve Review sayfasından bağlantı.

**Doğrulama (2026-10-03):** `retro.int-spec` 6 (sütunlar ve doğrulama, oy ve sıralama, göreve çevirme/tekrar/silinince yeniden, planlı sprint 409 ve tamamlanmışta düzenleme, yetki, özel Space); Playwright `faz3-retro` 2/2.
