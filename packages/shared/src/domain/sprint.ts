import {
  MAX_SPRINT_DAYS,
  SPRINT_ITEM_TYPES,
  type SprintItemReason,
  type SprintStatus,
} from '../constants/sprint';
import type { StatusCategory, WorkItemType } from '../constants/work-item';
import { weightedPercent } from './work-item-progress';

export type SprintIneligible = 'TYPE' | 'NESTED' | 'DONE';

/**
 * Öğe sprint'e/backlog'a girebilir mi? (ADR-061, ADR-062)
 * Yalnızca üst düzey Task/Bug: üst öğesi yok ya da Epic. Tamamlanmış öğe girmez.
 */
export function sprintEligibility(item: {
  type: WorkItemType;
  parentType: WorkItemType | null;
  category: StatusCategory;
}): SprintIneligible | null {
  if (!(SPRINT_ITEM_TYPES as readonly string[]).includes(item.type)) return 'TYPE';
  if (item.parentType !== null && item.parentType !== 'EPIC') return 'NESTED';
  if (item.category === 'DONE') return 'DONE';
  return null;
}

export type SprintDatesError = 'END_BEFORE_START' | 'TOO_LONG';

const DAY_MS = 86_400_000;

/** Gün sayısı, iki uç dahil (1 Ocak–1 Ocak = 1 gün). */
export function sprintDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
}

export function checkSprintDates(startDate: string, endDate: string): SprintDatesError | null {
  const days = sprintDays(startDate, endDate);
  if (days < 1) return 'END_BEFORE_START';
  if (days > MAX_SPRINT_DAYS) return 'TOO_LONG';
  return null;
}

/** Sprint'in içerdiği öğeler için yalnızca okunur durum alanları. */
export function isSprintOpen(status: SprintStatus): boolean {
  return status === 'PLANNED' || status === 'ACTIVE';
}

/** Hedef sprint durumuna göre ekleme/çıkarma nedeni: aktif sprint'te scope change. */
export function sprintMoveReason(target: SprintStatus): SprintItemReason {
  return target === 'ACTIVE' ? 'SCOPE_CHANGE' : 'PLANNED';
}

export interface SprintTotals {
  itemCount: number;
  points: number;
  doneItemCount: number;
  donePoints: number;
  /** Puanı girilmemiş Task/Bug sayısı (brief §5.5 vurgu). */
  unestimatedCount: number;
}

/** Sprint veya backlog toplamları; velocity yalnızca Done kategorisindeki puanı sayar (brief §6.1.7). */
export function sprintTotals(
  items: ReadonlyArray<{ type: WorkItemType; points: number | null; category: StatusCategory }>,
): SprintTotals {
  const totals: SprintTotals = {
    itemCount: items.length,
    points: 0,
    doneItemCount: 0,
    donePoints: 0,
    unestimatedCount: 0,
  };
  for (const item of items) {
    const points = item.points ?? 0;
    totals.points += points;
    if (item.category === 'DONE') {
      totals.doneItemCount += 1;
      totals.donePoints += points;
    }
    if ((item.type === 'TASK' || item.type === 'BUG') && item.points === null) {
      totals.unestimatedCount += 1;
    }
  }
  return totals;
}

export const VELOCITY_WINDOW = 3;

/**
 * Planlama referansı: tamamlanmış son `window` sprint'in ortalama velocity'si (donmuş puan).
 * Hiç tamamlanmış sprint yoksa null; ortalama bir sayıya yuvarlanır (bir ondalık).
 */
export function averageVelocity(
  sprints: ReadonlyArray<{
    status: SprintStatus;
    endDate: string;
    completedPoints: number | null;
  }>,
  window: number = VELOCITY_WINDOW,
): number | null {
  const recent = sprints
    .filter((s) => s.status === 'COMPLETED' && s.completedPoints !== null)
    .sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0))
    .slice(0, window);
  if (recent.length === 0) return null;
  const total = recent.reduce((sum, s) => sum + (s.completedPoints ?? 0), 0);
  return Math.round((total / recent.length) * 10) / 10;
}

export interface AssigneeStat {
  /** Atanmamış işler için null. */
  userId: string | null;
  name: string | null;
  itemCount: number;
  points: number;
  donePoints: number;
  /** Puan ağırlıklı tamamlanma yüzdesi (0–100). */
  percentDone: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Sprint puanının kişilere dağılımı (ADR-107). Birden çok kişiye atanmış işin puanı eşit bölünür,
 * böylece kişi toplamları sprint toplamına eşit kalır. Atanmamış işler tek satırda (userId null).
 */
export function sprintAssigneeBreakdown(
  items: ReadonlyArray<{
    points: number | null;
    percentDone: number | null;
    category: StatusCategory;
    assignees: ReadonlyArray<{ id: string; name: string }>;
  }>,
): AssigneeStat[] {
  type Bucket = {
    userId: string | null;
    name: string | null;
    entries: Array<{ points: number | null; percentDone: number | null; category: StatusCategory }>;
  };
  const buckets = new Map<string | null, Bucket>();
  for (const item of items) {
    const owners = item.assignees.length > 0 ? item.assignees : [null];
    for (const owner of owners) {
      const key = owner?.id ?? null;
      const bucket = buckets.get(key) ?? { userId: key, name: owner?.name ?? null, entries: [] };
      bucket.entries.push({
        points: item.points == null ? null : item.points / owners.length,
        percentDone: item.percentDone,
        category: item.category,
      });
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()]
    .map((b) => ({
      userId: b.userId,
      name: b.name,
      itemCount: b.entries.length,
      points: round1(b.entries.reduce((s, e) => s + (e.points ?? 0), 0)),
      donePoints: round1(
        b.entries.filter((e) => e.category === 'DONE').reduce((s, e) => s + (e.points ?? 0), 0),
      ),
      percentDone: weightedPercent(b.entries),
    }))
    .sort((a, b) => {
      if ((a.userId === null) !== (b.userId === null)) return a.userId === null ? 1 : -1;
      return b.points - a.points || (a.name ?? '').localeCompare(b.name ?? '');
    });
}
