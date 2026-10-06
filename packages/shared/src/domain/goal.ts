/**
 * Hedef ilerlemesi (Faz 7.9). Görev bazlı hedefte oran, bağlı görevlerin tamamlananına göre;
 * sayısal hedefte başlangıçtan hedefe doğru kat edilen yola göre (azaltma hedefleri de çalışır).
 */
export type GoalProgressInput =
  | { kind: 'TASKS'; done: number; total: number }
  | { kind: 'NUMBER'; start: number; current: number; target: number };

/** 0–100 arası tam sayı yüzde. */
export function goalPercent(input: GoalProgressInput): number {
  let ratio: number;
  if (input.kind === 'TASKS') {
    ratio = input.total === 0 ? 0 : input.done / input.total;
  } else {
    const span = input.target - input.start;
    ratio =
      span === 0 ? (input.current === input.target ? 1 : 0) : (input.current - input.start) / span;
  }
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
}
