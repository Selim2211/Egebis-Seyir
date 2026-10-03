import type { StatusCategory } from '../constants/work-item';
import { addDays } from './reports';
import { weekdayIndex } from './calendar';
import { daysBetween } from './timeline';

/** Bir işin durum kategorisi geçmişi (ADR-078): oluşturulma anından itibaren gün gün. */
export interface FlowItem {
  id: string;
  type: string;
  createdDay: string;
  /** Şu anki tamamlanma günü (Done'dayken); değilse null. */
  completedDay: string | null;
  /** Oluşturulduğu andaki kategori. */
  initialCategory: StatusCategory;
  /** Kategori değiştiren geçişler, eskiden yeniye. */
  transitions: ReadonlyArray<{ day: string; category: StatusCategory }>;
}

/** O gün sonundaki kategori; henüz oluşturulmamışsa null. */
export function categoryOn(item: FlowItem, day: string): StatusCategory | null {
  if (day < item.createdDay) return null;
  let category = item.initialCategory;
  for (const t of item.transitions) {
    if (t.day <= day) category = t.category;
    else break;
  }
  return category;
}

export interface CumulativeFlow {
  days: string[];
  notStarted: number[];
  active: number[];
  done: number[];
}

/** Kümülatif akış (CFD): her gün için kategori başına iş sayısı. */
export function cumulativeFlow(
  items: readonly FlowItem[],
  from: string,
  to: string,
): CumulativeFlow {
  const flow: CumulativeFlow = { days: [], notStarted: [], active: [], done: [] };
  for (let day = from; day <= to && flow.days.length < 366; day = addDays(day, 1)) {
    let notStarted = 0;
    let active = 0;
    let done = 0;
    for (const item of items) {
      const category = categoryOn(item, day);
      if (category === 'NOT_STARTED') notStarted += 1;
      else if (category === 'ACTIVE') active += 1;
      else if (category === 'DONE') done += 1;
    }
    flow.days.push(day);
    flow.notStarted.push(notStarted);
    flow.active.push(active);
    flow.done.push(done);
  }
  return flow;
}

/** Haftanın Pazartesi'si. */
export const weekStartOf = (day: string): string => addDays(day, -weekdayIndex(day));

export interface WeeklyCount {
  weekStart: string;
  count: number;
}

/** [from, to] aralığını kapsayan Pazartesi başlangıçlı haftalar. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  for (let w = weekStartOf(from); w <= to && weeks.length < 60; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

/** Hafta başına olay sayısı (verilen günlerden). */
export function countByWeek(
  days: ReadonlyArray<string | null>,
  from: string,
  to: string,
): WeeklyCount[] {
  const weeks = weeksBetween(from, to);
  const counts = new Map(weeks.map((w) => [w, 0]));
  for (const day of days) {
    if (day === null || day < from || day > to) continue;
    const week = weekStartOf(day);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return weeks.map((weekStart) => ({ weekStart, count: counts.get(weekStart) ?? 0 }));
}

export interface CycleStats {
  /** Hesaba giren tamamlanmış iş sayısı. */
  sample: number;
  /** Oluşturulmadan tamamlanmaya, gün. */
  leadAvg: number | null;
  leadMedian: number | null;
  /** İlk Active girişinden tamamlanmaya, gün. */
  cycleAvg: number | null;
  cycleMedian: number | null;
  cycleP85: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const average = (values: number[]) =>
  values.length === 0 ? null : round1(values.reduce((a, b) => a + b, 0) / values.length);

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

/**
 * Lead ve cycle time (brief §5.11): [from, to] içinde tamamlanan işler.
 * Lead = oluşturulma→tamamlanma; cycle = ilk Active→tamamlanma (hiç Active olmadıysa lead ile aynı gün
 * tamamlanmış sayılır: cycle 0 gün). Gün farkı, en az 0.
 */
export function cycleStats(items: readonly FlowItem[], from: string, to: string): CycleStats {
  const lead: number[] = [];
  const cycle: number[] = [];
  for (const item of items) {
    if (item.completedDay === null || item.completedDay < from || item.completedDay > to) continue;
    lead.push(Math.max(0, daysBetween(item.createdDay, item.completedDay)));
    const firstActive = item.transitions.find((t) => t.category === 'ACTIVE')?.day;
    cycle.push(Math.max(0, daysBetween(firstActive ?? item.completedDay, item.completedDay)));
  }
  const sortedLead = [...lead].sort((a, b) => a - b);
  const sortedCycle = [...cycle].sort((a, b) => a - b);
  const median = (sorted: number[]) => percentile(sorted, 0.5);
  return {
    sample: lead.length,
    leadAvg: average(lead),
    leadMedian: median(sortedLead),
    cycleAvg: average(cycle),
    cycleMedian: median(sortedCycle),
    cycleP85: percentile(sortedCycle, 0.85),
  };
}
