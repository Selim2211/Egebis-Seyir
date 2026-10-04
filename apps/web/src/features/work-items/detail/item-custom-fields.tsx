import type { WorkItemDetail } from '@scrum/shared';
import { useTranslation } from 'react-i18next';
import { CustomFieldInput } from '@/features/custom-fields/field-input';
import { useCustomFields } from '@/features/custom-fields/queries';
import { useSaveItem } from './use-save-item';

/** Detay panelinde Space'in özel alanları (brief §5.8, ADR-082). Alan yoksa hiçbir şey çizilmez. */
export function ItemCustomFields({ item, canWrite }: { item: WorkItemDetail; canWrite: boolean }) {
  const { t } = useTranslation();
  const fields = useCustomFields(item.spaceId);
  const { save } = useSaveItem(item.id);
  if (fields.length === 0) return null;

  return (
    <section aria-label={t('customFields.title')} className="mt-4 border-t pt-3">
      <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
        {t('customFields.title')}
      </h3>
      <dl className="divide-y">
        {fields.map((field) => (
          <div
            key={field.id}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm"
          >
            <dt className="text-muted-foreground truncate pt-1" title={field.name}>
              {field.name}
            </dt>
            <dd className="min-w-0">
              <CustomFieldInput
                field={field}
                value={item.customFields[field.id]}
                disabled={!canWrite}
                onChange={(value) => save({ customFields: { [field.id]: value } })}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
