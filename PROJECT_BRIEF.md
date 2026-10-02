# PROJE BRIEF: Scrum Odaklı Proje Yönetim Uygulaması (ClickUp Benzeri)

> Bu dosya projenin **tek doğruluk kaynağıdır (single source of truth)** ve senin (Claude Code) **kalıcı hafızandır**.
> Her oturumun başında bu dosyayı oku. Bir özellik, kural veya kapsam konusunda şüphen olursa önce burada ara.
> Bu dosyada **mimari, teknoloji, kod, veritabanı veya kütüphane kararı YOKTUR**. Onları seninle birlikte, projeye başlarken konuşarak vereceğiz. Burada sadece **NE yapmak istediğimiz** anlatılıyor.

---

## 0. Claude Code İçin Çalışma Kuralları

1. **Kodlamaya hemen başlama.** Önce bu dosyayı tamamen oku, anladığını kendi cümlelerinle özetle, belirsiz noktaları bana sor.
2. **Mimari ve teknoloji kararlarını birlikte alacağız.** Her büyük karar için 2-3 seçenek sun, artı/eksilerini yaz, önerini söyle, benim onayımı bekle.
3. **Aşamalı ilerle.** Bölüm 14'teki fazlara uy. Bir faz bitmeden sonrakine geçme. Her faz sonunda ne yapıldığını, neyin eksik kaldığını özetle.
4. **Karar kaydı tut.** Aldığımız her önemli kararı `docs/DECISIONS.md` dosyasına (tarih, karar, gerekçe, alternatifler) yaz.
5. **Bu dosyayı güncel tut.** Kapsam değişirse veya yeni bilgi öğrenirsen değişikliği bana önerip onayımla bu dosyaya işle. Bölüm 17 (Değişiklik Günlüğü) sana ayrılmıştır.
6. **Varsayım yapma, sor.** Bu brief'te olmayan bir şeyi uydurma. "Bunu şöyle varsayıyorum, doğru mu?" diye sor.
7. **Küçük, test edilebilir adımlarla çalış.** Her özellik için çalışır, test edilmiş, gözle görülebilir bir çıktı hedefle.
8. **Terimleri tutarlı kullan.** Bölüm 16'daki sözlüğe sadık kal (ör. her yerde aynı "Sprint", "Epic", "Story" adlandırması).
9. **Kullanıcı arayüzü dili:** Varsayılan Türkçe, İngilizce de desteklenecek (Bölüm 12). Kod içi isimlendirme dili için benden onay iste.
10. **Her özelliği bu dosyadaki kabul kriterleriyle karşılaştır.** "Bitti" demeden önce Bölüm 15'teki kriterleri kontrol et.

---

## 1. Proje Özeti ve Vizyon

### 1.1 Ne yapıyoruz?

ClickUp'ın temel işlevini gören, **Scrum metodolojisini merkezine alan** bir **proje ve görev yönetim uygulaması** geliştiriyoruz. Ekipler iş planlayabilecek, sprintlere bölebilecek, Kanban panosunda takip edebilecek, Gantt/zaman çizelgesinde görebilecek, doküman yazabilecek (Confluence benzeri) ve raporlarla ilerlemeyi ölçebilecek.

### 1.2 Neden yapıyoruz?

Yöneticimiz, ekibin kullandığı hazır araçlara (ClickUp, Jira vb.) benzer işlevi veren, **kendi kurumumuza özel**, kontrolü bizde olan bir Scrum yönetim uygulaması istiyor.

### 1.3 Vizyon cümlesi

> "Tek bir yerde, bir ekibin fikrinden teslimine kadar bütün işini Scrum disipliniyle planlayabildiği, takip edebildiği ve belgeleyebildiği sade ama güçlü bir uygulama."

### 1.4 Tasarım ilkeleri

