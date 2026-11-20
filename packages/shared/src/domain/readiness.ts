import type { WorkItemType } from '../constants/work-item';

/** DoD yalnızca puanla tahmin edilen Task ve Bug için geçerlidir (brief §6.3, ADR-110). */
export const READINESS_TYPES = ['TASK', 'BUG'] as const;

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

/**
 * Atanan zorunlu iş türleri (yönetici 5. tur, ADR-176): kullanıcı bu türleri atanansız oluşturamaz
 * ve atananı tamamen kaldıramaz. Bug'da kural, Bug atama izni olan kişi için geçerlidir; diğerlerinin
 * açtığı Bug atanansız Bug kutusuna düşer (ADR-117).
 */
export const ASSIGNEE_REQUIRED_TYPES = ['TASK', 'SUBTASK', 'BUG'] as const;

export const requiresAssignee = (type: WorkItemType): boolean =>
  (ASSIGNEE_REQUIRED_TYPES as readonly string[]).includes(type);
