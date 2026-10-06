# Faz 7 Planı — ClickUp / Confluence Boşluk Analizi

> Kaynak: yöneticinin yol haritası (2026-10-06). Öncelik: 1) Project Management, 2) Document Management, 3) Team Management (en yalın), 4) Güvenlik/Yetki/Mesajlaşma.
> Karşılaştırma ölçütü: ClickUp (Free/Unlimited) ve Confluence/Jira işlevleri, geliştiricinin bilgisine göre. Canlı ürün incelemesi yapılmadı; toplantıda doğrulanacak.
> Durum anahtarı: ✅ var · 🟡 kısmen · ❌ yok.

## 1. Project Management (ClickUp karşılaştırması)

| ClickUp işlevi                                                      | Durum | Not                                                                                                   |
| ------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| Hiyerarşi Space > Folder > List > Task > Subtask                    | ✅    | Epic/Story/Task/Bug/Sub-task tipleri ile                                                              |
| List görünümü                                                       | ✅    | `list-view`, gruplama, sıralama, filtre                                                               |
| Table görünümü (sütun seç, satır içi düzenle)                       | ✅    | `table-view`                                                                                          |
| Board/Kanban (sürükle-bırak, WIP)                                   | ✅    | WIP limiti ADR-080                                                                                    |
| Calendar görünümü                                                   | ✅    |                                                                                                       |
| Gantt (bağımlılık okları, kritik yol)                               | 🟡    | Bağımlılık var; **kritik yol, sürükleyerek tarih değiştirme/bağımlılık çizme, baseline** doğrulanmalı |
| Timeline / Workload                                                 | ✅    | Workload, Roadmap var                                                                                 |
| Sprint (başlat/bitir, devir, burndown, velocity)                    | ✅    |                                                                                                       |
| Backlog, Sprint planlama, Retro, Review                             | ✅    |                                                                                                       |
| Kayıtlı görünümler + paylaşım                                       | ✅    |                                                                                                       |
| Çoklu atanan, izleyici, etiket, öncelik, tarih                      | ✅    |                                                                                                       |
| Bağımlılık (blocks / waiting on), ilişki                            | ✅    | `WorkItemLink`                                                                                        |
| Checklist, kabul kriteri                                            | ✅    |                                                                                                       |
| Özel alanlar, şablonlar, otomasyonlar                               | ✅    |                                                                                                       |
| Zaman takibi, timesheet                                             | ✅    |                                                                                                       |
| **Tekrarlayan görevler**                                            | ❌    | 7.1                                                                                                   |
| **Görev klonlama / duplicate**                                      | ❌    | 7.1 (doğrulanacak)                                                                                    |
| **Birden çok List'te görev (multi-home)**                           | ❌    | Mimari değişiklik; düşük öncelik                                                                      |
| **Görev tamamlanınca bağımlıyı otomatik kaydır (Gantt reschedule)** | ❌    | 7.2                                                                                                   |
| **Mind map / Whiteboard**                                           | ❌    | Kapsam dışı önerisi                                                                                   |
| **Dashboard widget'ları**                                           | ✅    | Kişisel/Space dashboard                                                                               |
| **Hatırlatıcı, kişisel To-do (My Work)**                            | 🟡    | My Work var; hatırlatıcı yok → 7.3                                                                    |
| **Sürükle-bırak toplu işlem, bulk edit**                            | ✅    | `bulk-bar`                                                                                            |
| **Form görünümü (dışarıdan görev toplama)**                         | ❌    | 7.4                                                                                                   |
| **Goals / hedefler (OKR)**                                          | ❌    | Düşük öncelik                                                                                         |

## 2. Document Management (Confluence karşılaştırması)

