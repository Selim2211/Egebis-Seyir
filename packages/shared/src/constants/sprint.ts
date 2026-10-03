/** Sprint durumları (brief §5.6). */
export const SPRINT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

/** Sprint'e eklenme nedeni (ADR-061): aktif sprint'e sonradan ekleme/çıkarma scope change sayılır. */
export const SPRINT_ITEM_REASONS = ['PLANNED', 'SCOPE_CHANGE', 'CARRIED_OVER'] as const;
export type SprintItemReason = (typeof SPRINT_ITEM_REASONS)[number];

/** Sprint'e doğrudan girebilen tipler; Epic girmez, Sub-task üstünü izler (ADR-061). */
export const SPRINT_ITEM_TYPES = ['STORY', 'BUG', 'TASK'] as const;

/** Bir sprint en çok 8 hafta sürebilir (brief §5.6: 1-4 hafta önerilir, ayarlanabilir). */
export const MAX_SPRINT_DAYS = 56;

/** Tek istekte taşınabilecek öğe sayısı. */
export const MAX_SPRINT_MOVE_ITEMS = 200;
