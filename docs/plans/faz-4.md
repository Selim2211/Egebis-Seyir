# Faz 4 Planı — Planlama ve Gelişmiş Görünümler

> Kapsam: brief §14 Faz 4 (Gantt/Timeline, bağımlılıklar, kritik yol; Takvim, Roadmap, Workload; zaman takibi; Dashboard, gelişmiş raporlar). Branch: `feat/faz-4` (Faz 3 üzerinden).
> Kararlar: geliştirici varsayılanı; kullanıcı onayı bekleyenler `docs/DECISIONS.md` içinde işaretli.

| #   | Adım                           | İçerik                                                                                                               | Durum      |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| 4.1 | Roadmap                        | Space'te Epic'lerin zaman ekseninde çubukları (ilerleme dolgulu), sprint bandı, bugün çizgisi, tarihsiz Epic listesi | Tamamlandı |
| 4.2 | Takvim görünümü                | Görevlerin bitiş/başlangıç tarihine göre ay/hafta takvimi, sürükleyerek tarih değiştirme                             | Tamamlandı |
| 4.3 | Zaman takibi                   | Görevde süre kaydı (zamanlayıcı ve elle giriş), kişi/gün özeti                                                       | Tamamlandı |
| 4.4 | Workload                       | Kişi bazlı iş yükü (puan/saat, kapasiteye karşı)                                                                     | Tamamlandı |
| 4.5 | Gantt ve bağımlılık            | Görev çubukları, bağımlılık okları, kritik yol                                                                       | Sırada     |
| 4.6 | Dashboard ve gelişmiş raporlar | Widget'lı pano, CFD, lead/cycle time, burn-up                                                                        | Bekliyor   |

## 4.1 Ayrıntı

Karar: ADR-072.

**API**: yeni uç yok; `GET spaces/:spaceId/epics` (ADR-068) ve `GET spaces/:spaceId/sprints` yeterli. Zaman ekseni hesabı `packages/shared/src/domain/timeline.ts` (saf: `timelineRange`, `timelineMonths`, `barPlacement`, `todayPosition`).

**Web**: Scrum sekmelerine "Roadmap" (`/spaces/:id/roadmap`): ay sütunlu eksen, sprint bandı (aktif dolgulu, tamamlanan soluk, planlı kesikli), Epic çubukları (renk, ilerleme dolgusu, tek tarihli Epic işaret), bugün çizgisi, tarihsiz Epic'ler ayrı listede.

**Doğrulama (2026-10-03):** shared `timeline` 9 test; Playwright `faz4-roadmap` 1/1.

## 4.2 Ayrıntı

Karar: ADR-074.

**Web**: List sayfasında "Takvim" sekmesi (`?view=calendar`): aylık ızgara, ay gezinme ve "Bugün", sürükle-bırak ile tarih kaydırma, tarihsiz öğe listesi. API değişikliği yok (`PATCH items/:id` tarihleri yazar). Saf hesaplar `packages/shared/src/domain/calendar.ts`.

**Doğrulama (2026-10-03):** shared `calendar` 7 test; Playwright `faz4-calendar` 1/1 (öğe günde görünür, fare ile başka güne sürüklenir, sayfa yenilenince kalıcı).

## 4.3 Ayrıntı

Karar: ADR-075.

**API** (`/api/workspaces/:wid`): `GET|POST items/:itemId/time`, `DELETE items/:itemId/time/:entryId`, `POST items/:itemId/timer/start`, `GET timer`, `POST timer/stop`, `GET spaces/:spaceId/timesheet?from=&to=`. Veri: `time_entries` (CHECK 1–1440), `active_timers`. Saf hesaplar `packages/shared/src/domain/time.ts` (`parseDuration`, `formatMinutes`, `timerMinutes`, `buildTimesheet`).

**Web**: Görev detayında "Zaman" bölümü (sayaç, elle giriş, tahmin çubuğu, giriş listesi); üst çubukta çalışan sayaç; Space ağacında "Zaman çizelgesi" (`/spaces/:id/timesheet`).

**Doğrulama (2026-10-03):** shared `time` 24 test; `time.int-spec` 9 (elle giriş ve doğrulama, alt öğe toplamı, sayaç yaşam döngüsü ve tek sayaç, çizelge, yetki, özel/arşivli Space); Playwright `faz4-time` 3/3.

## 4.4 Ayrıntı

Karar: ADR-076.

**API** (`/api/workspaces/:wid`): `GET spaces/:spaceId/workload?sprintId=` (`report.view`). Saf hesap `packages/shared/src/domain/workload.ts` (`buildWorkload`).

**Web**: Space ağacında "İş yükü" (`/spaces/:id/workload`): kişi satırları, puan ve kalan süre çubukları, geciken/yaklaşan sayıları, bu hafta harcanan süre; sprint süzgeci.

**Doğrulama (2026-10-03):** shared `workload` 6 test; `workload.int-spec` 5 (toplama, kalan süre ve geciken/yaklaşan, eşit paylaşım, sprint süzgeci, özel Space); Playwright `faz4-workload` 1/1.
