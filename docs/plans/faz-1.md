# Faz 1 Planı — Temel (Çekirdek)

> Kapsam: brief §14 Faz 1. Taslaklar: https://claude.ai/artifact/JZHazVU9fToiCPEw8FTkgZ
> Branch: `feat/faz-1`. Her adım sonunda: testler yeşil, ekranda görülebilir çıktı, kısa özet.

## Adımlar

| #   | Adım                                   | İçerik                                                                                                                                                                                                            | Durum      |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1.1 | Kimlik, workspace, davet, yetki temeli | İlk kurulum, giriş/çıkış, oturumlar, şifre sıfırlama, davetle kayıt, üyeler ve roller, izin guard'ı, tenant kapsamı, kullanıcı menüsü ve tercihler                                                                | Tamamlandı |
| 1.2 | Space / Folder / List                  | Space oluşturma (anahtar, renk, Scrum modu, sprint süresi, tahmin ölçeği, üyeler + Scrum rolleri), varsayılan durumlar (ADR-036), Folder/List CRUD, sıralama, arşiv, favoriler, kenar çubuğu ağacı, Guest kapsamı | Sırada     |
| 1.3 | İş öğeleri                             | Epic/Story/Task/Sub-task/Bug modeli, kalıcı okunabilir ID (ADR-033), hiyerarşi kuralları, tahmin (SP/saat), etiketler, atananlar, tarihler, rank, aktivite kaydı, çöp kutusu, kopyala/taşı, toplu düzenleme       | Bekliyor   |
| 1.4 | Görev detayı                           | Yan panel + tam sayfa, satır içi alan düzenleme, açıklama (Tiptap), kabul kriterleri, checklist, alt öğeler, "Task'lara böl", bağlantılar/bağımlılıklar (blocked-by uyarısı), izleyiciler                         | Bekliyor   |
| 1.5 | List ve Table görünümleri              | Gruplama, sıralama, filtre, liste içi arama, sanal kaydırma, satır içi oluşturma (`C`), Table sütun seçimi ve satır içi düzenleme, "Bana atananlar / Oluşturduklarım / İzlediklerim", global arama (FTS)          | Bekliyor   |
| 1.6 | Yorum, ek, aktivite, ana sayfa         | Yorumlar (düzenle/sil/tepki, @mention kaydı), ekler (yerel disk, önizleme, limitler), aktivite akışları, Ana sayfa (bana atananlar, yaklaşan teslimler, favoriler, son aktivite)                                  | Bekliyor   |

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
