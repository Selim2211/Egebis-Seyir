/** Süre girişi kaynağı: elle girilen ya da sayaçtan gelen (ADR-075). */
export const TIME_SOURCES = ['MANUAL', 'TIMER'] as const;
export type TimeSource = (typeof TIME_SOURCES)[number];

/** Tek girişin en çok süresi (bir gün). */
export const MAX_ENTRY_MINUTES = 24 * 60;

export const MAX_TIME_NOTE = 300;

/** Zaman çizelgesi (timesheet) en çok bu kadar gün aralığı gösterir. */
export const MAX_TIMESHEET_DAYS = 62;
