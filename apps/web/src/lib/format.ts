import i18n from 'i18next';

const locale = () => (i18n.language === 'en' ? 'en-US' : 'tr-TR');

/**
 * Intl biçimleyicileri pahalıdır (her oluşturma ~ms); listelerde yüzlerce kez çağrıldığından dil ve
 * seçenek başına bir kez oluşturulup yeniden kullanılır.
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale()}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale(), options);
    dateFormats.set(key, format);
  }
  return format;
}
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
function relativeFormat(): Intl.RelativeTimeFormat {
  const key = locale();
  let format = relativeFormats.get(key);
  if (!format) {
    format = new Intl.RelativeTimeFormat(key, { numeric: 'auto' });
    relativeFormats.set(key, format);
  }
  return format;
}

/** 14 Ekim 2026 */
export function formatDate(iso: string): string {
  return dateFormat({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 dakika önce", "dün" */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const rtf = relativeFormat();
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

/** 14 Eki (yıl bu yıl değilse 14 Eki 2027). `YYYY-MM-DD` girdisi gün bazlıdır, saat dilimine kaymaz. */
export function formatShortDate(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return dateFormat({
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Bugünün YYYY-MM-DD karşılığı (yerel saat). */
export function todayDay(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 14 Eki 2026 15:42 */
export function formatDateTime(iso: string): string {
  return dateFormat({ dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
