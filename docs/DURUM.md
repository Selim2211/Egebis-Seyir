# Proje Durumu ve Devir Notu

> Yeni bir Claude Code oturumu buradan başlar. Son güncelleme: **2026-11-21**.
> Kurallar `CLAUDE.md`, kapsam `PROJECT_BRIEF.md`, kararlar `docs/DECISIONS.md` (son: ADR-176).

## 1. Şu anki durum (tek bakışta)

- Dal `main`, uzak `origin` = GitHub `Selim2211/Egebis-Seyir`. Son push: `e211639` (2026-11-20).
- Yönetici 5. tur (13 madde) **bitti**, test edildi, push edildi. **Açık kod işi yok.**
- **Deploy edilmedi.** İş yeri sunucusuna kullanıcı haftada bir kendisi deploy eder. Deploy'da 5 yeni migration çalışır:
  - `20261118100000_ai_switches`
  - `20261119100000_drop_dor`
  - `20261119110000_scrum_roles`
  - `20261119120000_space_icon_image`
  - `20261119130000_space_archives`
- Son test sonucu:
  - Entegrasyon testleri 81 dosya, 525 test, hepsi yeşil.
  - Birim testleri: shared 372, web 93.
  - `tsc` ve `eslint` temiz.

## 2. Doğrulanmamış / kullanıcıya bırakılanlar

- **Tarayıcıda göz ile kontrol yapılmadı**, çünkü giriş gerekiyor. Bakılacak yerler:
  - ayar akordeonunun animasyonu
  - Sprint hedefleri sekmesi (son sprint varsayılan, arama kutusu)
  - proje ikonu yükleme
  - SM/PO rol seçicileri
  - yeni öğe penceresinde atanan seçici
- **Groq'a gerçek AI isteği atılmadı.** Uzun hedef önerisi (2–3 cümle, 160–420 karakter) canlı denenmedi.
- Kullanıcı "en az 64 **kelimelik** açıklama" dedi. Kodda kural **64 karakter**, AI önerisi ise 160–420 karakter. Kelime mi kastedildiği netleşmedi. Sorulursa `SPRINT_GOAL_MIN_LENGTH` (shared `constants/sprint.ts`) ile AI istemine (`apps/api/src/modules/ai/ai.service.ts`) bakılır.
- Masaüstündeki `Egebis-Seyir-Proje-Anlatimi.docx` render edilip kontrol edilmedi.

## 3. Son turların özeti (ayrıntı ADR'lerde)

