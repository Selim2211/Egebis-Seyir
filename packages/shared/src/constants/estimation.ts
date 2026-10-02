/** Varsayılan story point ölçeği (brief §6.4). */
export const FIBONACCI_SCALE = [1, 2, 3, 5, 8, 13, 21] as const;

/** T-shirt ölçeği. */
export const TSHIRT_SCALE = ['XS', 'S', 'M', 'L', 'XL'] as const;

/** Space tahmin ölçekleri (ADR-043). NUMBER = serbest sayı; özel ölçek F2. */
export const ESTIMATION_SCALES = ['FIBONACCI', 'TSHIRT', 'NUMBER'] as const;
export type EstimationScale = (typeof ESTIMATION_SCALES)[number];

/** T-shirt boyutlarının sayısal karşılığı (ADR-045). */
export const TSHIRT_POINTS: Record<(typeof TSHIRT_SCALE)[number], number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

/** Serbest sayı ölçeğinin üst sınırı. */
export const MAX_FREE_POINTS = 1000;

/** Sprint süresi sınırları, hafta (brief §5.6). */
export const SPRINT_LENGTH_WEEKS = { min: 1, max: 4, default: 2 } as const;
