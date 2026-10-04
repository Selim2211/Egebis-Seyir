/** Kayıtlı görünümün saklayabileceği süzgeç/görünüm alanları (web `ViewSearch`; `item` hariç, ADR-079). */
export const SAVED_VIEW_KEYS = [
  'view',
  'q',
  'status',
  'priority',
  'type',
  'assignee',
  'label',
  'due',
  'sort',
  'dir',
  'group',
  'lane',
] as const;

export const MAX_SAVED_VIEW_NAME = 60;
/** Bir kullanıcının bir List'te en çok kaç görünümü olabilir. */
export const MAX_SAVED_VIEWS_PER_USER = 50;
/** Saklanan yapılandırmanın en büyük JSON boyutu (bayt). */
export const MAX_SAVED_VIEW_CONFIG_BYTES = 4000;
