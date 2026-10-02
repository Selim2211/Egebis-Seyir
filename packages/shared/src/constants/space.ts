import type { StatusCategory } from './work-item';

/** Space renk paleti (oluşturma penceresi). API herhangi bir #RRGGBB değerini kabul eder. */
export const SPACE_COLORS = [
  '#7C3AED',
  '#4F46E5',
  '#2563EB',
  '#0E7490',
  '#15803D',
  '#CA8A04',
  '#C2410C',
  '#BE123C',
  '#DB2777',
  '#52525B',
] as const;

/** Space ikonları (lucide adları). `null` = adın ilk harfi. */
export const SPACE_ICONS = [
  'rocket',
  'code',
  'smartphone',
  'globe',
  'briefcase',
  'megaphone',
  'palette',
  'wrench',
  'chart',
  'users',
  'shield',
  'book',
] as const;
export type SpaceIcon = (typeof SPACE_ICONS)[number];

/** Anahtar biçimi (ADR-043): harfle başlar, 2–10 karakter, A–Z ve 0–9. */
export const SPACE_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** Çöp kutusundaki öğeler bu süreden sonra kalıcı silinir (ADR-041). */
export const TRASH_RETENTION_DAYS = 30;

interface StatusSeed {
  name: string;
  color: string;
  category: StatusCategory;
}

const STATUS_COLORS = ['#A1A1AA', '#3B82F6', '#F59E0B', '#8B5CF6', '#22C55E'] as const;
const STATUS_CATEGORIES_SEED: StatusCategory[] = [
  'NOT_STARTED',
  'NOT_STARTED',
  'ACTIVE',
  'ACTIVE',
  'DONE',
];
const seed = (names: string[]): StatusSeed[] =>
  names.map((name, i) => ({
    name,
    color: STATUS_COLORS[i]!,
    category: STATUS_CATEGORIES_SEED[i]!,
  }));

/** Yeni Space'in durumları, oluşturanın diline göre (ADR-036). Sıra = akış sırası. */
export const DEFAULT_STATUSES: Record<'tr' | 'en', readonly StatusSeed[]> = {
  tr: seed(['Backlog', 'Yapılacak', 'Devam ediyor', 'İncelemede', 'Tamamlandı']),
  en: seed(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']),
};

/** Yeni Space'te açılan ilk liste (ADR-043). */
export const DEFAULT_LIST_NAME: Record<'tr' | 'en', string> = { tr: 'Görevler', en: 'Tasks' };
