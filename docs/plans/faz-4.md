# Faz 4 Planı — Planlama ve Gelişmiş Görünümler

> Kapsam: brief §14 Faz 4 (Gantt/Timeline, bağımlılıklar, kritik yol; Takvim, Roadmap, Workload; zaman takibi; Dashboard, gelişmiş raporlar). Branch: `feat/faz-4` (Faz 3 üzerinden).
> Kararlar: geliştirici varsayılanı; kullanıcı onayı bekleyenler `docs/DECISIONS.md` içinde işaretli.

| #   | Adım                           | İçerik                                                                                                               | Durum      |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| 4.1 | Roadmap                        | Space'te Epic'lerin zaman ekseninde çubukları (ilerleme dolgulu), sprint bandı, bugün çizgisi, tarihsiz Epic listesi | Tamamlandı |
| 4.2 | Takvim görünümü                | Görevlerin bitiş/başlangıç tarihine göre ay/hafta takvimi, sürükleyerek tarih değiştirme                             | Sırada     |
| 4.3 | Zaman takibi                   | Görevde süre kaydı (zamanlayıcı ve elle giriş), kişi/gün özeti                                                       | Bekliyor   |
| 4.4 | Workload                       | Kişi bazlı iş yükü (puan/saat, kapasiteye karşı)                                                                     | Bekliyor   |
| 4.5 | Gantt ve bağımlılık            | Görev çubukları, bağımlılık okları, kritik yol                                                                       | Bekliyor   |
| 4.6 | Dashboard ve gelişmiş raporlar | Widget'lı pano, CFD, lead/cycle time, burn-up                                                                        | Bekliyor   |

## 4.1 Ayrıntı

Karar: ADR-072.

**API**: yeni uç yok; `GET spaces/:spaceId/epics` (ADR-068) ve `GET spaces/:spaceId/sprints` yeterli. Zaman ekseni hesabı `packages/shared/src/domain/timeline.ts` (saf: `timelineRange`, `timelineMonths`, `barPlacement`, `todayPosition`).

**Web**: Scrum sekmelerine "Roadmap" (`/spaces/:id/roadmap`): ay sütunlu eksen, sprint bandı (aktif dolgulu, tamamlanan soluk, planlı kesikli), Epic çubukları (renk, ilerleme dolgusu, tek tarihli Epic işaret), bugün çizgisi, tarihsiz Epic'ler ayrı listede.

**Doğrulama (2026-10-03):** shared `timeline` 9 test; Playwright `faz4-roadmap` 1/1.
