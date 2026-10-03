import type { WorkItemType } from '../constants/work-item';

/** DoD/DoR yalnızca puanla tahmin edilen Story ve Bug için geçerlidir (brief §6.3). */
export const READINESS_TYPES = ['STORY', 'BUG'] as const;

export const MAX_READINESS_ITEMS = 20;
export const MAX_READINESS_TEXT = 200;

export const appliesToReadiness = (type: WorkItemType): boolean =>
  (READINESS_TYPES as readonly string[]).includes(type);

export interface Readiness {
  total: number;
  checked: number;
  /** Henüz işaretlenmemiş maddeler (Space sırasıyla). */
  missing: string[];
}

/** Space maddelerine göre durum; Space'te artık olmayan işaretler yok sayılır. */
export function readinessOf(items: readonly string[], checked: readonly string[]): Readiness {
  const done = new Set(checked);
  const missing = items.filter((text) => !done.has(text));
  return { total: items.length, checked: items.length - missing.length, missing };
}

/** İstekteki işaretleri Space maddeleriyle sınırlar: yalnızca var olanlar, tekrarsız, Space sırasıyla. */
export function normalizeChecked(items: readonly string[], checked: readonly string[]): string[] {
  const wanted = new Set(checked);
  return items.filter((text) => wanted.has(text));
}
