import type { AuditEvent } from '@scrum/shared';
import type { TFunction } from 'i18next';
import { describeEvent } from '@/features/work-items/detail/activity-text';

/** Bilinen eylemlerin çevirisi `audit.actions.<nokta yerine alt çizgi>` anahtarındadır. */
const key = (action: string) => action.replace(/\./g, '_');

/**
 * Denetim satırı için okunur özet. Öğe olayları öğe akışıyla aynı cümleleri kullanır; diğerleri
 * eylem adından çevrilir, ek bilgi (ad, sayı) `detail` ve `changes` içinden eklenir.
 */
export function describeAudit(event: AuditEvent, t: TFunction): string {
  if (event.action.startsWith('item.') && event.item) {
    return describeEvent(event, t).join(' ');
  }
  const base = t(`audit.actions.${key(event.action)}`, { defaultValue: event.action });
  const extra = event.changes
    .map((c) => {
      const from = Array.isArray(c.from) ? c.from.join(', ') : c.from;
      const to = Array.isArray(c.to) ? c.to.join(', ') : c.to;
      return from !== null && from !== undefined ? `${c.field}: ${from} → ${to ?? ''}` : null;
    })
    .filter(Boolean);
  return [base, ...extra].join(' · ');
}

/** CSV satırları (ilk satır başlık); `downloadCsv` UTF-8 ve tırnaklamayı halleder. */
export function auditCsvRows(events: readonly AuditEvent[], t: TFunction): string[][] {
  const header = [
    t('audit.col.when'),
    t('audit.col.who'),
    t('audit.col.type'),
    t('audit.col.object'),
    t('audit.col.what'),
  ];
  return [
    header,
    ...events.map((e) => [
      e.at,
      e.actor?.name ?? t('activity.system'),
      t(`audit.entityTypes.${e.entityType}`, { defaultValue: e.entityType }),
      e.entityLabel ?? '',
      describeAudit(e, t),
    ]),
  ];
}
