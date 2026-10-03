/** Retrospektif sütunları (brief §5.6, ADR-071). */
export const RETRO_COLUMNS = ['WENT_WELL', 'IMPROVE', 'ACTION'] as const;
export type RetroColumn = (typeof RETRO_COLUMNS)[number];

export const RETRO_TEXT_MAX = 500;
