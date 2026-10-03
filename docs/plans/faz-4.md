# Faz 4 Planı — Planlama ve Gelişmiş Görünümler

> Kapsam: brief §14 Faz 4 (Gantt/Timeline, bağımlılıklar, kritik yol; Takvim, Roadmap, Workload; zaman takibi; Dashboard, gelişmiş raporlar). Branch: `feat/faz-4` (Faz 3 üzerinden).
> Kararlar: geliştirici varsayılanı; kullanıcı onayı bekleyenler `docs/DECISIONS.md` içinde işaretli.

| #   | Adım                           | İçerik                                                                                                               | Durum      |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| 4.1 | Roadmap                        | Space'te Epic'lerin zaman ekseninde çubukları (ilerleme dolgulu), sprint bandı, bugün çizgisi, tarihsiz Epic listesi | Tamamlandı |
| 4.2 | Takvim görünümü                | Görevlerin bitiş/başlangıç tarihine göre ay/hafta takvimi, sürükleyerek tarih değiştirme                             | Tamamlandı |
| 4.3 | Zaman takibi                   | Görevde süre kaydı (zamanlayıcı ve elle giriş), kişi/gün özeti                                                       | Tamamlandı |
| 4.4 | Workload                       | Kişi bazlı iş yükü (puan/saat, kapasiteye karşı)                                                                     | Tamamlandı |
| 4.5 | Gantt ve bağımlılık            | Görev çubukları, bağımlılık okları, kritik yol                                                                       | Tamamlandı |
| 4.6 | Dashboard ve gelişmiş raporlar | Widget'lı pano, CFD, lead/cycle time, burn-up                                                                        | Tamamlandı |

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

## 4.5 Ayrıntı

Karar: ADR-077.

**API** (`/api/workspaces/:wid`): `GET spaces/:spaceId/gantt` (`space.view`): tarihli işler, bağımlılıklar (BLOCKS), kritik yol, çakışmalar, `canEdit`. Saf hesap `packages/shared/src/domain/schedule.ts` (`analyzeSchedule`, `durationDays`, `shiftSpan`).

**Web**: Space ağacında "Gantt" (`/spaces/:id/gantt`): hiyerarşik satırlar, ay ekseni, çubuklar, SVG bağımlılık okları, kritik yol vurgusu, çakışma ve döngü uyarıları; çubuğu sürükleyerek tarih kaydırma.

**Doğrulama (2026-10-03):** shared `schedule` 8 test; `gantt.int-spec` 6 (tarihli/tarihsiz, kritik yol, çakışma, Epic ilerlemesi, silinen ve dış Space bağlantıları, yetki); Playwright `faz4-gantt` 2/2 (oklar, kritik yol, çakışma uyarısı, fare ile sürükleme kalıcı).

## 4.6 Ayrıntı

Karar: ADR-078.

**API** (`/api/workspaces/:wid`): `GET spaces/:spaceId/flow?days=` (CFD, throughput, lead/cycle, bug trendi); `GET|PUT spaces/:spaceId/dashboard` (kullanıcıya özel düzen); burndown yanıtına burn-up serileri (`total`, `done`). Veri: `dashboard_layouts`. Saf hesaplar `domain/flow.ts`, `domain/dashboard.ts`, `domain/csv.ts`.

**Web**: Space ağacında "Panel" (`/spaces/:id/dashboard`): 8 widget, özelleştirme (gizle/ekle, boyut, sıra), dönem seçici, "CSV indir"; Raporlar'da Burndown/Burn-up sekmesi; zaman çizelgesinde CSV.

**Doğrulama (2026-10-03):** shared `flow` 6, `dashboard`/`csv` 7, `reports` 12; `flow.int-spec` 4 (geçmişten CFD, lead/cycle ve throughput, bug trendi ve Epic hariç, sınırlar ve özel Space), `dashboard.int-spec` 4; Playwright `faz4-dashboard` 4/4.

## Faz 4 kapanışı

4.1–4.6 tamamlandı. Brief §14 Faz 4 maddeleri karşılandı: Gantt/Timeline ve bağımlılıklar (kritik yol dahil), Takvim, Roadmap, Workload, zaman takibi, Dashboard ve gelişmiş raporlar (CFD, lead/cycle time, burn-up, throughput, bug trendi, CSV). Kapsam dışı bırakılanlar: kapasite planlaması (izin günleri), PDF dışa aktarma, çok Space'li pano.
