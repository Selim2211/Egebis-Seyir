import { WIDGET_IDS, WIDGET_SIZES, type WidgetId, type WidgetSize } from '../constants/dashboard';

export interface DashboardWidget {
  id: WidgetId;
  size: WidgetSize;
  visible: boolean;
}

const DEFAULT_SIZE: Record<WidgetId, WidgetSize> = {
  sprint: 'L',
  velocity: 'M',
  cfd: 'L',
  throughput: 'M',
  cycle: 'M',
  bugs: 'M',
  workload: 'M',
  epics: 'M',
};

/** Hiç özelleştirme yapılmamış pano: katalogdaki tüm widget'lar, varsayılan boyutla, görünür. */
export const defaultDashboard = (): DashboardWidget[] =>
  WIDGET_IDS.map((id) => ({ id, size: DEFAULT_SIZE[id], visible: true }));

/**
 * Kayıtlı düzeni güvenli hâle getirir: bilinmeyen/tekrarlı widget'ları atar, geçersiz boyutu
 * varsayılana çevirir, katalogda olup kayıtta olmayanları (yeni widget'lar) sona ekler.
 */
export function normalizeDashboard(stored: unknown): DashboardWidget[] {
  const seen = new Set<WidgetId>();
  const result: DashboardWidget[] = [];
  if (Array.isArray(stored)) {
    for (const entry of stored as Array<Record<string, unknown>>) {
      const id = entry?.id as WidgetId;
      if (!(WIDGET_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        size: (WIDGET_SIZES as readonly unknown[]).includes(entry.size)
          ? (entry.size as WidgetSize)
          : DEFAULT_SIZE[id],
        visible: entry.visible !== false,
      });
    }
  }
  for (const id of WIDGET_IDS) {
    if (!seen.has(id)) result.push({ id, size: DEFAULT_SIZE[id], visible: true });
  }
  return result;
}

/** Widget'ı görünür widget'lar arasında bir yukarı/aşağı taşır (gizliler yerinde kalır). */
export function moveWidget(
  layout: readonly DashboardWidget[],
  id: WidgetId,
  direction: -1 | 1,
): DashboardWidget[] {
  const visibleIdx = layout.flatMap((w, i) => (w.visible ? [i] : []));
  const at = visibleIdx.findIndex((i) => layout[i]!.id === id);
  const swapWith = visibleIdx[at + direction];
  if (at === -1 || swapWith === undefined) return [...layout];
  const next = [...layout];
  const from = visibleIdx[at]!;
  [next[from], next[swapWith]] = [next[swapWith]!, next[from]!];
  return next;
}