| Tur / Faz        | ADR     | Özet                                                                                                                                                                                                            |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yönetici 4. tur  | 169–173 | Guest (VIEWER, 30 gün) / Dış kaynak (GUEST, 90 gün); SM = Proje Yöneticisi; yedekler AES-256; dış kaynak yetkisi kişi+proje bazlı; projeyi yedeğe döndürme                                                      |
| Yük testi        | 174     | `docs/PERFORMANS-SINIRLARI.md`: ~100 eşzamanlı kullanıcı akıcı, 200 kullanılabilir; çok süreç (`BACKGROUND_WORKER`); betikler `apps/api/scripts/load/` (yalnız `scrum_load` DB'si)                              |
| AI sprint hedefi | 175     | Hedef yazılırsa ≥64 karakter; "AI ile öner / kontrol et"; Super Admin ana AI anahtarı (`aiEnabled`, `aiSprintGoalEnabled`); SP ölçeği 55'e kadar                                                                |
| Yönetici 5. tur  | 176     | Roller SM/PO/TM; atanan zorunlu; DoR kaldırıldı; arşiv sıkıştırma; proje ikonu resmi; açıklama 1024; akordeon ayarlar; Sprint hedefleri sekmesi; "Tahminsiz"; "Yedekten geri yükle"; yeni öğede Liste alanı yok |

### Yönetici 5. tur — teknik ayrıntılar

- **Roller.** İç anahtarlar korunur:
  - `PROJECT_MANAGER` = Scrum Master
  - yeni `PRODUCT_OWNER` = Product Owner (`TEAM_WORK` + `backlog.rank`)
  - `PROJECT_MEMBER` = Team Member

  Projede en fazla 1 SM + 1 PO olur. `normalizeScrumRoles` (shared) ve `syncScrumRoles` (`space-members.service.ts`) bunu sağlar. `spaces.scrumMasterId/productOwnerId` rollerden türetilir.

- **Atanan zorunlu.** Hata kodu `ASSIGNEE_REQUIRED` (422).
  - Task ve Sub-task'ta her zaman zorunlu. Bug'da yalnız `bug.assign` izni olan için zorunlu. Epic hariç.
  - Atanan kaldırılarak sıfıra indirilemez.
  - İç akışlar muaf: otomasyon, form, CSV, retro, şablon, bug raporu.
- **Arşiv sıkıştırma.**
  - Arşivleme proje içeriğini Brotli ile `space_archives` tablosuna yazar ve canlı tablolardan siler (`BackupService.freezeSpace`). Arşivden çıkarma `thawSpace` ile içeriği geri açar.
  - İskelet tablolar kalır (`ARCHIVE_KEEPS`). Ek dosyaları diskte kalır.
  - Arşivli projede doküman, yorum ve zaman uçları 404 döner.
- **Proje ikonu.**
  - Alan `spaces.iconImageVersion`, servis `SpaceIconService`. Uçlar: `POST/DELETE/GET spaces/:spaceId/icon`.
  - Dosya ≤1 MB olmalı. İstemci 128 px'e küçültür. Hata kodu `SPACE_ICON_INVALID`.
- **AI sağlayıcısı.** `ANTHROPIC_API_KEY` varsa Anthropic kullanılır. Yoksa Gelen Çağrılar (ticket) AI ayarındaki OpenAI uyumlu sağlayıcıya (Groq) düşer: `TicketConfigService.effective`. Yanıttaki `<think>` etiketleri temizlenir.
- **Web.**
  - `components/settings-section.tsx` (akordeon, grid-rows animasyonu)
  - `features/sprints/goals-page.tsx` ve rota `routes/_app/spaces/$spaceId/goals.tsx`
  - `features/spaces/space-icon-upload.tsx`

## 4. Ortamlar

- **Kod:** `C:\dev\scrum-manager`. OneDrive klasöründe yalnızca eski brief ve `.claude/launch.json` var.
- **Yerel DB:** PostgreSQL 18, port 5432, kullanıcı ve şifre `scrum`/`scrum`. Veritabanları:
  - `scrum_dev` (geliştirme)
  - `scrum_test` (int testleri)
  - `scrum_e2e` (e2e testleri)
  - `scrum_load` (yük testi, işten sonra DROP edilir)
- **Docker kullanılmaz.** Kullanıcı izni olmadan imaj indirilmez.
- **Mailpit:** `C:\dev\mailpit\mailpit.exe --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025`.
- **İş yeri sunucusu:** asıl ortam, VPN ile erişilir. Donanımı 6 çekirdek / 12 GB RAM. **Claude dokunmaz.** Deploy'u kullanıcı yapar.
- **Oracle Cloud (Zürih, Always Free):** ek ortam, 2× AMD E2.1.Micro (1 OCPU / 1 GB). API `--max-old-space-size=384` ile çalışır. **Claude dokunmaz, yüklenmez.**
- **Yerelde başlatma:** Önizleme paneli `scrum-dev` (`pnpm -C C:/dev/scrum-manager dev`). API :3000, web :5173. :3000'de kalmış `node dist/main.js` varsa önce kapatılır.

## 5. Çalışırken dikkat (öğrenilmiş dersler)

- **Int testleri:** aynı anda iki `test:int` koşturulmaz, çünkü `scrum_test` paylaşılıyor. Çakışma sahte hatalar üretir. Yapılandırmada `fileParallelism: false` var.
- **Test istemcisi:** `apps/api/test/helpers.ts` içindeki `Client`, Task/Subtask/Bug oluştururken varsayılan olarak kendini atar. Atanansız öğe gereken testler atananı prisma ile temizler.
- **Commit:** lint-staged Windows'ta ~120+ dosyada "command line is too long" hatası verir. Değişiklikler küçük commit'lere bölünür. Hook **asla atlanmaz**.
- **Kodlama:** Türkçe kesme işaretli heredoc bash'i bozar. Dosyalar Write aracıyla yazılır. CRLF dosyalarda dikkat gerekir.
- **Ortam değişkenleri:** `.env` değerleri ve sırlar ekrana basılmaz. Yerel demo şifre dosyası okunmaz.
- **Yeni hata kodu:** `packages/shared/src/errors/codes.ts` içine eklenir, metni `apps/web/src/locales/{tr,en}/common.json` → `errors.X` altına yazılır.
- **graphify:** kod değişince `graphify update .` çalıştırılır.

## 6. Kullanıcıyla çalışma biçimi

- İletişim Türkçe. Kodu Claude yazar. Büyük kararlar seçenek + öneriyle sorulur.
- Yönetici notları "tur" halinde gelir. Her tur için bir faz hafıza notu ve bir ADR yazılır.
- **Commit** iş bitince atılır. **Push yalnızca kullanıcı "pushla" derse** yapılır. Kullanıcı genelde "testler bitince ve sorunlar çözülünce" der.
- Dev DB'de çöp bırakılmaz. Yük ve deney işleri ayrı DB'de yapılır.
- "devam et" denince bu dosyanın §2 bölümüne ve en son faz notuna bakılır.
