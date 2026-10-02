import type { Modifier } from '@dnd-kit/core';

/** Sürüklemeyi dikey eksenle sınırlar (@dnd-kit/modifiers eklemeden). */
export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
