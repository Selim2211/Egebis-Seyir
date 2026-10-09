# ClickUp Fonksiyon Checklist'i — Egebis Seyir Karşılaştırması

> Amaç: ClickUp'ta işimize yarayan her fonksiyon için iki soru: **(1) Seyir'de var mı? (2) Varsa ClickUp'taki gibi gerçekten çalışıyor mu?**
> "Çalışıyor mu" sütunu iddia değil, kanıta dayanır: **E2E** = Playwright uçtan uca testi (tarayıcıda gerçek tıklama), **Int** = API entegrasyon testi (gerçek veritabanı), **Elle** = tarayıcıda elle denendi. Kanıtı olmayan satır "Doğrulanmadı" yazar.
> Durum: ✅ var · 🟡 kısmen · ❌ yok · **F8** = bu fazda yapılıyor · **F9** = sonraki faz önerisi.
> Son güncelleme: 2026-10-09.

## 1. Hiyerarşi ve yapı

| ClickUp fonksiyonu                                 | Seyir'de | ClickUp gibi çalışıyor mu              | Not                                            |
| -------------------------------------------------- | -------- | -------------------------------------- | ---------------------------------------------- |
| Workspace > Space > Folder > List > Task > Subtask | ✅       | Evet — E2E `faz1-spaces`, `faz1-items` | Ek olarak Epic/Story/Task/Bug/Sub-task tipleri |
| Space/Folder/List oluştur, yeniden adlandır, taşı  | ✅       | Evet — E2E `faz1-spaces`               | Sol ağaçta sürükle-bırak                       |
| Favoriler                                          | ✅       | Evet — E2E `faz1-spaces`               |                                                |
| Arşiv ve çöp kutusu (geri al)                      | ✅       | Evet — E2E `faz1-items`, `faz1-spaces` |                                                |
| Görevin birden çok List'te olması (multi-home)     | ❌       | —                                      | F9 (mimari değişiklik)                         |
| Space/Sprint yedek alma ve geri yükleme (zip)      | ❌       | —                                      | **F8 (8.5)** — yönetici isteği                 |

## 2. Görevler

| ClickUp fonksiyonu                                         | Seyir'de | ClickUp gibi çalışıyor mu                                                                | Not                                                    |
| ---------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Görev oluştur (hızlı ekleme), düzenle, sil                 | ✅       | Evet — E2E `faz1-items`                                                                  |                                                        |
| Alt görev (subtask)                                        | ✅       | Evet — E2E `faz1-items`                                                                  |                                                        |
| Sürükleyerek alt görev yapma (görevi görevin üstüne bırak) | ❌       | —                                                                                        | **F8 (8.2)** — hiyerarşi korunur                       |
| Çoklu atanan, izleyici                                     | ✅       | Evet — E2E `faz7-teams` (çoklu atama), `faz1-detail` (izleyici)                          | Ekibi tek tıkla atama — E2E `faz7-teams`               |
| Öncelik, durum, etiket, başlangıç/bitiş tarihi             | ✅       | Evet — E2E `faz1-items`, `faz1-detail`                                                   |                                                        |
| Özel durumlar (iş akışı) Space bazında                     | ✅       | Evet — E2E `faz5-statuses`                                                               |                                                        |
| Özel alanlar                                               | ✅       | Evet — E2E `faz5-fields`                                                                 |                                                        |
| Checklist, kabul kriteri                                   | ✅       | Evet — E2E `faz5-templates` (checklist), `faz1-detail`, `faz2-readiness` (kabul kriteri) |                                                        |
| Bağımlılık (blocks / waiting on), ilişki, kopya            | ✅       | Evet — E2E `faz1-detail`                                                                 | Gantt'ta oklar                                         |
| Benzersiz görev ID ve URL ile açma (MOB-12)                | ✅       | Evet — E2E `faz1-detail`                                                                 | Space genelinde tek sayaç; **F8 (8.7)** kopyala menüsü |
| Görev kopyalama (clone), taşıma                            | ✅       | Evet — Int `work-items`                                                                  |                                                        |
| Tekrarlayan görev                                          | ✅       | Evet — E2E `faz7-recurrence`                                                             |                                                        |
| Hatırlatıcı                                                | ✅       | Evet — E2E `faz7-reminders`                                                              |                                                        |
| Toplu düzenleme (bulk edit)                                | ✅       | Evet — E2E `faz1-views`                                                                  |                                                        |
| Şablonlar (görev, liste, doküman)                          | ✅       | Evet — E2E `faz5-templates`                                                              |                                                        |
| Görev açıklamasında görsel                                 | ❌       | —                                                                                        | **F8 (8.6)**                                           |

## 3. Görünümler

