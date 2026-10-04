# Faz 5 Planı — Esneklik ve Otomasyon

> Kapsam: brief §14 Faz 5 (özel alanlar, özel durum akışları, şablonlar, otomasyonlar, WIP limiti, kayıtlı görünümler, içe/dışa aktarma). Branch: `feat/faz-5` (Faz 4 üzerinden).
> Kullanıcı kararı (2026-10-04): şimdilik ClickUp/Jira içe aktarma yok; yalnızca CSV içe/dışa aktarma. Diğer varsayılanlar (geliştirici): özel durum akışı **Space** bazında; ilk otomasyon sürümü dört eylemin hepsi (kişi ata, bildirim gönder, alan güncelle, alt görev oluştur).

| #   | Adım                 | İçerik                                                                                                                    | Durum      |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 5.1 | Kayıtlı görünümler   | List görünümlerini (filtre, sıralama, gruplama, görünüm türü) adlandırıp kaydetme; kişisel ve paylaşımlı                  | Tamamlandı |
| 5.2 | WIP limiti           | Board'da sütun (durum) başına en çok iş sayısı; aşılınca uyarı (engel değil)                                              | Tamamlandı |
| 5.3 | Özel durum akışları  | Space'te durum ekle/sil/sırala/yeniden adlandır, kategori ata; raporlar için durum geçmişi eşlemesi                       | Tamamlandı |
| 5.4 | Özel alanlar         | Space düzeyinde alan tanımı (metin, sayı, tarih, liste, çoklu seçim, kişi, URL, onay kutusu), değer girişi, tabloda sütun | Sırada     |
| 5.5 | Şablonlar            | Görev, List, sprint ve Space şablonları; doküman şablonları                                                               | Bekliyor   |
| 5.6 | Otomasyonlar         | Tetikleyici (durum değişti…), koşul, eylem (kişi ata, bildirim, alan güncelle, alt görev); döngü koruması                 | Bekliyor   |
| 5.7 | CSV içe/dışa aktarma | List öğelerini CSV'ye aktarma ve CSV'den içe alma (eşleme, önizleme, hata raporu); `externalSource/externalId`            | Bekliyor   |

## 5.1 Ayrıntı

Karar: ADR-079.

**API** (`/api/workspaces/:wid/lists/:listId/views`): `GET`, `POST`, `PATCH :viewId`, `DELETE :viewId` (kişisel görünüm için `space.view`; paylaşım `workItem.write`). Veri: `saved_views` (liste + sahip + ad benzersiz).

**Web**: List başlığında "Görünümler" menüsü (`saved-views-menu.tsx`); ayar dönüşümü `saved-view-config.ts` (saf, birim testli). Arama kutusu dış değişikliklere uyar (hata düzeltmesi).

**Doğrulama (2026-10-04):** `saved-views.int-spec` 7 (yaşam döngüsü, doğrulama, ad çakışması, kişisel/paylaşımlı görünürlük, paylaşım yetkisi, sahipsiz paylaşımlı, özel Space); web `saved-view-config` 3; Playwright `faz5-views` 2/2 ve mevcut `faz1-views` 6/6.
