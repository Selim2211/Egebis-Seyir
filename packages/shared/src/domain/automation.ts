import type { Priority, WorkItemType } from '../constants/work-item';

/** Zincirleme otomasyonun en çok kaç basamak derine inebileceği (döngü koruması, ADR-084). */
export const AUTOMATION_MAX_DEPTH = 3;

export type AutomationTrigger =
  | { type: 'ITEM_CREATED' }
  | { type: 'STATUS_CHANGED'; toStatusId: string | null }
  | { type: 'PRIORITY_CHANGED'; to: Priority | null };

export type AutomationEvent =
  | { type: 'ITEM_CREATED' }
  | { type: 'STATUS_CHANGED'; toStatusId: string }
  | { type: 'PRIORITY_CHANGED'; to: Priority };

export interface AutomationConditions {
  types?: WorkItemType[];
  priorities?: Priority[];
  /** Etiketlerden en az biri. */
  labelIds?: string[];
  unassigned?: boolean;
}

export interface AutomationSubject {
  type: WorkItemType;
  priority: Priority;
  labelIds: readonly string[];
  assigneeCount: number;
}

/** Olay tetikleyiciyle eşleşiyor mu? Boş hedef ("herhangi bir durum") tümünü kapsar. */
export function matchesTrigger(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  if (trigger.type === 'STATUS_CHANGED' && event.type === 'STATUS_CHANGED') {
    return trigger.toStatusId === null || trigger.toStatusId === event.toStatusId;
  }
  if (trigger.type === 'PRIORITY_CHANGED' && event.type === 'PRIORITY_CHANGED') {
    return trigger.to === null || trigger.to === event.to;
  }
  return true;
}

/** Koşullar (hepsi VE ile): verilmeyen koşul kısıt getirmez; boş liste kısıt sayılmaz. */
export function matchesConditions(
  conditions: AutomationConditions,
  item: AutomationSubject,
): boolean {
  if (conditions.types?.length && !conditions.types.includes(item.type)) return false;
  if (conditions.priorities?.length && !conditions.priorities.includes(item.priority)) return false;
  if (conditions.labelIds?.length && !conditions.labelIds.some((l) => item.labelIds.includes(l))) {
    return false;
  }
  if (conditions.unassigned && item.assigneeCount > 0) return false;
  return true;
}

export type LoopCheck = { ok: true } | { ok: false; reason: 'REPEAT' | 'DEPTH' };

/**
 * Döngü koruması: zincirde (şu an çalışan otomasyonlar) aynı kural tekrar çalışamaz ve zincir
 * `AUTOMATION_MAX_DEPTH` basamağı geçemez.
 */
export function checkAutomationLoop(chain: readonly string[], automationId: string): LoopCheck {
  if (chain.includes(automationId)) return { ok: false, reason: 'REPEAT' };
  if (chain.length >= AUTOMATION_MAX_DEPTH) return { ok: false, reason: 'DEPTH' };
  return { ok: true };
}
