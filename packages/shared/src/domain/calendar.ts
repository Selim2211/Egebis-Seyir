import { addDays } from './reports';
import { daysBetween, monthStart, nextMonthStart } from './timeline';

/** Takvim ızgarası: haftalar (Pazartesi başlar), her hafta 7 gün; ay dışı günler `inMonth: false`. */
export interface CalendarDay {
  day: string;
  inMonth: boolean;
}

/** 0 = Pazartesi … 6 = Pazar (ISO). */
export function weekdayIndex(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Ayın (YYYY-MM) görünen haftaları; ilk ve son hafta komşu aylarla tamamlanır. */
export function calendarWeeks(month: string): CalendarDay[][] {
  const first = `${month}-01`;
  const end = nextMonthStart(first);
  const gridStart = addDays(first, -weekdayIndex(first));
  const weeks: CalendarDay[][] = [];
  for (let cursor = gridStart; cursor < end; cursor = addDays(cursor, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(cursor, i);
        return { day, inMonth: day >= first && day < end };
      }),
    );
  }
  return weeks;
}

/** Ay kaydırma: `delta` ay ileri/geri (YYYY-MM). */
export function shiftMonth(month: string, delta: number): string {
  let cursor = `${month}-01`;
  for (let i = 0; i < Math.abs(delta); i += 1) {
    cursor = delta > 0 ? nextMonthStart(cursor) : monthStart(addDays(cursor, -1));
  }
  return cursor.slice(0, 7);
}

export interface DatedItem {
  startDate: string | null;
  dueDate: string | null;
}

/** Öğenin takvimde göründüğü günler: başlangıç–bitiş aralığı; tek tarih varsa yalnız o gün. */
export function daysCovered(item: DatedItem): string[] {
  const from = item.startDate ?? item.dueDate;
  const to = item.dueDate ?? item.startDate;
  if (from === null || to === null) return [];
  const count = Math.max(0, daysBetween(from, to)) + 1;
  return Array.from({ length: Math.min(count, 366) }, (_, i) => addDays(from, i));
}

/**
 * Öğeyi `fromDay` gününden `toDay` gününe sürüklemek: tarihler aynı gün sayısı kadar kayar,
 * süre korunur. Yalnızca bitiş tarihi varsa o taşınır.
 */
export function moveItemDates(
  item: DatedItem,
  fromDay: string,
  toDay: string,
): { startDate: string | null; dueDate: string | null } {
  const delta = daysBetween(fromDay, toDay);
  return {
    startDate: item.startDate === null ? null : addDays(item.startDate, delta),
    dueDate: item.dueDate === null ? null : addDays(item.dueDate, delta),
  };
}
