import { useTranslation } from 'react-i18next';
import { useIsSelected, useSelectionStore } from './selection';

/** Satır seçim kutucuğu: kendi değerine abone olduğundan tıklayınca yalnızca kendisi yeniden çizilir. */
export function RowCheckbox({ id, itemKey }: { id: string; itemKey: string }) {
  const { t } = useTranslation();
  const store = useSelectionStore();
  const checked = useIsSelected(id);
  if (!store) return null;
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => store.toggle(id, e.target.checked)}
      aria-label={t('backlog.select', { key: itemKey })}
      className="size-4 shrink-0"
    />
  );
}