| ClickUp fonksiyonu                               | Seyir'de | ClickUp gibi çalışıyor mu           | Not                               |
| ------------------------------------------------ | -------- | ----------------------------------- | --------------------------------- |
| List görünümü (gruplama, sıralama, filtre)       | ✅       | Evet — E2E `faz1-views`             |                                   |
| Table görünümü (satır içi düzenleme)             | ✅       | Evet — E2E `faz1-views`             |                                   |
| Board / Kanban (sürükle-bırak, WIP limiti)       | ✅       | Evet — E2E `faz2-board`, `faz5-wip` |                                   |
| Calendar                                         | ✅       | Evet — E2E `faz4-calendar`          |                                   |
| Gantt (sürükleme, bağımlılık okları, kritik yol) | ✅       | Evet — E2E `faz4-gantt`             | Bağımlıları otomatik kaydırma var |
| Gantt'ta okla bağımlılık çizme, baseline         | ❌       | —                                   | F9                                |
| Workload (iş yükü)                               | ✅       | Evet — E2E `faz4-workload`          |                                   |
| Kayıtlı ve paylaşılan görünümler                 | ✅       | Evet — E2E `faz5-views`             |                                   |
| Mind map / Whiteboard                            | ❌       | —                                   | Kapsam dışı önerisi               |

## 4. Sprint / Agile

| ClickUp fonksiyonu                                          | Seyir'de | ClickUp gibi çalışıyor mu                      | Not                                            |
| ----------------------------------------------------------- | -------- | ---------------------------------------------- | ---------------------------------------------- |
| Sprint oluştur, başlat, tamamla, iptal                      | ✅       | Evet — E2E `faz2-backlog`, `faz2-lifecycle`    |                                                |
| Bitmeyen işleri sonraki sprinte devretme                    | ✅       | Evet — E2E `faz2-lifecycle`                    |                                                |
| Sol menüde sprint ağacı (+ ile açılıp sprintler listelenir) | ❌       | —                                              | **F8 (8.1)** — yönetici isteği                 |
| Sprint listesini panoya kopyalama                           | ❌       | —                                              | **F8 (8.1)**                                   |
| Backlog → sprint taşıma (menü)                              | ✅       | Evet — E2E `faz2-backlog`                      |                                                |
| Backlog ↔ sprint ↔ sprint sürükle-bırak                     | 🟡       | Kısmen — yalnız Planlama ekranında, tek sprint | **F8 (8.2)**                                   |
| Sprint puanı, burndown, velocity                            | ✅       | Evet — E2E `faz2-reports`                      |                                                |
| Sprint review, retrospektif                                 | ✅       | Evet — E2E `faz3-retro`                        |                                                |
| Epic ilerleme, roadmap                                      | ✅       | Evet — E2E `faz3-epics`, `faz4-roadmap`        |                                                |
| Sprint'i Excel'e aktarma / Excel'den alma (bağımlılıklarla) | ❌       | —                                              | **F8 (8.4)** — şu an yalnız List bazlı CSV var |

## 5. Zaman

| ClickUp fonksiyonu            | Seyir'de | ClickUp gibi çalışıyor mu | Not |
| ----------------------------- | -------- | ------------------------- | --- |
| Zamanlayıcı, elle süre girişi | ✅       | Evet — E2E `faz4-time`    |     |
| Timesheet                     | ✅       | Evet — E2E `faz4-time`    |     |
| Tahmin (saat/puan)            | ✅       | Evet — E2E `faz2-backlog` |     |

## 6. Dokümanlar (ClickUp Docs / Confluence)

| ClickUp fonksiyonu                         | Seyir'de | ClickUp gibi çalışıyor mu           | Not                               |
| ------------------------------------------ | -------- | ----------------------------------- | --------------------------------- |
| Sayfa ağacı, alt sayfalar                  | ✅       | Evet — E2E `faz3-docs`              |                                   |
| Başlık, liste, kod, alıntı, görev listesi  | ✅       | Evet — E2E `faz3-docs`, `faz7-docs` |                                   |
| Tablo                                      | ✅       | Evet — E2E `faz3-docs`              |                                   |
| Bağlantı (link)                            | ✅       | Doğrulanmadı                        |                                   |
| Görsel (resim) ekleme / yapıştırma         | ❌       | —                                   | **F8 (8.6)** — yönetici isteği    |
| Dosya eki                                  | ✅       | Evet — E2E `faz7-docs`              |                                   |
| Undo / Redo                                | ✅       | Doğrulanmadı                        | **F8**: E2E ile kanıtlanacak      |
| Sürüm listesi, eski sürüme dönme           | ✅       | Evet — E2E `faz3-docs`              | Sürümler arası fark (diff) da var |
| PDF'e aktarma (yazdır)                     | ✅       | Doğrulanmadı                        | Tarayıcı yazdır → PDF             |
| Word'e (.docx) aktarma                     | ❌       | —                                   | **F8 (8.6)** — yönetici isteği    |
| Markdown'a aktarma                         | ✅       | Doğrulanmadı                        |                                   |
| Dokümanı göreve bağlama, yorum, @bahsetme  | ✅       | Evet — E2E `faz3-doc-links`         |                                   |
| Dokümanda arama                            | ✅       | Evet — E2E `faz7-docs`              |                                   |
| Canlı ortak düzenleme (aynı anda iki kişi) | ❌       | —                                   | F9                                |
| Salt okunur paylaşım linki, sayfa izinleri | ❌       | —                                   | F9 (güvenlik fazı)                |

