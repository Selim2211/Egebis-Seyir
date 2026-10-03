/** Panonun widget kataloğu (ADR-078). */
export const WIDGET_IDS = [
  'sprint',
  'velocity',
  'cfd',
  'throughput',
  'cycle',
  'bugs',
  'workload',
  'epics',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

/** Widget genişliği: yarım (M) ya da tam satır (L). */
export const WIDGET_SIZES = ['M', 'L'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];