- **Scrum-first:** Scrum kavramları (Epic, Story, Sprint, Backlog, Velocity) birinci sınıf vatandaştır, sonradan eklenmiş gibi durmamalı.
- **Esnek ama anlaşılır:** ClickUp kadar özelleştirilebilir ama ilk kullanımda karmaşık hissettirmemeli.
- **Tek bilgi kaynağı:** İş, doküman ve rapor aynı yerde, birbirine bağlı olmalı.
- **Hızlı:** Sık yapılan işlemler (görev oluşturma, durum değiştirme, sürükle-bırak) anında hissettirmeli.
- **Şeffaflık:** Herkes ilerlemeyi görebilmeli (Scrum'ın şeffaflık ilkesi).
- **Aynı veri, farklı görünüm:** Görev tek, ama List/Board/Gantt/Takvim gibi farklı görünümlerde izlenir.

---

## 2. Hedef Kullanıcılar (Personalar)

| Persona                     | Rol                          | Ana ihtiyaçları                                                                                                   |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Ayşe, Product Owner**     | Ürün sahibi                  | Backlog'u sıralamak, Epic/Story yazmak, öncelik belirlemek, roadmap görmek, sprint review'da ilerlemeyi göstermek |
| **Mehmet, Scrum Master**    | Süreç lideri                 | Sprint kurmak, engelleri (impediment) takip etmek, retrospektif yapmak, velocity/burndown izlemek                 |
| **Elif, Developer**         | Geliştirici/tasarımcı/tester | Kendi görevlerini görmek, durum güncellemek, süre girmek, yorum yapmak, bağımlılıkları bilmek                     |
| **Can, Proje/Üst Yönetici** | Yönetici, paydaş             | Üst seviye ilerleme, kilometre taşları, ekipler arası durum, rapor/dashboard                                      |
| **Zeynep, Workspace Admin** | Yönetici                     | Kullanıcı ve yetki yönetimi, workspace ayarları                                                                   |
| **Konuk (Guest)**           | Dış paydaş/müşteri           | Sınırlı, çoğunlukla salt okunur erişim, yorum yapabilme                                                           |

---

## 3. Kapsam Özeti

### 3.1 MVP (Birinci sürümde MUTLAKA olacaklar)

- Kullanıcı kaydı/girişi ve workspace üyelik yönetimi
- Roller ve temel yetkilendirme
- Workspace → Space → Folder → List → Task hiyerarşisi
- Scrum nesneleri: **Epic, Story, Task, Sub-task, Bug**
- **Product Backlog** ve **Sprint Backlog**
- **Sprint yaşam döngüsü** (planla, başlat, tamamla, iptal)
- Görev detay sayfası (tüm temel alanlar)
- **List, Board (Kanban) ve Table** görünümleri
- Sürükle-bırak ile durum/sıra değiştirme
- Yorumlar, @mention, bildirimler
- Dosya eki ekleme
- Arama ve filtreleme
- **Burndown, Velocity** raporları
- Aktivite geçmişi (kim neyi ne zaman değiştirdi)
- Temel **Docs** (zengin metin doküman sayfaları, görevlere bağlanabilir)

### 3.2 Faz 2 (MVP sonrası)

- Gantt / Timeline görünümü, bağımlılıklar, kritik yol
- Takvim görünümü
- Roadmap (Epic seviyesinde)
- Özel alanlar (Custom Fields) ve özel durum akışları (Custom Workflow)
- Otomasyonlar (kural tabanlı)
- Zaman takibi (sayaç ve manuel)
- Dashboard (özelleştirilebilir widget'lar)
- Cumulative Flow Diagram, Lead/Cycle time raporları
- WIP limitleri (Kanban)
- Retrospektif ve toplantı notu şablonları
- Kayıtlı filtreler ve görünümler
- Tekrarlayan görevler
- İçe/dışa aktarma (CSV, belki Jira/ClickUp import)

### 3.3 Faz 3 / İleri Seviye

- Entegrasyonlar (Slack, GitHub/GitLab, takvim, e-posta)
- Whiteboard / mind map
- Hedefler (Goals/OKR)
- Yapay zekâ destekli özetleme/story yazma/tahmin önerisi
- Mobil kullanım deneyimi / mobil uygulama
- Public API ve webhook
- Şablon galerisi
- Gelişmiş raporlama, çoklu workspace yönetimi

### 3.4 Kapsam Dışı (Şimdilik YAPMAYACAĞIZ)

- Muhasebe/faturalama/ödeme sistemi
- Müşteri CRM'i
- Video konferans / sesli görüşme
- Gelişmiş kaynak ve bütçe maliyet yönetimi (ERP seviyesi)
- Dosya versiyon kontrol sistemi (Git benzeri)

> Kapsam dışı veya faz kaydırma kararlarını bana danışmadan değiştirme.

---

## 4. Bilgi Hiyerarşisi ve Kavramlar

### 4.1 Organizasyon hiyerarşisi (ClickUp benzeri)

```
Workspace (kurum/şirket)
 └── Space (departman veya ürün/takım; ör. "Mobil Uygulama")
      └── Folder (proje grubu; opsiyonel)
           └── List (görev kabı: Backlog listesi, Sprint listesi vb.)
                └── Task (görev)
                     └── Sub-task / Checklist
```

### 4.2 Scrum iş hiyerarşisi

```
Epic (büyük hedef, birden fazla sprinte yayılır)
 └── Story (kullanıcı değeri sunan özellik)
      └── Task (teknik iş parçası)
           └── Sub-task (daha küçük adım)
Bug (hata, bağımsız olabilir veya bir Story/Epic'e bağlanabilir)
```

- **Epic:** Haftalar/aylar süren büyük iş hedefi. Altında Story'ler barındırır. İlerlemesi story'lerin tamamlanma oranından hesaplanır. T-shirt boyutu (S/M/L/XL) alabilir.
- **Story:** "Bir [rol] olarak, [amaç] yapabilmek istiyorum, böylece [fayda] sağlayayım." formatında yazılır. Story Point ile tahmin edilir. Kabul kriterleri içerir. Tek bir sprint içinde bitirilebilir olmalıdır.
- **Task:** Story'yi gerçekleştirmek için somut iş. Saat bazlı tahmin edilir. Genellikle bir kişiye atanır. Birkaç saat-1/2 gün sürer.
- **Sub-task:** Task'ın alt adımı.
- **Bug:** Hata kaydı. Önem derecesi (severity), tekrar adımları (steps to reproduce), beklenen/gerçek sonuç, ortam bilgisi alanları vardır.

### 4.3 Backlog katmanları

- **Product Backlog:** Ürün ile ilgili tüm iş öğeleri. Product Owner tarafından sıralanır.
- **Sprint Backlog:** Bir sprint için seçilen öğeler ve planı.
- **Backlog Refinement:** Öğelerin detaylandırılması, bölünmesi, tahminlenmesi için destek (ör. refinement durumu/etiketi, "refine edilmeye hazır" bayrağı).

---

## 5. Fonksiyonel Gereksinimler (Modül Modül)

> Her modül için öncelik etiketi: **[MVP]**, **[F2]** (Faz 2), **[F3]** (Faz 3).

### 5.1 Kimlik Doğrulama ve Kullanıcı Yönetimi

- [MVP] E-posta ve şifre ile kayıt, giriş, çıkış
- [MVP] Şifre sıfırlama (e-posta ile)
- [MVP] Davet ile workspace'e kullanıcı ekleme (e-posta daveti)
- [MVP] Profil sayfası (ad, fotoğraf, unvan, saat dilimi, dil tercihi)
- [F2] İki faktörlü doğrulama (2FA)
- [F3] SSO (Google, Microsoft vb.) / kurumsal giriş
- [MVP] Oturum yönetimi (aktif oturumları görme ve sonlandırma)

### 5.2 Workspace, Space, Folder, List Yönetimi

- [MVP] Workspace oluşturma, adlandırma, ayarlar
- [MVP] Space oluşturma (ikon, renk, açıklama, üye listesi)
- [MVP] Folder ve List oluşturma, yeniden adlandırma, sıralama, arşivleme, silme
- [MVP] Sol kenar çubuğunda hiyerarşik gezinme (ağaç yapısı)
- [MVP] Space/Folder/List'i favorilere ekleme
- [MVP] Her Space için **Scrum modu** (Sprint, Epic, Backlog özelliklerini açıp kapatma)
- [F2] Space şablonları (örn. "Scrum Takımı", "Kanban Operasyon", "Waterfall Proje")

### 5.3 Roller ve Yetkiler

Bkz. Bölüm 7 (rol yetki matrisi). Özet:

- Workspace seviyesinde: **Owner, Admin, Member, Guest**
- Proje (Space) seviyesinde Scrum rolleri: **Product Owner, Scrum Master, Developer, Stakeholder (sadece görüntüleme/yorum)**
- [F2] Özel rol oluşturma

### 5.4 Görev (Task) Yönetimi

**Her görevin (Epic/Story/Task/Bug) ortak alanları:**

- Başlık, açıklama (zengin metin: başlıklar, listeler, kod bloğu, tablo, görsel, @mention)
- Tip (Epic / Story / Task / Sub-task / Bug)
- Durum (Status), ör. Backlog, To Do, In Progress, In Review, Done
- Öncelik (Urgent, High, Normal, Low)
- Atanan kişi(ler) (assignee), bildiren (reporter)
- Başlangıç ve bitiş tarihi (due date)
- Tahmin: **Story Point** (Fibonacci: 1, 2, 3, 5, 8, 13, 21) ve/veya **zaman tahmini** (saat)
- Gerçekleşen süre (zaman takibi ile) [F2]
- Etiketler (labels/tags)
- Üst öğe (parent): Story → Epic, Task → Story, Sub-task → Task
- Bağlı sprint
- Kabul kriterleri (checklist veya Given-When-Then formatında)
- Checklist'ler (yapılacaklar listesi)
- Dosya ekleri (sürükle-bırak yükleme, önizleme)
- Yorumlar (tartışma akışı)
- İzleyiciler (watchers)
- Bağlantılı görevler / bağımlılıklar (blocks, blocked by, relates to, duplicates)
- Aktivite geçmişi (tüm değişiklikler loglanır)
- Benzersiz **okunabilir ID** (ör. `PRJ-142`) ve paylaşılabilir link
- [F2] Özel alanlar (Custom Fields)
- [F2] Tekrarlayan görev
- [MVP] Görevi kopyalama, taşıma, arşivleme, silme (geri alınabilir silme)
- [MVP] Toplu işlemler (bulk edit: durum, atanan, sprint, etiket)
- [MVP] Hızlı görev oluşturma (satır içi, kısayol ile)
- [MVP] Bir Story'yi Task'lara bölme kolaylığı

**Bug'a özel alanlar:** Önem (Critical/Major/Minor/Trivial), tekrar adımları, beklenen sonuç, gerçek sonuç, ortam/sürüm, bulunduğu sürüm.

**Epic'e özel alanlar:** Hedef/başarı ölçütü, T-shirt boyutu, hedef tarih aralığı, renk, ilerleme yüzdesi (otomatik).

### 5.5 Backlog Yönetimi

- [MVP] Product Backlog görünümü: Epic ve Story'ler öncelik sırasına göre
- [MVP] Sürükle-bırak ile **sıralama** (priority ranking)
- [MVP] Backlog'dan Sprint'e öğe taşıma (sürükle-bırak veya toplu seçim)
- [MVP] Epic'e göre gruplama/filtreleme
- [MVP] Tahminsiz (story point girilmemiş) öğeleri vurgulama
- [F2] Backlog refinement oturumu desteği, toplam point özeti
- [F2] **Planning Poker** (ekip tahmin oylaması)
- [MVP] Backlog'da hızlı filtre: atanan, etiket, tip, öncelik, epic

### 5.6 Sprint Yönetimi

- [MVP] Sprint oluşturma: ad, hedef (Sprint Goal), başlangıç/bitiş tarihi, kapasite notu
- [MVP] Sprint durumları: **Planlandı → Aktif → Tamamlandı** (veya **İptal**)
- [MVP] Sprint Planning ekranı: sol Backlog, sağ Sprint Backlog, toplam story point ve kapasite göstergesi
- [MVP] Sprint başlatma (başlangıç doğrulaması: hedef girilmiş mi, süre makul mu)
- [MVP] Aktif sprint sayfası: Board görünümü, günlük ilerleme, kalan point
- [MVP] Sprint tamamlama akışı: bitmeyen işler için **seçenek sunulur** (sonraki sprint'e taşı / backlog'a geri at)
- [MVP] Sprint Review özeti (tamamlananlar, tamamlanmayanlar, demo notları)
- [F2] **Retrospektif** sayfası (Neler iyi gitti / Neler kötü gitti / Aksiyonlar) ve aksiyonların göreve dönüşmesi
- [F2] Sprint kapasite planlaması (kişi bazlı müsaitlik, izin günleri)
- [MVP] Geçmiş sprintleri listeleme ve inceleme
- [F2] Sprint şablonu / otomatik sonraki sprint oluşturma
- [MVP] Sprint süresi ayarlanabilir (1-4 hafta), takım bazında varsayılan

### 5.7 Epic Yönetimi

- [MVP] Epic oluşturma ve altına Story ekleme
- [MVP] Epic detay sayfası: açıklama, hedef, bağlı story'ler, toplam/tamamlanan point, ilerleme çubuğu
- [MVP] Epic'e göre filtreleme ve gruplama
- [F2] **Roadmap görünümü:** Epic'lerin zaman ekseninde çubuklarla gösterimi, sürükleyerek tarih değiştirme
- [F2] Epic'leri tema/inisiyatif altında gruplama

### 5.8 Görünümler (Views)

Aynı görev verisi farklı görünümlerde izlenir; kullanıcı görünüm kaydedebilir [F2].

| Görünüm                   | Öncelik | Açıklama                                                            |
| ------------------------- | ------- | ------------------------------------------------------------------- |
| **List**                  | MVP     | Gruplanabilir, sıralanabilir liste; satır içi düzenleme             |
| **Board (Kanban)**        | MVP     | Durum sütunları, kart sürükle-bırak, swimlane (atanan/epic/öncelik) |
| **Table**                 | MVP     | Elektronik tablo benzeri, sütun seç/gizle/sırala                    |
| **Calendar**              | F2      | Bitiş tarihine göre takvim, sürükleyerek tarih değiştirme           |
| **Gantt / Timeline**      | F2      | Zaman çizelgesi, bağımlılık okları, kilometre taşı, kritik yol      |
| **Roadmap**               | F2      | Epic seviyesinde üst düzey plan                                     |
| **Workload**              | F2      | Kişi bazlı iş yükü ve kapasite                                      |
| **Mind Map / Whiteboard** | F3      | Beyin fırtınası alanı                                               |

Ortak özellikler: **filtre, gruplama, sıralama, arama, sütun özelleştirme, kaydedilmiş görünüm**.

### 5.9 Kanban Özellikleri

- [MVP] Sütunlar = durumlar, kart sürükleme ile durum değişimi
- [F2] **WIP limiti** (sütun başına), limit aşılınca uyarı
- [MVP] Swimlane (satır gruplama): atanan, epic, öncelik
- [F2] Bağımsız Kanban (sprintsiz sürekli akış) projeleri için ayrı mod
- [F2] Kartta gösterilecek alanları seçme

### 5.10 Gantt / Zaman Çizelgesi [F2]

- Görevler yatay çubuk olarak, zaman ekseninde (gün/hafta/ay ölçeği)
- Bağımlılıklar: Finish-to-Start (varsayılan), Start-to-Start, Finish-to-Finish, Start-to-Finish
- Sürükleyerek tarih/süre değiştirme
- Kilometre taşı (milestone) desteği
- **Kritik yol** vurgusu
- Baseline (planlanan) ile gerçekleşen karşılaştırması
- Bağımlı görevlerin otomatik kayması (opsiyonel, kullanıcı ayarlı)
- İş Kırılım Yapısı (WBS) hiyerarşisinin sol panelde görünmesi

### 5.11 Raporlama ve Metrikler

- [MVP] **Sprint Burndown Chart** (kalan point/zaman)
- [MVP] **Velocity Chart** (sprint başına tamamlanan point, ortalama)
- [F2] **Sprint Burn-up**
- [F2] **Cumulative Flow Diagram (CFD)**
- [F2] **Lead Time ve Cycle Time** raporu
- [F2] **Epic ilerleme raporu**
- [F2] Throughput (birim zamanda biten iş)
- [F2] Kişi bazlı iş yükü raporu
- [F2] Bug trendi (açılan/kapanan)
- [F2] Özelleştirilebilir **Dashboard** (widget ekle/çıkar/boyutlandır)
- [F2] Rapor dışa aktarma (CSV/PDF)

### 5.12 Docs (Confluence Benzeri Doküman Modülü)

- [MVP] Workspace/Space içinde doküman sayfaları oluşturma
- [MVP] Zengin metin editörü: başlık, liste, tablo, kod bloğu, görsel, link, alıntı, ayırıcı, emoji
- [MVP] Sayfa hiyerarşisi (üst-alt sayfa), sol ağaç yapısı
- [MVP] Sayfaya görev/epic **bağlama** ve görevden dokümana link verme
- [MVP] Sürüm geçmişi ve geri yükleme
- [MVP] Yorum ve @mention
- [F2] **Şablonlar:** Ürün gereksinim dokümanı (PRD), toplantı notu, retrospektif, karar kaydı, teknik tasarım dokümanı, sprint raporu, runbook/postmortem
- [F2] Dokümana **gömülü görev listesi/filtresi** (ör. "Bu Epic'e ait açık işler" canlı tablosu)
- [F2] Birlikte aynı anda düzenleme (eşzamanlı düzenleme)
- [F2] Doküman içi arama ve içindekiler (TOC) otomatik üretimi
- [F2] Dokümanı PDF/Markdown dışa aktarma
- [F2] Doküman izinleri (kimler görebilir/düzenleyebilir)

### 5.13 İşbirliği: Yorum, Mention, Bildirim, Aktivite

- [MVP] Görev ve doküman altında yorum akışı, düzenleme, silme, tepki (emoji)
- [MVP] **@mention** ile kişi etiketleme
- [MVP] Yoruma dosya/görsel ekleme
- [MVP] **Bildirim merkezi** (uygulama içi): atandım, mention edildim, görev durumum değişti, yorum geldi, sprint başladı/bitti
- [MVP] E-posta bildirimleri (kullanıcı tercihine göre aç/kapat)
- [F2] Bildirim tercih yönetimi (tip ve kanal bazlı), "rahatsız etme" saatleri
- [MVP] **Aktivite akışı** (görev bazlı ve proje bazlı, "kim ne yaptı")
- [F2] Gerçek zamanlı güncelleme (başka biri değişiklik yapınca ekranda anında yansır)
- [F2] Takım içi sohbet kanalları (basit)

### 5.14 Arama ve Filtreleme

- [MVP] Global arama (görev, doküman, kişi, space)
- [MVP] Gelişmiş filtre: tip, durum, atanan, öncelik, etiket, sprint, epic, tarih aralığı, point
- [F2] Kayıtlı filtreler ve paylaşım
- [F2] Filtre dilini (JQL benzeri sorgu) destekleme
- [MVP] "Bana atananlar", "Benim oluşturduklarım", "İzlediklerim" hazır görünümleri

### 5.15 Zaman Takibi [F2]

- Görev üzerinde başlat/durdur sayaç
- Manuel süre girişi
- Tahmin edilen ile gerçekleşen karşılaştırması
- Kişi/proje bazlı zaman raporu (timesheet)

### 5.16 Özelleştirme [F2]

- **Özel durumlar (Custom Statuses):** Space/List bazında durum akışı tanımlama (ör. Backlog → Ready → In Progress → Review → QA → Done) ve durum kategorisi (Not Started / Active / Done)
- **Özel alanlar (Custom Fields):** metin, sayı, tarih, açılır liste, çoklu seçim, kişi, URL, onay kutusu, formül
- **Özel görev tipleri**
- Etiket yönetimi, renk, ikon
- **Kural tabanlı otomasyonlar:** "Durum X olunca Y yap" (kişi ata, bildirim gönder, alan güncelle, alt görev oluştur)
- **Şablonlar:** Görev, liste, sprint, space şablonu

### 5.17 Dosya Yönetimi

- [MVP] Görev/doküman/yorum altına dosya yükleme (sürükle-bırak, çoklu)
- [MVP] Görsel ve PDF önizleme
- [MVP] Boyut ve tür sınırları (ayarlanabilir)
- [F2] Workspace dosya kütüphanesi

### 5.18 Entegrasyonlar ve API [F3]

- Slack/Teams bildirim
- GitHub/GitLab: commit/PR'ı göreve bağlama (`PRJ-142` etiketi ile)
- Google/Outlook takvim senkronu
- Webhook'lar ve herkese açık API (token ile)
- Import: CSV, Jira, ClickUp, Trello

### 5.19 Yapay Zekâ Destekli Özellikler [F3] (opsiyonel)

- Uzun görev/doküman özetleme
- Açıklamadan User Story ve kabul kriteri önerisi
- Epic'i Story'lere bölme önerisi
- Sprint özeti ve retrospektif taslağı üretme
- Benzer görev tespiti (duplicate)

### 5.20 Ayarlar ve Yönetim

- [MVP] Workspace ayarları, kullanıcı listesi, rol atama
- [MVP] Kullanıcı kişisel ayarları (dil, tema, saat dilimi, bildirimler)
- [MVP] Arşiv ve çöp kutusu (silinen öğeler geri getirilebilir)
- [F2] Denetim günlüğü (audit log) yönetici görünümü
- [F2] Workspace düzeyinde dışa aktarma/yedekleme

---

## 6. Scrum İş Kuralları (Uygulamanın Uyması Gereken Kurallar)

Bu kurallar uygulamanın "Scrum felsefesine sadık" kalmasını sağlar. Esnek kuralları ayar olarak sunabiliriz, ancak varsayılan davranış aşağıdaki gibidir.

### 6.1 Sprint Kuralları

1. Bir takımın (Scrum Space'inin) **aynı anda yalnızca bir aktif sprinti** olur.
2. Sprint süresi **sabittir**; başladıktan sonra bitiş tarihi uzatılamaz (yönetici ayarla izin verse bile bu istisna olarak loglanır).
3. Her sprintin bir **Sprint Goal**'u olmalıdır (başlatırken zorunlu veya uyarılı).
4. Aktif sprint'e **sonradan öğe eklenebilir** ama kullanıcı uyarılır ("Sprint kapsamı değişiyor") ve eklenme bilgisi **scope change** olarak raporlarda gösterilir.
5. Sprint **tamamlanırken** bitmeyen öğeler için karar istenir: sonraki sprint'e devret veya backlog'a at. Hiçbir öğe "havada" kalmaz.
6. Sprint'i **iptal etme yetkisi yalnızca Product Owner'dadır** (ve Admin).
7. Tamamlanan sprintin **velocity'si** yalnızca "Done" kategorisindeki Story/Bug point toplamından hesaplanır; kısmen biten iş point almaz.
8. Tamamlanmış sprint salt-okunur arşiv gibidir; sonradan yapılan değişiklikler loglanır.

### 6.2 İş Öğesi Kuralları

1. **Story ancak Epic'e bağlanabilir veya bağımsız olabilir; Task ancak Story veya bağımsız; Sub-task ancak Task/Story/Bug altında** olabilir. Hiyerarşi bozuk bağlanamaz.
2. Alt öğelerin hepsi "Done" olmadan üst Story'nin "Done"a geçmesi için uyarı gösterilir (ayara bağlı engelleyebilir).
3. Epic'in ilerleme yüzdesi, altındaki Story'lerin **point ağırlıklı** tamamlanma oranıdır (point yoksa adet bazlı).
4. Story Point sadece Story/Bug/Epic (tahmin edilmişse) seviyesinde; **saat tahmini** Task/Sub-task seviyesinde tutulur. Üst öğe, alt öğelerin saatini toplayıp gösterebilir (rollup).
5. Bir görev **Done** durumuna geçince tamamlanma tarihi kaydedilir; Done'dan geri alınırsa kayıt güncellenir ve loglanır.
6. Bağımlılık: "Blocked by" olan görev, engelleyen bitmeden "In Progress"e geçerken **uyarı** alır.
7. Silinen öğeler **çöp kutusuna** gider, geri getirilebilir; kalıcı silme sadece yetkili kişiler tarafından yapılır.

### 6.3 Definition of Ready / Definition of Done

- Her Space için **Definition of Done (DoD)** maddeleri tanımlanabilir (ör. kod review yapıldı, testler geçti, dokümantasyon güncellendi). Bir Story "Done"a çekilirken DoD checklist'i gösterilir/zorunlu tutulabilir (ayar).
- Her Space için **Definition of Ready (DoR)** tanımlanabilir (ör. kabul kriteri yazıldı, tahmin yapıldı, bağımlılık çözüldü). Sprint'e alınırken DoR'a uymayan öğeler işaretlenir.

### 6.4 Tahmin Kuralları

- Varsayılan ölçek **Fibonacci** (1, 2, 3, 5, 8, 13, 21), Space ayarıyla T-shirt, düz sayı veya özel ölçeğe çevrilebilir.
- Story Point göreli büyüklüktür; saate otomatik çevrilmez.

---

## 7. Roller ve Yetki Matrisi

### 7.1 Workspace Rolleri

| Yetki                              | Owner | Admin |   Member   |  Guest  |
| ---------------------------------- | :---: | :---: | :--------: | :-----: |
| Workspace'i silme, faturalama      |   ✔   |   ✘   |     ✘      |    ✘    |
| Kullanıcı davet/çıkarma, rol atama |   ✔   |   ✔   |     ✘      |    ✘    |
| Space oluşturma                    |   ✔   |   ✔   | ✔ (ayarlı) |    ✘    |
| Atandığı Space'lerde çalışma       |   ✔   |   ✔   |     ✔      | Sınırlı |
| Workspace ayarları                 |   ✔   |   ✔   |     ✘      |    ✘    |
| Denetim günlüğü görme              |   ✔   |   ✔   |     ✘      |    ✘    |

### 7.2 Proje (Scrum) Rolleri (Space bazında)

| Yetki                                      | Product Owner | Scrum Master |       Developer        | Stakeholder |
| ------------------------------------------ | :-----------: | :----------: | :--------------------: | :---------: |
| Product Backlog'u sıralama/önceliklendirme |       ✔       |  ✘ (öneri)   |       ✘ (öneri)        |      ✘      |
| Epic/Story oluşturma-düzenleme             |       ✔       |      ✔       |           ✔            |      ✘      |
| Task/Sub-task oluşturma-düzenleme          |       ✔       |      ✔       |           ✔            |      ✘      |
| Sprint oluşturma/planlama                  |       ✔       |      ✔       | Katılır, değiştiremez* |      ✘      |
| Sprint başlatma/tamamlama                  |       ✔       |      ✔       |           ✘            |      ✘      |
| Sprint iptal etme                          |       ✔       |      ✘       |           ✘            |      ✘      |
| Kendi görev durumunu değiştirme            |       ✔       |      ✔       |           ✔            |      ✘      |
| Tahmin (story point) girme                 |       ✔       |      ✔       |           ✔            |      ✘      |
| Yorum yapma                                |       ✔       |      ✔       |           ✔            |      ✔      |
| Rapor görme                                |       ✔       |      ✔       |           ✔            |      ✔      |
| Space ayarları, DoD/DoR, durum akışı       |       ✔       |      ✔       |           ✘            |      ✘      |
| Doküman oluşturma/düzenleme                |       ✔       |      ✔       |           ✔            | Görüntüleme |

_Bu matrisi başlangıç önerisi olarak değerlendir; rol yetkilerinin esnetilebilir olması hedeflenir._

---

## 8. Kavramsal Veri Varlıkları (Mantıksal Model, Teknik DEĞİL)

Bunlar sadece **domain'deki varlıkların listesi** ve aralarındaki ilişkilerdir. Tablo/şema tasarımı, veritabanı seçimi ve alan tipleri sonra konuşulacaktır.

- **Kullanıcı (User)**: kimlik, profil, tercihler
- **Workspace**: kurum alanı; kullanıcılar üyelik ile bağlanır
- **Üyelik (Membership)**: kullanıcı-workspace ilişkisi + rol
- **Space**: workspace içinde proje/takım alanı; üyeleri ve Scrum rolleri vardır
- **Folder**, **List**: organizasyon kapları
- **İş Öğesi (Work Item / Task)**: tip alanıyla Epic/Story/Task/Sub-task/Bug (hiyerarşik ebeveyn ilişkisi)
- **Sprint**: bir Space'e ait, tarih aralığı, hedef, durum, kapasite
- **Sprint-İş Öğesi ilişkisi**: bir öğenin hangi sprintlerden geçtiği (devir geçmişi korunur)
- **Durum (Status)** ve **İş Akışı (Workflow)**: Space/List'e özel
- **Etiket (Label)**
- **Yorum (Comment)**: göreve veya dokümana bağlı, mention içerebilir
- **Ek (Attachment)**
- **Bağımlılık (Dependency/Link)**: iş öğeleri arası (blocks, relates, duplicates)
- **Aktivite Kaydı (Activity/Audit Log)**: değişiklik geçmişi
- **Bildirim (Notification)** ve **Bildirim Tercihi**
- **Zaman Kaydı (Time Entry)** [F2]
- **Doküman (Doc/Page)** ve **Doküman Sürümü**: hiyerarşik, iş öğelerine bağlanabilir
- **Özel Alan (Custom Field)** ve değerleri [F2]
- **Otomasyon Kuralı (Automation)** [F2]
- **Görünüm (View)**, **Kayıtlı Filtre** [F2]
- **Dashboard** ve **Widget** [F2]
- **Retrospektif** ve **Aksiyon maddeleri** [F2]
- **DoD/DoR Maddeleri**

**Önemli ilişkiler:**

- Bir Epic → çok Story; bir Story → çok Task; bir Task → çok Sub-task
- Bir Sprint → çok İş Öğesi; bir İş Öğesi zaman içinde birden çok Sprint'ten geçebilir
- Bir İş Öğesi → çok Yorum, çok Ek, çok Aktivite kaydı, çok Bağımlılık
- Bir Doküman → çok İş Öğesine bağlanabilir ve tersi

---

## 9. Ana Kullanıcı Akışları (User Flows)

### Akış A: Yeni proje başlatma

1. Admin/PO bir **Space** oluşturur, "Scrum" şablonunu seçer.
2. Takım üyelerini davet eder, Scrum rollerini atar (PO, SM, Developer'lar).
3. Space ayarlarında sprint süresi, tahmin ölçeği, durum akışı, DoD/DoR belirlenir.
4. Boş **Product Backlog** ve ilk **Sprint** oluşturulmuş şekilde açılır.

### Akış B: Backlog'u hazırlama (PO)

1. PO **Epic**'leri oluşturur (ör. "Kullanıcı Hesap Yönetimi").
2. Her Epic'in altına **Story** yazar (kullanıcı hikayesi formatı + kabul kriterleri).
3. Backlog ekranında story'leri **öncelik sırasına** sürükler.
4. Refinement toplantısında takım story'leri tahminler (story point).

### Akış C: Sprint planlama (SM + PO + Developer'lar)

1. SM yeni **Sprint** oluşturur (ad, tarih, hedef).
2. Planning ekranında backlog'un üstünden story'leri sprint'e sürükler; toplam point ve kapasite göstergesine bakar.
3. Developer'lar story'leri **Task'lara böler**, saat tahmini girer, kendilerine atar.
4. SM **Sprint'i başlatır**; sprint "Aktif" olur.

### Akış D: Sprint süresince çalışma (Developer)

1. Developer "Bana atananlar" veya aktif sprint **Board**'unu açar.
2. Kartı **To Do → In Progress** sürükler, günlük ilerleme ve yorum girer.
3. Gerekirse engel (blocked) işaretler, SM'i mention eder.
4. İş bitince **In Review → Done**; DoD checklist'i tamamlanır.
5. Gün içinde **Burndown** otomatik güncellenir.

### Akış E: Sprint kapanışı

1. Sprint bitiş tarihi gelince SM **Sprint'i tamamlar**.
2. Bitmeyen öğeler için "Sonraki sprint'e taşı / Backlog'a gönder" kararı verilir.
3. **Sprint Review** özeti çıkar, paydaşlara gösterilir.
4. **Retrospektif** yapılır, aksiyonlar yeni sprint'e görev olarak eklenir.
5. **Velocity** grafiği güncellenir.

### Akış F: Yönetici izleme

1. Yönetici **Dashboard**'u açar: aktif sprint durumu, velocity trendi, epic ilerlemeleri, açık bug sayısı.
2. İlgili Epic'e girip Roadmap/Gantt üzerinde tarihleri görür.
3. Raporu dışa aktarır veya paylaşır.

### Akış G: Doküman ve görev bağlantısı

1. PO bir Epic için **PRD sayfası** oluşturur (şablondan).
2. Sayfaya Epic'i ve story'leri bağlar, gömülü "açık işler" listesini ekler.
3. Ekip dokümana yorum yapar; karar kaydı sayfası açar.

---

## 10. Ekran / Sayfa Listesi

1. Giriş / Kayıt / Şifre sıfırlama
2. Workspace seçimi ve Ana sayfa (Home): bana atananlar, son aktivite, yaklaşan teslimler, favoriler
3. Sol gezinme çubuğu (Workspace → Space → Folder → List ağacı), üst arama, bildirim ikonu, kullanıcı menüsü
4. Space ana sayfası (özet): aktif sprint, backlog özeti, son aktivite
5. **Product Backlog** ekranı
6. **Sprint Planning** ekranı (backlog | sprint ikili görünüm)
7. **Aktif Sprint / Board** ekranı
8. List / Table / Calendar / Gantt / Roadmap görünümleri
9. **Görev detay** (yan panel veya tam sayfa): tüm alanlar, yorumlar, aktivite
10. **Epic detay** sayfası
11. Sprint listesi ve **Sprint Review / Retrospektif** sayfaları
12. **Raporlar** (Burndown, Velocity, CFD, vb.)
13. **Dashboard**
14. **Docs**: doküman listesi, doküman editörü, sürüm geçmişi
15. **Bildirim merkezi**
16. **Arama sonuçları**
17. Space ayarları (üyeler, roller, durumlar, özel alanlar, DoD/DoR, sprint ayarları)
18. Workspace ayarları (üyeler, roller, genel)
19. Kullanıcı profili ve kişisel ayarlar
20. Arşiv / Çöp kutusu
21. Hata, boş durum ve yükleniyor ekranları (empty states)

---

## 11. Kullanılabilirlik (UX) Beklentileri

- **Sürükle-bırak** her yerde mümkün olduğunca: backlog sıralama, sprint'e alma, board'da durum, Gantt'ta tarih.
- **Klavye kısayolları:** hızlı görev oluşturma (`C`), arama (`/` veya `Ctrl+K`), görevi aç, durum değiştir vb. Komut paleti (command palette) [F2].
- **Satır içi düzenleme:** başlık, durum, atanan, tarih listeden çıkmadan değişebilmeli.
- **Yan panel görev detayı:** Listeden çıkmadan görevi açıp düzenleme.
- **Boş durum ekranları:** Yeni kullanıcıya ne yapacağını gösteren yönlendirmeli ekranlar, ilk kullanım turu (onboarding).
- **Geri alma (Undo):** Silme/taşıma gibi işlemlerde "geri al" imkânı.
- **Tutarlı görsel dil:** Tip ikonları (Epic/Story/Task/Bug), öncelik renkleri, durum rozetleri her yerde aynı.
- **Açık/koyu tema.**
- **Duyarlı (responsive) tasarım:** Masaüstü öncelikli, tablet ve mobil tarayıcıda kullanılabilir.
- **Büyük listelerde akıcılık:** Yüzlerce/binlerce görevde kasmayan liste ve board.

---

## 12. Fonksiyonel Olmayan Gereksinimler

> Bunlar **hedef/beklentidir**. Nasıl sağlanacağı mimari konuşmasında belirlenecek.

- **Performans:** Sık yapılan işlemler (görev oluşturma, durum değiştirme, sayfa geçişi) kullanıcıya anlık hissettirmeli. Büyük backlog'larda (binlerce öğe) gezinme akıcı olmalı.
- **Güvenlik:** Kimlik doğrulama, yetkilendirme (her istek rol/izin kontrolü), şifrelerin güvenli saklanması, yaygın web zafiyetlerine (XSS, CSRF, injection, yetkisiz erişim) karşı koruma, dosya yükleme güvenliği, oran sınırlama.
- **Çok kiracılık (multi-tenancy) / Veri izolasyonu:** Bir workspace'in verisi başka workspace'ten kesinlikle erişilemez olmalı.
- **Denetlenebilirlik:** Önemli işlemlerin (yetki değişikliği, silme, sprint iptali) kaydı tutulmalı.
- **Güvenilirlik ve veri kaybı önleme:** Yedekleme stratejisi, çöp kutusu, sürüm geçmişi.
- **Ölçeklenebilirlik:** Yüzlerce kullanıcı ve çok sayıda iş öğesine rahatça büyüyebilmeli.
- **Eşzamanlılık:** Aynı görev/dokümanı birden çok kişi düzenlerken çakışmalar yönetilmeli (en azından uyarı, ileride canlı birlikte düzenleme).
- **Erişilebilirlik:** Klavye ile gezinme, yeterli kontrast, ekran okuyucu uyumu (temel seviye).
- **Uluslararasılaştırma (i18n):** Arayüz **Türkçe ve İngilizce**; tarih/saat/sayı biçimleri ve saat dilimi desteği.
- **Gözlemlenebilirlik:** Hata kaydı ve temel izleme.
- **Taşınabilirlik:** Verileri dışa aktarabilme (CSV/JSON).
- **Test edilebilirlik:** Kritik iş kuralları (özellikle Bölüm 6) otomatik testlerle korunmalı.
- **Dokümantasyon:** Kurulum, geliştirici ve kullanıcı dokümantasyonu.

---

## 13. Başarı Ölçütleri

- Bir ekip, uygulamayı kullanarak **baştan sona bir Scrum sprinti** (planlama → günlük takip → review → retro) yönetebilmeli.
- Yönetici, **tek ekrandan** ekibin ilerlemesini anlayabilmeli.
- Yeni bir kullanıcı **15 dakika içinde** ilk görevini oluşturup sprint'e alabilmeli.
- Ekip, mevcut araçlardaki temel iş akışlarını (backlog, sprint, board, rapor, doküman) bu uygulamada **eksiksiz** yürütebilmeli.

---

## 14. Geliştirme Fazları (Yol Haritası Önerisi)

> Bu bir öneridir. Projeye başlarken birlikte netleştirip gerekirse güncelleyeceğiz.

**Faz 0: Keşif ve Karar (kod yok)**

- Brief'in okunması, soruların sorulması (Bölüm 18)
- Mimari ve teknoloji kararları, karar kaydı
- Proje iskeleti, geliştirme standartları, test stratejisi
- Basit tasarım sistemi/arayüz taslakları

**Faz 1: Temel (Çekirdek)**

- Kimlik doğrulama, kullanıcı, workspace, davet
- Rol/yetki altyapısı
- Space/Folder/List hiyerarşisi
- İş öğesi (Epic/Story/Task/Sub-task/Bug) CRUD, görev detay sayfası
- List ve Table görünümü, filtre/arama
- Yorum, ek, aktivite geçmişi

**Faz 2: Scrum Çekirdeği**

- Product Backlog, sıralama
- Sprint yaşam döngüsü, Sprint Planning ekranı
- Board (Kanban) görünümü, sürükle-bırak
- DoD/DoR, tahmin
- Burndown ve Velocity raporları
- Bildirimler ve @mention

**Faz 3: Docs ve Epic/Roadmap**

- Doküman modülü, sürüm geçmişi, görev bağlama
- Epic detay ve ilerleme
- Retrospektif, Sprint Review sayfaları

**Faz 4: Planlama ve Gelişmiş Görünümler**

- Gantt/Timeline, bağımlılıklar, kritik yol
- Takvim, Roadmap, Workload
- Zaman takibi
- Dashboard, gelişmiş raporlar (CFD, Lead/Cycle Time)

**Faz 5: Esneklik ve Otomasyon**

- Özel alanlar, özel durum akışları, şablonlar
- Otomasyonlar, WIP limiti, kayıtlı görünümler
- İçe/dışa aktarma

**Faz 6: Entegrasyon ve İleri Seviye**

- Entegrasyonlar, API, webhook
- Yapay zekâ destekli özellikler
- Mobil deneyim iyileştirmeleri

---

## 15. Kabul Kriterleri (Her Özellik İçin Genel "Bitti" Tanımı)

Bir özellik **bitti** sayılması için:

- [ ] Bu brief'teki ilgili gereksinimi karşılıyor
- [ ] Rol/yetki kuralları doğru uygulanıyor (yetkisiz kullanıcı yapamıyor)
- [ ] Hatalı/boş/uç durumlar ele alınmış (boş liste, geçersiz giriş, ağ hatası)
- [ ] Otomatik testleri yazılmış ve geçiyor (özellikle Scrum iş kuralları)
- [ ] Önemli değişiklikler aktivite/denetim kaydına düşüyor
- [ ] Arayüz Türkçe/İngilizce metin desteğine uygun
- [ ] Performans hedefine uygun (büyük veriyle denendi)
- [ ] Kod incelemeye hazır ve okunabilir; gerekli dokümantasyon güncellendi
- [ ] Karar gerektiren konular `docs/DECISIONS.md` içine işlendi

---

## 16. Terimler Sözlüğü (Tutarlı Kullanılacak)

| Terim                      | Anlamı                                                      |
| -------------------------- | ----------------------------------------------------------- |
| **Workspace**              | Kurum/şirket seviyesindeki en üst çalışma alanı             |
| **Space**                  | Bir takım/ürün/departman alanı                              |
| **Folder / List**          | Organizasyon kapları; List görevleri tutar                  |
| **Epic**                   | Birden çok sprinte yayılan büyük iş hedefi                  |
| **Story (User Story)**     | Kullanıcı değeri sunan, tek sprintte bitebilen özellik      |
| **Task**                   | Story'yi gerçekleştiren teknik iş parçası                   |
| **Sub-task**               | Task'ın alt adımı                                           |
| **Bug**                    | Hata kaydı                                                  |
| **Product Backlog**        | Ürünle ilgili tüm iş öğelerinin öncelikli listesi           |
| **Sprint Backlog**         | Bir sprint için seçilmiş iş öğeleri                         |
| **Sprint**                 | Sabit süreli (1-4 hafta) çalışma döngüsü                    |
| **Sprint Goal**            | Sprintin tek cümlelik amacı                                 |
| **Increment**              | Sprint sonunda üretilen kullanıma hazır çıktı               |
| **Story Point**            | Göreli büyüklük tahmini birimi                              |
| **Velocity**               | Bir sprintte tamamlanan story point toplamı                 |
| **Burndown**               | Kalan işin zamanla azalışını gösteren grafik                |
| **CFD**                    | Cumulative Flow Diagram, durum bazlı birikimli akış grafiği |
| **Lead Time / Cycle Time** | Talepten teslime / çalışma başlangıcından teslime süre      |
| **WIP Limit**              | Bir sütunda aynı anda bulunabilecek maksimum iş sayısı      |
| **DoD / DoR**              | Definition of Done / Definition of Ready                    |
| **PO / SM**                | Product Owner / Scrum Master                                |
| **Refinement**             | Backlog öğelerinin detaylandırılması ve tahmini             |
| **Retrospektif**           | Sprint sonunda takımın süreç iyileştirme toplantısı         |
| **Kritik Yol**             | Gecikmesi projeyi geciktiren en uzun görev zinciri          |
| **Baseline**               | Planlanan değerler (gerçekleşenle kıyas için)               |
| **Swimlane**               | Board'da yatay gruplama satırı                              |

---

## 17. Değişiklik Günlüğü (Claude Code Güncelleyecek)

| Tarih       | Değişiklik                                                                                                                         | Onaylayan |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| (başlangıç) | İlk brief oluşturuldu                                                                                                              | -         |
| 2026-10-02  | Bölüm 18 soruları cevaplandı, cevaplar Bölüm 18.1'e işlendi                                                                        | Kullanıcı |
| 2026-10-02  | Mimari ve teknoloji kararları alındı → `docs/DECISIONS.md` (ADR-001…032). Özet: React SPA + NestJS + PostgreSQL, TS monorepo       | Kullanıcı |
| 2026-10-02  | Proje konumu `C:\dev\scrum-manager` (OneDrive dışı), yerel git                                                                     | Kullanıcı |
| 2026-10-02  | ClickUp'tan olası veri taşıma notu eklendi: iş öğesi modelinde `externalSource/externalId` alanları baştan bulunacak; import Faz 5 | Kullanıcı |

---

## 18. Başlamadan Önce Cevaplanması Gereken Açık Sorular

Claude Code, işe başlarken bu soruları bana **madde madde sormalı** ve cevaplara göre bu dosyayı güncellemelidir:

**Ürün ve kapsam**

1. Uygulama sadece şirket içi mi kullanılacak, yoksa ileride başka kurumlara da sunulabilir mi (çok kiracılık ne kadar önemli)?
2. Kaç kullanıcı ve kaç aktif proje hedefleniyor (başlangıç ve 1 yıl sonrası)?
3. MVP için hedef bir tarih veya demo toplantısı var mı?
4. Waterfall/Gantt özellikleri MVP'de mi, sonra mı olmalı (yönetici beklentisi)?
5. Mevcut bir araçtan (Jira, ClickUp, Trello, Excel) veri taşıma ihtiyacı var mı?

**Kullanıcı ve erişim** 6. Giriş yöntemi: sadece e-posta/şifre mi, kurumsal giriş (SSO) gerekli mi? 7. Dış paydaşlar (müşteri/guest) sisteme girecek mi? 8. Arayüz dili sadece TR/EN mi, başka dil gerekir mi?

**Teknik ve operasyonel (kararları birlikte vereceğiz)** 9. Uygulama nerede çalışacak (bulut, şirket içi sunucu)? Dağıtım/barındırma kısıtı var mı? 10. Ekip büyüklüğümüz ve teknoloji tecrübemiz ne? (Teknoloji seçimini etkileyecek) 11. Mobil uygulama bir gereklilik mi, yoksa duyarlı web yeterli mi? 12. E-posta gönderimi, dosya depolama gibi altyapı servisleri için kısıtlar/tercihler var mı? 13. Uyumluluk veya veri yeri gereksinimleri var mı (KVKK vb.)?

**Tasarım** 14. Mevcut bir marka/tasarım kılavuzu veya renk paleti var mı? 15. Referans alınacak ekran görüntüleri/rakip arayüzler (ClickUp, Jira, Linear vb.) paylaşılacak mı?

### 18.1 Cevaplar (2026-10-02)

| #     | Cevap                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Sadece şirket içi. Workspace veri izolasyonu korunur, SaaS altyapısı (kurum kaydı, faturalama) yok.                                      |
| 2     | Başlangıç <50, 1 yıl sonra <200 kullanıcı.                                                                                               |
| 3     | Kesin tarih yok, esnek; kaliteye odak.                                                                                                   |
| 4     | Gantt/Waterfall Faz 2'de (brief'teki gibi).                                                                                              |
| 5     | Belki ClickUp'tan veri taşınacak → import Faz 5; veri modeli buna hazır kurulacak.                                                       |
| 6     | MVP'de e-posta/şifre. SSO sonra (F3), mimari buna açık.                                                                                  |
| 7     | Brief'teki Guest rolü geçerli (sınırlı erişim). Kesin MVP kapsamı Faz 1'de netleşecek.                                                   |
| 8     | Arayüz Türkçe (varsayılan) + İngilizce.                                                                                                  |
| 9     | Şirketin kendi sunucusu. Docker ile taşınabilir kurulum.                                                                                 |
| 10    | Kodu tamamen Claude yazar ve günceller. Teknoloji seçiminde ölçüt: geliştirmesi/güncellemesi kolay.                                      |
| 11    | Duyarlı web yeterli; mobil uygulama gerekmiyor.                                                                                          |
| 12    | Self-host: şirket SMTP sunucusu, dosyalar sunucu diskinde.                                                                               |
| 13    | Uygulama kendi sunucumuzda; ek veri yeri kısıtı yok.                                                                                     |
| 14-15 | Kurumsal tasarım kılavuzu yok. Referans: ClickUp (hiyerarşi, görünümler) + Linear (sade, hızlı, klavye odaklı) + Jira (Scrum ekranları). |
| Ek    | Kod içi isimlendirme İngilizce; arayüz TR/EN; dokümanlar Türkçe.                                                                         |

---

## 19. İlk Görevin (Claude Code İçin Başlangıç Talimatı)

1. Bu dosyayı baştan sona oku.
2. Projeyi **kendi cümlelerinle 10-15 satırda özetle** (neyi, kim için, neden yapıyoruz).
3. **Bölüm 18'deki soruları** bana sor, cevapları bekle.
4. Cevaplardan sonra Faz 0 için bir **keşif planı** öner:
   - Alınması gereken mimari/teknoloji kararlarının listesi (her biri için seçenekler ve önerin)
   - Önerilen proje klasör yapısı ve geliştirme standartları
   - Test ve kod kalitesi yaklaşımı
5. Onayımı almadan **kod yazmaya veya iskelet kurmaya başlama.**
6. `docs/DECISIONS.md` dosyasını oluşturup kararları oraya yazmaya başla.

> Hatırlatma: Bu proje büyük. Küçük, çalışır adımlarla ilerleyelim ve her adımda bu dosyaya geri dönelim.
