import i18n from 'i18next';

/** Space oluşturulurken veritabanına yazılan varsayılan adlar (ADR-036, ADR-043). */
const STATUS_KEYS: Record<string, 'backlog' | 'todo' | 'inProgress' | 'inReview' | 'done'> = {
  Backlog: 'backlog',
  Yapılacak: 'todo',
  'To Do': 'todo',
  'Devam ediyor': 'inProgress',
  'In Progress': 'inProgress',
  İncelemede: 'inReview',
  'In Review': 'inReview',
  Tamamlandı: 'done',
  Done: 'done',
};
const LIST_NAMES = new Set(['Görevler', 'Tasks']);

/**
 * Varsayılan durum adını kullanıcının dilinde gösterir; kullanıcının kendi verdiği adlar
 * olduğu gibi kalır (ADR-111).
 */
export function statusName(name: string): string {
  const key = STATUS_KEYS[name];
  return key ? i18n.t(`defaultNames.status.${key}`) : name;
}

/** Varsayılan ilk liste adını ("Görevler" / "Tasks") kullanıcının dilinde gösterir. */
export function listName(name: string): string {
  return LIST_NAMES.has(name) ? i18n.t('defaultNames.list') : name;
}
