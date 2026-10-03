# Faz 3 Planı — Docs ve Epic/Roadmap

> Kapsam: brief §14 Faz 3 (Doküman modülü, sürüm geçmişi, görev bağlama; Epic detay ve ilerleme; Retrospektif ve Sprint Review sayfaları). Branch: `feat/faz-3` (Faz 2 üzerinden).
> Kararlar: geliştirici varsayılanı; kullanıcı onayı bekleyenler `docs/DECISIONS.md` içinde işaretli.
> Sprint Review sayfası Faz 2.4'te yapıldı (ADR-065); bu fazda yalnızca Retrospektif eklenir.

| #   | Adım                        | İçerik                                                                                                                           | Durum      |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 3.1 | Epic detayı ve Epic listesi | Epic puan/adet özeti, Space "Epic'ler" sekmesi (hedef, ilerleme çubuğu, tahminsiz uyarısı)                                       | Tamamlandı |
| 3.2 | Doküman modülü çekirdeği    | Space içinde doküman sayfaları, sayfa ağacı (üst-alt), Tiptap editörü, otomatik kayıt, sürüm geçmişi ve geri yükleme, çöp kutusu | Sırada     |
| 3.3 | Doküman ↔ görev bağlama     | Dokümana görev/Epic bağlama, görevden dokümanlara bağlantı, yorum ve @mention, bildirim                                          | Bekliyor   |
| 3.4 | Retrospektif                | Sprint'e bağlı retrospektif sayfası (iyi gitti / gelişmeli / aksiyon), aksiyonları göreve çevirme                                | Bekliyor   |

## 3.1 Ayrıntı

Karar: ADR-068.

**API** (`/api/workspaces/:wid`): `GET spaces/:spaceId/epics` (Space'in Epic'leri: özet, hedef, `progress`, `stats`). `WorkItemDetail.epicStats` (yalnızca Epic). Hesap `packages/shared/src/domain/work-item-progress.ts` (`epicStats`, saf, birim testli).

**Web**: Scrum sekmelerine "Epic'ler" (`/spaces/:id/epics`): her Epic için renk noktası, anahtar, başlık, durum, hedef, ilerleme çubuğu, `%`, puan ve adet özeti, tahminsiz uyarısı. Epic detayında ilerleme satırının altında "Toplam" satırı.

**Doğrulama (2026-10-03):** shared `epicStats` 2 test; `epics.int-spec` 4 (detay özeti, Epic dışı null, liste ve silinen alt öğe, Space yalıtımı/404); Playwright `faz3-epics` 2/2.
