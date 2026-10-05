# Faz 6 Planı — Entegrasyon ve İleri Seviye

> Kapsam: brief §14 Faz 6 (§5.18 entegrasyonlar/API, §5.19 yapay zekâ, mobil iyileştirme). Branch: `feat/faz-6` (Faz 5 üzerinden). Dış servis hesabı gerektirmeyen, kendi sunucuda çalışan parçalar önce; dış servise giden her şey ayar kapalıyken devre dışı ve testte sahte sağlayıcıyla doğrulanır.

| #   | Adım                        | İçerik                                                                                                                           | Durum      |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 6.1 | Kişisel API token'ları      | Bearer token ile herkese açık API; salt okunur seçeneği, süre, iptal; token ile oturum/şifre/token uçları yasak                  | Tamamlandı |
| 6.2 | Giden webhook'lar           | Space/Workspace webhook'u: olay seçimi, HMAC imzası, teslimat günlüğü, yeniden deneme                                            | Sırada     |
| 6.3 | Slack/Teams bildirimi       | Gelen webhook URL'sine olay mesajı (Space başına), webhook altyapısı üzerinde                                                    | Bekliyor   |
| 6.4 | GitHub/GitLab bağlantısı    | Gelen webhook (imzalı): commit/PR/MR metnindeki `PRJ-142` anahtarını göreve bağlar, aktivite ve detayda görünür                  | Bekliyor   |
| 6.5 | Yapay zekâ destekli özellik | Sağlayıcı soyutlaması (Anthropic API anahtarı ayarda); özet, story + kabul kriteri önerisi, Epic bölme önerisi; kapalıyken gizli | Bekliyor   |
| 6.6 | Mobil deneyim               | (sonra) duyarlı iyileştirmeler, dokunmatik hedefler, klavye alternatifleri                                                       | Bekliyor   |

## 6.1 Ayrıntı

Karar: ADR-086. `api_tokens` (SHA-256 özet, önek, salt okunur, süre, son kullanım, iptal). `POST/GET/DELETE /api/tokens` yalnızca oturumla. AuthGuard: cookie yoksa `Authorization: Bearer smt_…`; token ile `/auth*` ve `/tokens*` yasak (403 `TOKEN_NOT_ALLOWED`), salt okunur token yazamaz (403 `TOKEN_READ_ONLY`), CSRF atlanır. Web: Ayarlar → API erişimi.

**Doğrulama (2026-10-05):** `api-tokens.int-spec` 5; Playwright `faz6-api-tokens` 1/1.