| Confluence işlevi                                | Durum | Not                                                                                                                                                         |
| ------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sayfa ağacı, sürüklemeyle taşıma                 | ✅    |                                                                                                                                                             |
| Zengin editör (tablo, başlık)                    | 🟡    | **Kod bloğu, görsel yapıştırma, görev listesi, bilgi/uyarı kutusu, slash menü** eksik → 7.5                                                                 |
| Sürüm geçmişi + geri yükleme                     | ✅    | **İki sürüm farkı (diff)** yok → 7.6                                                                                                                        |
| Sayfa yorumları, @mention                        | ✅    |                                                                                                                                                             |
| Sayfa ↔ görev bağlama                            | ✅    |                                                                                                                                                             |
| Çöp kutusu                                       | ✅    |                                                                                                                                                             |
| **Dokümanda arama**                              | ❌    | Global arama yalnızca iş öğelerini tarıyor (`work_items` FTS dizini). `docs.plainText` için FTS dizini + arama sonuçlarına doküman ekleme → 7.5 (öncelikli) |
| **Dosya/görsel eki (sayfaya)**                   | ❌    | `Attachment` yalnızca `workItemId` ile bağlı → `docId` eklenmeli                                                                                            |
| **Sayfa şablonları**                             | 🟡    | `TemplateKind.DOC` şemada var; arayüz doğrulanacak                                                                                                          |
| **Workspace düzeyi doküman (Space'siz wiki)**    | ❌    | Doküman şu an Space'e bağlı (`spaceId` zorunlu). Yöneticinin "doküman deposu" hedefi için workspace seviyesi gerekebilir → karar gerekli                    |
| **Doküman dışa aktarma (PDF/Markdown/Word)**     | ❌    | 7.6                                                                                                                                                         |
| **Etiket/kategori, favori, son görüntülenenler** | ❌    | Favori modeli var (`FavoriteType`), Doc eklenmeli                                                                                                           |
| **Sayfa paylaşım bağlantısı (salt okunur)**      | ❌    | Güvenlik fazı                                                                                                                                               |
| **Eşzamanlı çoklu düzenleme (canlı)**            | ❌    | Şimdilik revision çakışma denetimi (409); Yjs hazırlığı mevcut                                                                                              |
| **Doküman izinleri (sayfa bazlı)**               | ❌    | Güvenlik fazı                                                                                                                                               |
| **Büyük doküman/ek saklama tasarımı**            | 🟡    | Yerel disk volume; yedek var. Değerlendirme aşağıda                                                                                                         |

## 3. Team Management

Yönetici: "en basit hali". Mevcut: workspace rolleri, davet, yönetici doğrudan hesap açma, üye listesi. Yeterli; ek iş yok.
Küçük öneri: ekip/grup (örn. "Backend ekibi") kavramı yok. ClickUp'ta Teams (kullanıcı grubu) var; toplu atama/etiketleme için 7.7.

## 4. Güvenlik, Yetki, Mesajlaşma

Güvenlik/yetki büyük ölçüde hazır (RBAC, oturum, CSRF, API token, audit). **Mesajlaşma yok:** kanal/DM/sohbet. En son faz; yalnızca yorum ve bildirim var.

## Veri tabanı değerlendirmesi (doküman deposu)

| Konu              | Mevcut                                         | Risk / Öneri                                                                                                                       |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Doküman içeriği   | Tiptap JSON (`content`) + `plainText`          | İyi. JSON sürüm tablosunda tam kopya (`doc_versions`); binlerce sürümde büyür → eski sürümleri seyreltme/saklama süresi politikası |
| Arama             | `work_items` için `to_tsvector('turkish')` GIN | `docs` için dizin yok → 7.5'te `docs.title                                                                                         |     | plainText` GIN eklenecek |
| Ekler             | `attachments` yalnızca görev; dosya yerel disk | `docId` eklenecek; dosya adı/boyut/hash alanları kontrol edilecek                                                                  |
| Hiyerarşi         | `parentId` + rank                              | Derin ağaçta özyinelemeli sorgu (CTE) gerekebilir; şimdilik yeterli                                                                |
| Space bağımlılığı | `spaceId` zorunlu                              | Workspace seviyesi wiki için `spaceId` nullable yapma kararı (ADR) gerekli                                                         |
| Doküman meta      | Yok (etiket, durum: taslak/yayında)            | `status`, `labels`, `lastViewedAt` eklenebilir                                                                                     |
| Doğruluk kaynağı  | Sürümler `doc_versions`                        | Uygun; silinen sayfa `deletedAt` ile geri alınabilir                                                                               |

## Adımlar (öneri sırası)

| #   | Adım                               | İçerik                                                                                        | Durum        |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| 7.1 | Tekrarlayan görev + klonlama       | Tekrar kuralı (günlük/haftalık/aylık), tamamlanınca sonraki örneği üretme; görev kopyalama    | Bekliyor     |
| 7.2 | Gantt iyileştirme                  | Sürükleyerek tarih, bağımlılık çizme, kritik yol, bağımlıyı otomatik kaydırma                 | Bekliyor     |
| 7.3 | Hatırlatıcı                        | Göreve hatırlatma zamanı, bildirim/e-posta                                                    | Bekliyor     |
| 7.4 | Form görünümü                      | Kayıtlı form ile görev oluşturma                                                              | Bekliyor     |
| 7.5 | Doküman arama + ekler + editör     | Docs FTS ve global aramaya ekleme, sayfaya dosya/görsel, kod bloğu, görev listesi, slash menü | Bekliyor     |
| 7.6 | Doküman sürüm farkı + dışa aktarma | İki sürüm diff, PDF/Markdown                                                                  | Bekliyor     |
| 7.7 | Ekip (grup) kavramı                | Kullanıcı grupları, gruba atama                                                               | İsteğe bağlı |

## Açık kararlar (toplantıda)

1. Dokümanlar Space içinde mi kalsın, yoksa workspace seviyesi bağımsız bir wiki/depo mu olsun? (şema etkisi)
2. Mesajlaşma: kanal/DM mi, yalnızca görev/doküman yorumları mı?
3. Tekrarlayan görev, Form, Goals gibi ClickUp özelliklerinden hangileri gerçekten gerekli?
4. Mind map/Whiteboard kapsam dışı mı?
