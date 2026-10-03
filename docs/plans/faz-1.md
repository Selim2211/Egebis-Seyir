# Faz 1 Planı — Temel (Çekirdek)

> Kapsam: brief §14 Faz 1. Taslaklar: https://claude.ai/artifact/JZHazVU9fToiCPEw8FTkgZ
> Branch: `feat/faz-1`. Her adım sonunda: testler yeşil, ekranda görülebilir çıktı, kısa özet.

## Adımlar

| #   | Adım                                   | İçerik                                                                                                                                                                                                            | Durum      |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1.1 | Kimlik, workspace, davet, yetki temeli | İlk kurulum, giriş/çıkış, oturumlar, şifre sıfırlama, davetle kayıt, üyeler ve roller, izin guard'ı, tenant kapsamı, kullanıcı menüsü ve tercihler                                                                | Tamamlandı |
| 1.2 | Space / Folder / List                  | Space oluşturma (anahtar, renk, Scrum modu, sprint süresi, tahmin ölçeği, üyeler + Scrum rolleri), varsayılan durumlar (ADR-036), Folder/List CRUD, sıralama, arşiv, favoriler, kenar çubuğu ağacı, Guest kapsamı | Kod tamam  |
| 1.3 | İş öğeleri                             | Epic/Story/Task/Sub-task/Bug modeli, kalıcı okunabilir ID (ADR-033), hiyerarşi kuralları, tahmin (SP/saat), etiketler, atananlar, tarihler, rank, aktivite kaydı, çöp kutusu, kopyala/taşı, toplu düzenleme       | Kod tamam  |
| 1.4 | Görev detayı                           | Yan panel + tam sayfa, satır içi alan düzenleme, açıklama (Tiptap), kabul kriterleri, checklist, alt öğeler, "Task'lara böl", bağlantılar/bağımlılıklar (blocked-by uyarısı), izleyiciler                         | Kod tamam  |
| 1.5 | List ve Table görünümleri              | Gruplama, sıralama, filtre, liste içi arama, sanal kaydırma, satır içi oluşturma (`C`), Table sütun seçimi ve satır içi düzenleme, "Bana atananlar / Oluşturduklarım / İzlediklerim", global arama (FTS)          | Kod tamam  |
| 1.6 | Yorum, ek, aktivite, ana sayfa         | Yorumlar (düzenle/sil/tepki, @mention kaydı), ekler (yerel disk, önizleme, limitler), aktivite akışları, Ana sayfa (bana atananlar, yaklaşan teslimler, favoriler, son aktivite)                                  | Kod tamam  |

Faz 2'ye kalanlar: bildirim merkezi ve e-posta bildirimleri (mention kaydı Faz 1'de tutulur), Board, sprint, backlog sıralaması.

## 1.1 Ayrıntı

**API** (`/api`)

