import { TSHIRT_POINTS, type EstimationScale, type WorkItemSummary } from '@scrum/shared';
import { todayDay } from '@/lib/format';

/** Story Point / saat gösterimi; T-shirt ölçeğinde sayı harfe çevrilir (ADR-045). */
export function estimateLabel(item: WorkItemSummary, scale: EstimationScale): string | null {
  if (item.points != null) {
    if (scale === 'TSHIRT') {
      const size = Object.entries(TSHIRT_POINTS).find(([, value]) => value === item.points)?.[0];
      if (size) return size;
    }
    return String(item.points);
  }
  return item.estimateHours != null ? `${item.estimateHours} sa` : null;
}

/** Bitiş tarihi gecikmiş mi (tamamlanmamış ve geçmiş)? */
export function isOverdue(item: WorkItemSummary, done: boolean): boolean {
  return !!item.dueDate && !done && item.dueDate < todayDay();
}
