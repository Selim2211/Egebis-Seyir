# Scrum Manager — Sunucuya Kurulum (Docker)

Bu belge uygulamayı tek bir Linux sunucuya Docker Compose ile kurmayı anlatır. Kurulum beş konteynerden oluşur:

| Servis     | Görev                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| `postgres` | PostgreSQL 17 veritabanı (veri `postgres-data` volume'ünde, Türkçe arama için en_US.UTF-8) |
| `migrate`  | Açılışta veritabanı şemasını günceller ve kapanır                                          |
| `api`      | Uygulama sunucusu (NestJS); dosya ekleri `uploads` volume'ünde                             |
| `web`      | Caddy: arayüzü sunar, `/api` isteklerini API'ye iletir, alan adı verilirse HTTPS sağlar    |
| `backup`   | Her gün veritabanı + dosya eklerinin yedeğini `./backups` klasörüne alır                   |

## 1. Gereksinimler

- Linux sunucu (önerilen en az 2 vCPU, 4 GB RAM, 20 GB disk)
- Docker Engine 24+ ve Docker Compose v2 (`docker compose version`)
- HTTPS için: sunucuyu gösteren bir alan adı (DNS A kaydı) ve internetten erişilebilir 80/443 portları
- Şirket SMTP sunucusu bilgileri (davet ve şifre sıfırlama e-postaları için)

## 2. Kurulum

```bash
# 1) Kodu sunucuya alın (git veya arşiv)
git clone <depo-adresi> scrum-manager
cd scrum-manager

# 2) Ayar dosyasını oluşturun ve doldurun
cp .env.example .env
nano .env        # APP_URL, SITE_ADDRESS, POSTGRES_PASSWORD, SMTP_* mutlaka

# 3) Derleyip başlatın (ilk derleme birkaç dakika sürer)
docker compose up -d --build

# 4) Durum
docker compose ps
docker compose logs -f api
```

Tüm servisler `healthy` / `running` olunca tarayıcıda `APP_URL` adresini açın.

### İlk kurulum (önemli)

Uygulama ilk açıldığında **kurulum ekranı** gelir: workspace adı ve ilk yönetici (Owner) hesabı oluşturulur. Kurulum anahtarı kaldırıldığı için (ADR-073) **ilk kurulumu yapan kişi Owner olur**. Bu yüzden:

- Kurulumu, uygulamayı herkese açmadan **hemen** siz yapın.
- Kurulum tamamlanınca bu ekran bir daha açılmaz.

Diğer kullanıcılar Ayarlar → Üyeler'den e-posta ile davet edilir.

## 3. Ayarlar (.env)

| Değişken                          | Açıklama                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `APP_URL`                         | Tarayıcıdaki tam adres, ör. `https://scrum.sirket.com`                                    |
| `SITE_ADDRESS`                    | Alan adı → otomatik HTTPS; `:80` → yalnız HTTP (önünde başka HTTPS vekili varsa)          |
| `COOKIE_SECURE`                   | HTTPS varsa `true`. **Yalnızca HTTP ile** kullanılıyorsa `false` (yoksa giriş yapılamaz)  |
| `POSTGRES_PASSWORD`               | Güçlü, rastgele şifre (`openssl rand -base64 24`)                                         |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | Şirket e-posta sunucusu                                                                   |
| `MAIL_FROM`                       | Gönderen adı ve adresi                                                                    |
| `BACKUP_HOUR`, `BACKUP_KEEP_DAYS` | Günlük yedek saati ve saklama süresi                                                      |
| `WEBHOOK_ALLOW_PRIVATE_HOSTS`     | Webhook'lar iç ağ adreslerine gidebilsin mi (varsayılan hayır)                            |
| `ANTHROPIC_API_KEY`               | Doldurulursa yapay zekâ önerileri açılır; iş metinleri Anthropic API'sine gider (ADR-090) |

`.env` değiştirildikten sonra: `docker compose up -d` (yeniden derleme gerekmez).

### Yalnızca iç ağ / HTTP ile deneme

```env
APP_URL=http://192.168.1.50
SITE_ADDRESS=:80
COOKIE_SECURE=false
```

## 4. Güncelleme

```bash
cd scrum-manager
git pull                      # ya da yeni sürüm arşivini açın
docker compose up -d --build  # migrate servisi şemayı otomatik günceller
docker image prune -f         # eski imajları temizler
```

Güncellemeden önce elle yedek almanız önerilir (aşağıya bakın).

## 5. Yedekleme ve geri yükleme

Yedekler her gün `BACKUP_HOUR` saatinde `./backups` klasörüne yazılır:

- `db-YYYYMMDD-HHMMSS.dump` — veritabanı (pg_dump, custom biçim)
- `uploads-YYYYMMDD-HHMMSS.tar.gz` — dosya ekleri ve profil fotoğrafları

`BACKUP_KEEP_DAYS` günden eskiler silinir. Bu klasörü düzenli olarak sunucu dışına (NAS, nesne depolama) kopyalayın.

```bash
# Anlık yedek
docker compose exec backup /backup.sh once

# Geri yükleme (DİKKAT: mevcut verinin üzerine yazar)
docker compose stop api web
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backups/db-20261005-030000.dump
docker compose run --rm -v "$PWD/backups:/backups" --entrypoint sh backup \
  -c 'rm -rf /data/uploads/* && tar -xzf /backups/uploads-20261005-030000.tar.gz -C /data'
docker compose start api web
```

> Not: `backup` servisinde dosya ekleri salt okunur bağlıdır; geri yükleme komutu bu yüzden ayrı bir `run` ile yazılabilir bağlantı kurar. Gerekirse `docker-compose.yml` içinde `uploads:/data/uploads:ro` satırındaki `:ro` geri yükleme süresince kaldırılabilir.

## 6. Sorun giderme

| Belirti                                 | Kontrol                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Sayfa açılmıyor                         | `docker compose ps`, `docker compose logs web`; 80/443 portları açık mı, DNS doğru mu     |
| Giriş yapınca hemen tekrar giriş ekranı | HTTP kullanılıyorsa `COOKIE_SECURE=false`; `APP_URL` tarayıcıdaki adresle aynı mı         |
| `api` başlamıyor                        | `docker compose logs api` — "Geçersiz ortam değişkenleri" ise `.env` değerlerini düzeltin |
| `migrate` hata verdi                    | `docker compose logs migrate`; veritabanı şifresi ve bağlantısı                           |
| E-posta gitmiyor                        | SMTP bilgileri; `docker compose logs api` içinde mail hataları                            |
| Sertifika alınamadı                     | Alan adı sunucuyu gösteriyor mu, 80 portu internetten erişilebilir mi                     |

Sağlık kontrolü: `curl -s http://localhost/api/health` (veya alan adıyla) → `{"status":"ok","db":"up",...}`.

## 7. Güvenlik notları

- `.env` dosyası şifreler içerir; yalnızca yöneticiler okuyabilmeli (`chmod 600 .env`).
- Veritabanı portu dışarı açılmaz (yalnızca iç Docker ağında).
- Uygulama kendi içinde giriş denemelerine oran sınırı, CSRF koruması, güvenli oturum çerezleri ve güvenlik başlıkları kullanır.
- Kişisel API token'ları (Ayarlar → API erişimi) kullanıcı yetkisiyle çalışır; kullanılmayanları iptal edin.
