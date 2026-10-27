import { BadRequestException } from '@nestjs/common';
import type { AnalyticsGrain } from '@scrum/shared';

/** Analiz servislerinin ortak tarih ve sayı yardımcıları (ADR-143). Gün sınırları Europe/Istanbul. */

export const DAY_MS = 86_400_000;
const TZ = 'Europe/Istanbul';
/** Aralık başına okunacak en çok iş/kayıt sayısı (bellek sınırı). */
export const SCAN_LIMIT = 50_000;
/** En çok kaç gün seçilebilir. */
export const MAX_DAYS = 731;

export const dayKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
/** Türkiye'de yaz/kış saati yok: gün başı her zaman +03:00. */
export const dayStart = (key: string) => new Date(`${key}T00:00:00+03:00`);
export const addDays = (key: string, n: number) =>
  new Date(new Date(`${key}T12:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / DAY_MS,
  );
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Haftanın Pazartesi'si (YYYY-MM-DD). */
export function weekStart(key: string): string {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = Pazar
  return addDays(key, -((dow + 6) % 7));
}
export const monthStart = (key: string) => `${key.slice(0, 7)}-01`;

/** Sıralı değerlerde yüzdelik (0–1); boşsa null. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

/** Seçili aralık ve hemen öncesindeki eşit uzunlukta dönem. */
export interface Span {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  grain: AnalyticsGrain;
}

export function spanOf(
  q: { from?: string | undefined; to?: string | undefined; grain: AnalyticsGrain },
  now = new Date(),
): Span {
  const to = q.to ?? dayKey(now);
  const from = q.from ?? addDays(to, -89);
  const days = diffDays(from, to) + 1;
  if (days < 1 || days > MAX_DAYS) throw new BadRequestException('Geçersiz tarih aralığı');
  const prevTo = addDays(from, -1);
  return { from, to, prevFrom: addDays(prevTo, -(days - 1)), prevTo, grain: q.grain };
}