## 7. İş birliği ve iletişim

| ClickUp fonksiyonu                | Seyir'de | ClickUp gibi çalışıyor mu       | Not |
| --------------------------------- | -------- | ------------------------------- | --- |
| Yorum, @bahsetme, emoji tepki     | ✅       | Evet — E2E `faz1-collab`        |     |
| Bildirim (uygulama içi + e-posta) | ✅       | Evet — E2E `faz2-notifications` |     |
| Birebir mesaj (DM)                | ✅       | Evet — E2E `faz7-messages`      |     |
| Grup sohbeti / kanal              | ❌       | —                               | F9  |
| Ekipler (kullanıcı grupları)      | ✅       | Evet — E2E `faz7-teams`         |     |

## 8. Hedefler, formlar, otomasyon, entegrasyon

| ClickUp fonksiyonu             | Seyir'de | ClickUp gibi çalışıyor mu     | Not                |
| ------------------------------ | -------- | ----------------------------- | ------------------ |
| Goals (hedefler)               | ✅       | Evet — E2E `faz7-goals`       |                    |
| Form ile görev toplama         | ✅       | Evet — E2E `faz7-forms`       |                    |
| Otomasyon kuralları            | ✅       | Evet — E2E `faz5-automations` |                    |
| Webhook                        | ✅       | Evet — E2E `faz6-webhooks`    |                    |
| GitHub/GitLab bağlantısı       | ✅       | Evet — E2E `faz6-git`         |                    |
| API anahtarı                   | ✅       | Evet — E2E `faz6-api-tokens`  |                    |
| Yapay zekâ yardımcısı          | ✅       | Evet — E2E `faz6-ai`          | Anahtar tanımlıysa |
| Google/Outlook takvim eşitleme | ❌       | —                             | F9                 |

## 9. Raporlama ve dashboard

| ClickUp fonksiyonu    | Seyir'de | ClickUp gibi çalışıyor mu   | Not |
| --------------------- | -------- | --------------------------- | --- |
| Dashboard widget'ları | ✅       | Evet — E2E `faz4-dashboard` |     |
| Sprint raporları      | ✅       | Evet — E2E `faz2-reports`   |     |

## 10. İçe / dışa aktarma

| ClickUp fonksiyonu                        | Seyir'de | ClickUp gibi çalışıyor mu | Not                      |
| ----------------------------------------- | -------- | ------------------------- | ------------------------ |
| CSV dışa / içe aktarma (List)             | ✅       | Evet — E2E `faz5-csv`     |                          |
| Excel (.xlsx) dışa / içe aktarma (Sprint) | ❌       | —                         | **F8 (8.4)**             |
| Jira / Trello / ClickUp'tan içe aktarma   | ❌       | —                         | F9 (CSV ile kısmen olur) |

## 11. Yönetim, güvenlik, log

| ClickUp fonksiyonu                               | Seyir'de | ClickUp gibi çalışıyor mu                 | Not                                     |
| ------------------------------------------------ | -------- | ----------------------------------------- | --------------------------------------- |
| Roller (Sahip, Yönetici, Üye, Misafir)           | ✅       | Evet — Int `workspaces`                   |                                         |
| Misafire yalnız seçili Space                     | ✅       | Evet — Int `spaces`                       |                                         |
| Davet, yöneticinin doğrudan hesap açması         | ✅       | Evet — E2E `faz6-create-account`          |                                         |
| Oturum listesi, uzaktan çıkış                    | ✅       | Evet — Int `auth`                         |                                         |
| Görev bazında aktivite geçmişi                   | ✅       | Evet — E2E `faz1-collab`                  |                                         |
| Workspace denetim logu (kim, ne zaman, ne yaptı) | 🟡       | Kısmen — kayıt tutuluyor, toplu ekran yok | **F8 (8.3)** — yönetici isteği (önemli) |
| Özel roller, ayrıntılı izinler                   | ❌       | —                                         | F9 (güvenlik fazı)                      |
| SSO (Google/Microsoft ile giriş)                 | ❌       | —                                         | F9                                      |

## Özet

- Toplam 81 fonksiyon: ✅ Var 61 · 🟡 Kısmen 2 · ❌ Yok 18. Var olanlardan 57 tanesi otomatik testle kanıtlı, 4 tanesi henüz doğrulanmadı (Faz 8 içinde testlenecek).
- **Faz 8'de yapılacaklar (yönetici istekleri):** sol menü sprint ağacı, sprint listesini kopyalama, tam sürükle-bırak (backlog ↔ sprint ↔ sprint), sürükleyerek alt görev, denetim logu ekranı, sprint Excel dışa/içe aktarma (bağımlılıklarla), Space/Sprint zip yedek ve geri yükleme, dokümana görsel, Word'e aktarma, Undo/Redo ve PDF'in testle kanıtlanması.
- **Faz 9 önerisi:** multi-home görev, Gantt'ta okla bağımlılık + baseline, canlı ortak düzenleme, paylaşım linki ve sayfa izinleri, grup sohbeti, takvim eşitleme, Jira/Trello içe aktarma, özel roller, SSO.
