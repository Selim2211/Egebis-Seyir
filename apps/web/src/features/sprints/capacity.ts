export type CapacityState = 'none' | 'under' | 'near' | 'over';

export interface Capacity {
  state: CapacityState;
  /** Planlanan puanın referans velocity'ye oranı (yüzde); referans yoksa null. */
  percent: number | null;
}

/** Yaklaşık sayılan alt sınır: velocity'nin %90'ı. */
const NEAR_RATIO = 0.9;

/**
 * Kapasite göstergesi (brief §5.6): planlanan puan, son sprint'lerin ortalama velocity'sine
 * göre değerlendirilir. Referans yoksa (hiç tamamlanmış sprint) değerlendirme yapılmaz.
 */
export function capacityOf(planned: number, velocity: number | null): Capacity {
  if (velocity === null || velocity <= 0) return { state: 'none', percent: null };
  const percent = Math.round((planned / velocity) * 100);
  if (planned > velocity) return { state: 'over', percent };
  return { state: planned >= velocity * NEAR_RATIO ? 'near' : 'under', percent };
}
