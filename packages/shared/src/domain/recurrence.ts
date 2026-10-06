/**
 * Tekrarlayan görev kuralı (Faz 7.1). Tarihler `YYYY-MM-DD` (saat dilimi yok); hesap saf ve
 * deterministiktir. Aylık/yıllık tekrar, hedef ayda gün yoksa ayın son gününe oturur (31 Oca + 1 ay = 28/29 Şub).
 */
import { addDays } from './reports';
import { daysBetween } from './timeline';

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface RecurrenceRule {
  freq: RecurrenceFrequency;
  /** Her kaç birimde bir (1 = her gün/hafta/ay/yıl). */
  interval: number;
}

export const RECURRENCE_MAX_INTERVAL = 365;

const parse = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
};
const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const format = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** `date` tarihine `months` ay ekler; gün hedef ayın uzunluğuna kırpılır. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parse(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return format(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Kuralın bir sonraki tarihi. */
export function nextOccurrence(date: string, rule: RecurrenceRule): string {
  switch (rule.freq) {
    case 'DAILY':
      return addDays(date, rule.interval);
    case 'WEEKLY':
      return addDays(date, rule.interval * 7);
    case 'MONTHLY':
      return addMonths(date, rule.interval);
    case 'YEARLY':
      return addMonths(date, rule.interval * 12);
  }
}

/**
 * Yeni örneğin tarihleri. Bitiş tarihi bir önceki bitişten sonraki tekrara kayar, ancak geçmişte
 * kalmasın diye gerekirse `today`i aşana kadar ilerletilir; başlangıç aynı süreyi korur.
 */
export function nextSchedule(
  current: { startDate: string | null; dueDate: string },
  rule: RecurrenceRule,
  today: string,
): { startDate: string | null; dueDate: string } {
  let dueDate = nextOccurrence(current.dueDate, rule);
  // Uzun süre geç kapatılan görev geçmiş bir tarihte doğmasın.
  for (let guard = 0; dueDate < today && guard < 1000; guard++) {
    dueDate = nextOccurrence(dueDate, rule);
  }
  const startDate =
    current.startDate === null
      ? null
      : addDays(dueDate, -daysBetween(current.startDate, current.dueDate));
  return { startDate, dueDate };
}
