import { MAX_ENTRY_MINUTES } from '../constants/time';
import { addDays } from './reports';

/**
 * Süre metnini dakikaya çevirir. Kabul: "90", "1h", "1.5h", "1,5s", "1h 30m", "1s 30dk", "1:30", "45m".
 * Birimsiz sayı dakikadır. Geçersiz ya da 1 dakikadan az / 24 saatten çok ise null.
 */
export function parseDuration(text: string): number | null {
  const input = text.trim().toLowerCase().replace(',', '.');
  if (input === '') return null;
  let minutes: number | null = null;

  const clock = /^(\d{1,3}):([0-5]?\d)$/.exec(input);
  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2]);
  } else if (/^\d+(\.\d+)?$/.test(input)) {
    minutes = Number(input);
  } else {
    const match =
      /^(?:(\d+(?:\.\d+)?)\s*(?:h|s|sa|saat))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|dk|dak|dakika))?$/.exec(
        input,
      );
    if (match && (match[1] !== undefined || match[2] !== undefined)) {
      minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
    }
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return rounded >= 1 && rounded <= MAX_ENTRY_MINUTES ? rounded : null;
}

/** 90 → "1s 30dk" (tr) / "1h 30m" (en); sıfır "0". */
export function formatMinutes(minutes: number, locale: 'tr' | 'en' = 'tr'): string {
  if (minutes <= 0) return '0';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const [hu, mu] = locale === 'tr' ? ['s', 'dk'] : ['h', 'm'];
  return [h > 0 ? `${h}${hu}` : '', m > 0 ? `${m}${mu}` : ''].filter(Boolean).join(' ');
}

/** Sayaçta geçen süre: tam dakikaya yukarı yuvarlanır, en az 1 dk, en çok bir gün. */
export function timerMinutes(startedAt: Date, stoppedAt: Date): number {
  const seconds = Math.max(0, (stoppedAt.getTime() - startedAt.getTime()) / 1000);
  return Math.min(MAX_ENTRY_MINUTES, Math.max(1, Math.ceil(seconds / 60)));
}

export interface TimeEntryLike {
  userId: string;
  day: string;
  minutes: number;
}

export interface TimesheetRow {
  userId: string;
  /** `days` ile aynı sırada, gün başına dakika. */
  perDay: number[];
  total: number;
}

/** Kişi × gün çizelgesi; aralık dışındaki girişler sayılmaz. */
export function buildTimesheet(
  entries: readonly TimeEntryLike[],
  from: string,
  to: string,
): { days: string[]; rows: TimesheetRow[]; dayTotals: number[]; total: number } {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 366; day = addDays(day, 1)) days.push(day);
  const index = new Map(days.map((d, i) => [d, i]));
  const byUser = new Map<string, number[]>();
  for (const entry of entries) {
    const at = index.get(entry.day);
    if (at === undefined) continue;
    const row = byUser.get(entry.userId) ?? days.map(() => 0);
    row[at] = (row[at] ?? 0) + entry.minutes;
    byUser.set(entry.userId, row);
  }
  const rows = [...byUser].map(([userId, perDay]) => ({
    userId,
    perDay,
    total: perDay.reduce((a, b) => a + b, 0),
  }));
  rows.sort((a, b) => b.total - a.total);
  const dayTotals = days.map((_, i) => rows.reduce((sum, r) => sum + (r.perDay[i] ?? 0), 0));
  return { days, rows, dayTotals, total: dayTotals.reduce((a, b) => a + b, 0) };
}