- `GET /setup/status`, `POST /setup` — yalnızca hiç kullanıcı yokken; kurulum anahtarı (açılış logu veya `SETUP_TOKEN`).
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`
- `POST /auth/password/forgot`, `POST /auth/password/reset`, `PATCH /users/me`, `POST /users/me/password`
- `GET /invitations/:token`, `POST /invitations/:token/accept`
- `GET|POST /workspaces/:wid/invitations`, `POST .../:id/resend`, `DELETE .../:id`
- `GET /workspaces/:wid/members`, `PATCH /workspaces/:wid/members/:userId`, `DELETE /workspaces/:wid/members/:userId`

**Web**: `/setup`, `/login`, `/forgot-password`, `/reset-password`, `/invite/$token`, giriş gerektiren kabuk, kullanıcı menüsü (dil, tema, çıkış), Ayarlar › Üyeler, Profil, Tercihler, Oturumlar.

**Testler**: kurulumun bir kez çalışması, giriş/çıkış, CSRF, oturum iptali, sıfırlama sonrası tüm oturumların kapanması, davet → kayıt, izin kontrolü (Member davet edemez), çapraz workspace erişiminin 404 olması; E2E: kurulum → davet → e-postadan kabul → giriş.

## 1.2 Ayrıntı

Kararlar: ADR-039 (açık/özel Space), ADR-040 (yapı yetkileri), ADR-041 (arşiv, çöp 30 gün), ADR-042 (Member Space oluşturma ayarı), ADR-043 (anahtar, durumlar, tahmin ölçeği, varsayılan liste, Guest daveti).

**API** (`/api/workspaces/:wid`)

- `GET /hierarchy`: kenar çubuğu ağacı ve favoriler (görünür, arşivlenmemiş, silinmemiş)
- `POST /spaces`, `GET|PATCH|DELETE /spaces/:id`, `POST /spaces/:id/{move,archive,unarchive,restore}`
- `GET /spaces/:id/members`, `PUT|DELETE /spaces/:id/members/:userId`
- `POST /spaces/:id/folders`, `GET|PATCH|DELETE /folders/:id`, `POST /folders/:id/{move,archive,unarchive,restore}`
- `POST /spaces/:id/lists`, `GET|PATCH|DELETE /lists/:id`, `POST /lists/:id/{move,archive,unarchive,restore}`
- `PUT|DELETE /favorites/:type/:id`, `GET /archive`, `GET|PATCH /settings`
- Davet: Guest için `spaceIds` (en az bir); kabulde Stakeholder üyeliği. Gece işi `trash.purge` (03:30).

**Web**: kenar çubuğu ağacı (aç/kapa, sürükle-bırak sıralama, işlem menüsü, favoriler), Space oluşturma penceresi, Space / Folder / List sayfaları, Space ayarları (genel, üyeler ve Scrum rolleri, durumlar, arşiv/silme), Ayarlar › Genel, Ayarlar › Arşiv ve çöp kutusu, Guest davetinde Space seçimi, arşiv/silmede "Geri al".

## 1.3 Ayrıntı

Kararlar: ADR-044 (model, ID sayacı, çalışma modu), ADR-045 (tahmin), ADR-046 (arşiv/çöp/tamamlanma), ADR-047 (taşıma/kopyalama/toplu).

**API** (`/api/workspaces/:wid`)

- `GET|POST /lists/:listId/items`: liste içi öğeler (rank sırası, alt öğeler dahil) ve oluşturma
- `GET /items/:id`, `GET /items/key/:key` (`MOB-142`, Space'ten bağımsız çözülür), `PATCH /items/:id`
- `POST /items/:id/{move,copy,archive,unarchive,restore}`, `DELETE /items/:id`
- `POST /spaces/:spaceId/items/bulk`: durum, öncelik, atanan ve etiket ekle/çıkar (en çok 200)
- `GET|POST /spaces/:spaceId/labels`, `PATCH|DELETE /labels/:id`
- Gece işi `trash.purge` iş öğelerini de siler; `GET /archive` iş öğelerini de listeler.

**Kurallar** (shared, birim testli): hiyerarşi, tahmin (puan/saat, ölçek), tipe özel alanlar, Space çalışma modu, Epic ilerlemesi, saat rollup, tamamlanma tarihi, ID biçimi.

**Web**: List sayfasında hiyerarşik satırlar, satır içi hızlı oluşturma, satır içi durum ve öncelik (anında yansır), alt öğe ekleme, kopyalama, arşiv/silme + "Geri al", Done'a çekerken açık alt öğe uyarısı, arşiv sayfasında iş öğeleri.

**1.4/1.5'e kalanlar**: görev detay sayfası ve paneli, açıklama editörü, kabul kriterleri, checklist, bağlantılar/bağımlılıklar, "Task'lara böl", izleyiciler; toplu seçim arayüzü, filtre/gruplama, Table görünümü, klavye kısayolu (`C`). Toplu düzenleme ve taşıma şimdilik yalnızca API'de.

## 1.4 Ayrıntı

Kararlar: ADR-048 (açıklama: Tiptap JSON, düz metin kopyası, XSS kuralı), ADR-049 (kabul kriterleri ve checklist), ADR-050 (bağlantılar, engelleyen uyarısı), ADR-051 (izleyiciler, "Task'lara böl").

**API** (`/api/workspaces/:wid`)

- `PATCH /items/:id` artık `description` (Tiptap belgesi veya `null`) kabul eder; sunucu izinli düğüm/işaret listesini ve boyutu doğrular.
- `GET /items/:id` ve `/items/key/:key` yanıtı: açıklama, checklist'ler (kabul kriterleri önce), bağlantılar (görünmeyen Space'ler gizli), izleyici sayısı ve "izliyor mu".
- `POST|PATCH|DELETE /items/:id/checklists[/:cid]`, `POST|PATCH|DELETE .../checklists/:cid/entries[/:eid]` (`:cid = acceptance` kabul kriterlerine yazar)
- `POST /items/:id/links`, `DELETE /items/:id/links/:linkId`: `BLOCKS`, `BLOCKED_BY`, `RELATES_TO`, `DUPLICATES`, `DUPLICATED_BY`
- `PUT|DELETE /items/:id/watch`, `POST /items/:id/split` (Story → Task'lar), `GET /items/search?q=` (başlık veya `MOB-12`)
- Engelleyeni bitmemiş öğe NOT_STARTED → ACTIVE'e çekilirken `409 WORK_ITEM_BLOCKED` (`force` ile geçilir). Kopyalamada checklist'ler gelir.

**Web**: Listede başlığa tıklayınca yan panel (`?item=MOB-12`, paylaşılabilir), `/items/MOB-12` tam sayfa; başlık ve özellikler yerinde düzenlenir (durum, öncelik, atanan, tarihler, Story Point/saat, etiketler, Bug ve Epic alanları); Tiptap açıklama editörü (otomatik kayıt); kabul kriterleri ve checklist'ler; alt öğeler ve "Task'lara böl"; bağlantılar ve engelleyen uyarısı; izleme; kopyala/arşivle/sil.

**1.5/1.6'ya kalanlar**: açıklamada görsel, tablo ve @mention (1.6, ek altyapısıyla), yorumlar, ekler ve aktivite akışı (1.6), filtre/gruplama/Table (1.5), toplu seçim arayüzü ve taşıma penceresi (1.5), bildirim gönderimi (Faz 2; izleyici kaydı şimdiden tutuluyor).

## 1.5 Ayrıntı

Kararlar: ADR-052 (görünüm durumu adreste, süzme/gruplama istemcide, sanallaştırma), ADR-053 (global arama: Türkçe FTS + trigram), ADR-054 ("Bana atananlar / Oluşturduklarım / İzlediklerim").

**API** (`/api/workspaces/:wid`)

- `GET /search?q=`: görülebilen Space'lerde başlık (ön ek ve parça), açıklama ve `MOB-12` kimliği; en çok 20 sonuç, satır bağlamıyla (Space, List, durum). Migration `20261002220000_search_indexes` GIN dizinlerini ekler.
- `GET /my-work?scope=assigned|created|watching&includeDone=`: tüm görünür Space'lerden, bitiş tarihine göre (en çok 500).

**Web**

- **List ve Table** sekmeleri (adreste `view=table`); Board F2.
- **Araç çubuğu:** liste içi arama, süzgeçler (durum, öncelik, tip, atanan, etiket, bitiş), sıralama (elle, başlık, kimlik, durum, öncelik, bitiş, başlangıç, tahmin, oluşturulma), gruplama (durum, atanan, öncelik, tip, bitiş). Hepsi adreste; paylaşılabilir. Süzgeç, sıralama veya gruplama yokken satırlar hiyerarşik, varken düz.
- **Table:** seçilebilir sütunlar (cihaza özel), sütun başlığından sıralama, satır içi durum, öncelik, tarih ve tahmin düzenleme.
- **Toplu düzenleme:** satır seçimi, "görünen tümünü seç", durum/öncelik/atanan/etiket çubuğu; Done'a çekerken açık alt öğe uyarısı.
- **Kısayollar:** `C` hızlı oluşturmaya odaklanır; `Ctrl/Cmd+K` veya `/` global aramayı açar (ok tuşları + Enter).
- **Büyük listeler:** 100 satırı aşınca sanal kaydırma.
- **Benim işlerim** sayfası (kenar çubuğundaki "Bana atananlar"), bitiş tarihi kovalarına göre gruplu.

**Kalanlar**: Başka List/Space'e taşıma penceresi, kayıtlı filtreler (F2), 5.000'i aşan List'lerde sunucu tarafı sayfalama (F2, ADR-052), Ana sayfa özetleri (1.6).

## 1.6 Ayrıntı

Kararlar: ADR-055 (yorumlar, @mention kaydı, tepkiler), ADR-056 (dosya ekleri, güvenli sunum), ADR-057 (aktivite akışları), ADR-058 (Ana sayfa), ADR-059 (profil fotoğrafı).

**API** (`/api/workspaces/:wid`, fotoğraf için `/api/users`)

- Yorumlar: `GET|POST /items/:id/comments`, `PATCH|DELETE .../:commentId`, `PUT .../:commentId/reactions`, `GET /items/:id/mention-candidates?q=`
- Ekler: `POST /items/:id/attachments` (çok parçalı, alan `file`), `GET|DELETE /items/:id/attachments/:attId` (`?preview=1` yalnızca resim/PDF'te satır içi)
- Aktivite: `GET /items/:id/activity?before=` ve `GET /activity?limit=` (görülebilen Space'ler)
- Fotoğraf: `POST|DELETE /users/me/avatar`, `GET /users/:id/avatar` (yalnızca ortak workspace)
- Öğe detayı artık ekleri ve yorum sayısını da döndürür; atanan/üye/kullanıcı kayıtlarında `avatarVersion` vardır.
- Yapılandırma: `UPLOAD_DIR` (Docker'da kalıcı volume), `MAX_UPLOAD_MB` (varsayılan 25). Gece işi çöp kutusundan silinen öğelerin ek dosyalarını diskten de siler.

**Web**: Detayda Yorumlar ve Aktivite sekmeleri (zengin metin, `@` ile etiketleme, tepkiler, düzenle/sil), Ekler bölümü (sürükle-bırak, resim önizleme, indirme), Ana sayfa (bana atananlar, yaklaşan teslimler, favoriler, son aktivite), Profil'de fotoğraf (kare kırpma ve küçültme istemcide), fotoğraflar kullanıcı menüsü, üye listeleri, atananlar ve yorumlarda.

**Faz 2'ye**: bildirim gönderimi (mention, izleyici kayıtları hazır), açıklamada görsel/tablo, Space/List düzeyi aktivite akışı.

## Doğrulama durumu

**2026-10-03:** Yerel PostgreSQL 18 ile (Docker'sız) 7 migration dev ve test DB'ye uygulandı; `pnpm test:int` 9 dosya / 104 test yeşil. Bulgular: DB C locale ile oluşturulunca Türkçe arama çalışmıyor (`LOCALE 'en-US'` şart, bkz. CLAUDE.md); test düzeltmeleri (Guest daveti Space ister, dosya adından yol bileşenleri atılır, avatar POST 200, PDF yanıtında helmet CSP bulunur ama `sandbox` yok). **E2E de çalıştırıldı:** 29 senaryo yeşil; yalnızca `faz1-auth` Mailpit (Docker) gerektirdiği için bekliyor. E2E ilk kez koşunca bulunan gerçek hatalar: uygulama açılışta OpenAPI dokümanı üretirken düşüyordu (`RichTextSchema` `z.custom` idi; `openapi.int-spec.ts` regresyon testi eklendi), liste satırındaki başlık yan paneli açmıyor tam sayfaya gidiyordu (`ItemNavContext` sağlayıcısı eksikti), alt öğe hızlı oluşturma alanı asıl başlık alanıyla aynı erişilebilir ada sahipti. Geri kalan düzeltmeler test beklentileriydi. Hâlâ açık: Mailpit gerektiren giriş/davet E2E'si, EXPLAIN, elle/görsel kontroller, UPLOAD_DIR volume.

Aşağıdaki liste Docker kararından kalma; işaretsiz maddelerden migration ve test:int tamamlandı. DB'siz kontroller (lint, typecheck, birim testler, build; 13/13) geçti; aşağıdakiler henüz çalıştırılmadı:

- [ ] Migration'lar `20261002190000_spaces`, `20261002200000_work_items`, `20261002210000_work_item_details`, `20261002220000_search_indexes`, `20261002230000_collaboration` dev ve test DB'ye uygulanır. `prisma migrate dev` şema farkı bildirmez (arama dizinleri ifade dizinidir; Prisma bunları görmezden gelmeli, gelmezse `schema.prisma`'ya yorum olarak not düşülür).
- [ ] `pnpm test:int`: yeni `spaces`, `work-items`, `work-item-details`, `search`, `collab` testleri. Arama testi `turkish` metin arama yapılandırmasının var olduğunu varsayar. Dosya testleri `UPLOAD_DIR`'e (geçici klasör) yazar; multer sınırı testte 1 MB.
- [ ] `pnpm test:e2e`: yeni `faz1-spaces`, `faz1-items`, `faz1-detail`, `faz1-views`, `faz1-collab` ve güncellenen `faz1-auth` senaryoları.
- [ ] Arama sorgusunun dizinleri kullandığı: `EXPLAIN` ile bakılır (özellikle `to_tsvector('turkish', …)` ifadesi dizin ifadesiyle birebir aynı olmalı).
- [ ] Tarayıcıda görsel ve elle kontrol: kenar çubuğu ağacı, sürükle-bırak, List/Table, 500+ öğeyle sanal kaydırma, yan panel, Tiptap editörleri, **@mention açılır listesi konumu (yan panel içinde)**, sürükle-bırak dosya yükleme, **PDF önizlemenin tarayıcıda açılması**, profil fotoğrafı kırpma, Ana sayfa, global arama, koyu tema, mobil genişlik.
- [ ] Docker'da `UPLOAD_DIR` için kalıcı volume ve yedekleme kapsamı (docker/compose üretim dosyası yazılırken).
