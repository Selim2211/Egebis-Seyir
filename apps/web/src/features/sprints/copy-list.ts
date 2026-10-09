import type { WorkItemRow } from '@scrum/shared';
import type { TFunction } from 'i18next';

/** Hücredeki sekme/satır sonu tablo yapısını bozmasın diye boşluğa çevrilir. */
const cell = (value: string | number | null | undefined) =>
  value === null || value === undefined
    ? ''
    : String(value)
        .replace(/[\t\r\n]+/g, ' ')
        .trim();

/**
 * Sprint/Backlog listesini panoya kopyalamak için sekmeyle ayrılmış metin (Faz 8.1).
 * Excel ya da Google Sheets'e yapıştırılınca sütunlara ayrılır; ilk satır başlıktır.
 */
export function itemsToTsv(items: readonly WorkItemRow[], t: TFunction): string {
  const header = [
    t('copyList.key'),
    t('copyList.title'),
    t('copyList.type'),
    t('copyList.status'),
    t('copyList.assignees'),
    t('copyList.priority'),
    t('copyList.estimate'),
    t('copyList.due'),
  ];
  const rows = items.map((i) => [
    i.key,
    i.title,
    t(`workItemType.${i.type}`),
    i.status.name,
    i.assignees.map((a) => a.name).join(', '),
    t(`priority.${i.priority}`),
    i.points ?? (i.estimateHours !== null ? `${i.estimateHours} h` : null),
    i.dueDate,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join('\t')).join('\n');
}
