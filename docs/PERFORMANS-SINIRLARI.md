# Seyir — Performans Sınırları (Yük Testi, Kasım 2026)

Ölçüm: yerel makine (i5-13420H, 16 GB, Windows), ayrı veritabanı `scrum_load`, production derlemesi, **tek API süreci, 384 MB** (Oracle eşdeğeri). Ham veri: `docs/perf/2026-11/`. Karar kaydı: ADR-174. Word raporu: `Seyir-Yuk-Testi-Raporu.docx`.

## Test verisi (S kademesi)

50 kullanıcı · 20 Proje · 21.283 iş öğesi (400 Epik, 13.563 Task, 4.880 Alt görev, 2.440 Bug) · 60.925 yorum · 50.542 mesaj · 103.074 bildirim · 202.922 aktivite · 39.500 zaman kaydı · 1.000 doküman · 2.000 ek (69 MB). Veritabanı 240 MB.

## Sonuç: eşzamanlı kullanıcı (düşünme süresi 4 sn, gerçek kullanıcı karışımı)

| Eşzamanlı kullanıcı | İlk ölçüm p95 | Düzeltmeler sonrası p95 | Hata                                     |
| ------------------- | ------------- | ----------------------- | ---------------------------------------- |
| 10                  | 140 ms        | 109 ms                  | %0                                       |
| 50                  | 384 ms        | 532 ms                  | %0 (ara sürümde %22: transaction hatası) |
| 100                 | 1.256 ms      | 1.033 ms                | %0                                       |
| 200                 | 2.794 ms      | **1.765 ms**            | %0                                       |
| 400                 | —             | 5.202 ms                | %5,9                                     |

- **Akıcı (p95 < 1 sn): ~100 eşzamanlı aktif kullanıcı.** 200'de kullanılabilir (p95 < 2 sn), 400'de kasıyor. "Eşzamanlı" = aynı anda istek atan; ~1 aktif kullanıcı ≈ 4 sn'de 1 istek. Pratikte 300–500 kayıtlı kullanıcılı bir kurum rahat çalışır.
- 400 VU'daki hataların tamamı hız sınırlayıcı (`429`, IP başına 600 istek/dk — test tek IP'den geldiği için yapay) ve yarış kaynaklı `409` (aynı öğenin durumunu eşzamanlı değiştirme). Gerçek hata değil; yine de tek IP'li ofis ağında (NAT) bu sınır yüksek kullanıcıda gözden geçirilmeli.
- Sınır CPU'dur: Node tek iş parçacığı kullanır. Süreç sayısı gecikmeyi düşürür (p95, okuma): 200 kullanıcıda 1 süreç 2.736 ms → 2 süreç 1.046 ms → 4 süreç 893 ms; 400 kullanıcıda 5.065 → 3.245 → 1.669 ms (`load-scale-*.json`, düzeltmelerden önceki sürüm).

## Yapılan düzeltmeler (ADR-174)

Yazma hatası (havuz kilitlenmesi) giderildi · mesaj listesi N+1 → toplu · kurulum durumu, iş yükü, epik, akış hesapları hafifletildi · boşta sekme sorgulaması seyrekleşti · analiz/yönetici hesapları 4–14× hızlandı (önceki tur) · 30 sn'lik kullanıcı bazlı kısa önbellek · `BACKGROUND_WORKER` ile çok süreç desteği.

## Arayüz ölçümü (büyük proje, ~1.000 öğe)

Backlog: 3.900 DOM düğümü, uzun görev (>50 ms) yok, JS yığını 74 MB. Sayfa geçişleri 0,4–2,7 sn (çoğu sunucu yanıtı: backlog 190 ms, harita 70 ms, 423 KB). Proje başına ~5.000 öğenin üzerinde Backlog/Board/Ağaç sanallaştırması gerekecek (şimdilik gerekmiyor).

## Ofis sunucusu (6 çekirdek, 12 GB, paylaşımlı) için öneri

1. Şimdilik **tek API süreci** + `docker-compose.yml` sınırları (`cpu_shares 512`, 1,5 çekirdek / 1 GB tavan).
2. Yavaşlık hissedilirse `.env`'e `COMPOSE_PROFILES=scale` ve `API_UPSTREAMS=api:3000 api-2:3000` (en çok 1 çekirdek daha).
3. Önce yoğun saatte `htop` ile diğer uygulamaların kullanımına bakın.

## Kapsam dışı / yapılmadı

M kademesi (60 Proje), indeks analizi dışında DB ayar denemesi, tarayıcıda FPS ölçümü, Caddy çok-upstream yapılandırmasının canlı doğrulaması (Docker kapalıydı), ofis sunucusunda hiçbir ölçüm.

## Araçlar

`apps/api/scripts/load/` — `db.cjs` (create/drop/snapshot), `seed.cjs`, `api.cjs`, `single.mjs`, `load.mjs`, `explain.cjs`, `scans.cjs`, `slowsum.cjs`. Betikler yalnızca `scrum_load` / 127.0.0.1 / 3200–3209 portlarına çalışır (`guard.cjs`).
