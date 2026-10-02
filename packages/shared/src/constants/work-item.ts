/** İş öğesi tipleri (brief §4.2). */
export const WORK_ITEM_TYPES = ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

/** Öncelikler (brief §5.4). Sıra: en yüksekten en düşüğe. */
export const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * Durum kategorileri (ADR-013). Durum adları Space bazlı ve özelleştirilebilir;
 * velocity/burndown gibi kurallar her zaman kategoriye bakar.
 */
export const STATUS_CATEGORIES = ['NOT_STARTED', 'ACTIVE', 'DONE'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/** Bug önem dereceleri (brief §5.4). */
export const BUG_SEVERITIES = ['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL'] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

/** Epic T-shirt boyutları (brief §4.2). */
export const TSHIRT_SIZES = ['S', 'M', 'L', 'XL'] as const;
export type TshirtSize = (typeof TSHIRT_SIZES)[number];

/** İş öğeleri arası bağlantı tipleri (brief §5.4). */
export const LINK_TYPES = ['BLOCKS', 'RELATES_TO', 'DUPLICATES'] as const;
export type LinkType = (typeof LINK_TYPES)[number];
