import { addDays } from './reports';

const DAY_MS = 86_400_000;

/** İki gün arasındaki gün sayısı (b − a). */
export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/** Ayın ilk günü (YYYY-MM-01). */
export const monthStart = (day: string): string => `${day.slice(0, 7)}-01`;

/** Bir sonraki ayın ilk günü. */
export function nextMonthStart(day: string): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export interface TimelineRange {
  /** İlk günün tarihi (bir ayın ilk günü). */
  start: string;
  /** Son günün ertesi (bir ayın ilk günü, hariç). */
  end: string;
  days: number;
}

export interface TimelineMonth {
  /** YYYY-MM */
  key: string;
  start: string;
  days: number;
  /** Eksendeki başlangıç ve genişlik, yüzde. */
  left: number;
  width: number;
}

/** Aralığı kapsayan ay sütunları; her biri eksenin yüzdesi olarak konumlanır. */
export function timelineMonths(range: TimelineRange): TimelineMonth[] {
  const months: TimelineMonth[] = [];
  for (let start = range.start; start < range.end; start = nextMonthStart(start)) {
    const days = daysBetween(start, nextMonthStart(start));
    months.push({
      key: start.slice(0, 7),
      start,
      days,
      left: (daysBetween(range.start, start) / range.days) * 100,
      width: (days / range.days) * 100,
    });
  }
  return months;
}

export interface ScheduledSpan {
  startDate: string | null;
  dueDate: string | null;
}

/**
 * Zaman ekseni aralığı: tarihli öğeleri, bugünü ve verilen ek tarihleri kapsayan tam aylar;
 * en az `minMonths` ay (bugünün ayından başlayarak). Hiç tarih yoksa bugünden `minMonths` ay.
 */
export function timelineRange(
  spans: ReadonlyArray<ScheduledSpan>,
  today: string,
  extraDays: ReadonlyArray<string> = [],
  minMonths = 4,
): TimelineRange {
  const days = [
    today,
    ...extraDays,
    ...spans.flatMap((s) => [s.startDate, s.dueDate].filter((d): d is string => d !== null)),
  ];
  const lowest = days.reduce((a, b) => (a < b ? a : b));
  const highest = days.reduce((a, b) => (a > b ? a : b));
  const start = monthStart(lowest);
  let end = nextMonthStart(highest);
  for (let months = 0, cursor = start; months < minMonths; months += 1) {
    cursor = nextMonthStart(cursor);
    if (end < cursor) end = cursor;
  }
  return { start, end, days: daysBetween(start, end) };
}

export interface BarPlacement {
  /** Eksen genişliğinin yüzdesi. */
  left: number;
  width: number;
  /** Tek tarihli öğe: aralık değil işaret (milestone). */
  marker: boolean;
}

/**
 * Öğenin çubuğu. Başlangıç ve bitiş varsa aralık (bitiş günü dahil); yalnızca biri varsa o güne
 * tek günlük işaret; hiçbiri yoksa null (tarihsiz). Aralık dışına taşan kısım kırpılır.
 */
export function barPlacement(range: TimelineRange, span: ScheduledSpan): BarPlacement | null {
  const { startDate, dueDate } = span;
  if (startDate === null && dueDate === null) return null;
  const from = startDate ?? dueDate!;
  const to = addDays(dueDate ?? startDate!, 1);
  const marker = startDate === null || dueDate === null;
  const clippedFrom = from < range.start ? range.start : from;
  const clippedTo = to > range.end ? range.end : to;
  if (clippedTo <= clippedFrom) return null;
  return {
    left: (daysBetween(range.start, clippedFrom) / range.days) * 100,
    width: (daysBetween(clippedFrom, clippedTo) / range.days) * 100,
    marker,
  };
}

/** Bugünün eksendeki konumu (yüzde); aralık dışındaysa null. */
export function todayPosition(range: TimelineRange, today: string): number | null {
  if (today < range.start || today >= range.end) return null;
  return ((daysBetween(range.start, today) + 0.5) / range.days) * 100;
}
