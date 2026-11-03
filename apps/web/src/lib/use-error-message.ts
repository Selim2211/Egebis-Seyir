import { useTranslation } from 'react-i18next';
import { isApiError } from './api';

/** Bir API hata kodunu metne çevirir (toast vb. için). */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown) => {
    const details =
      isApiError(error) && typeof error.details === 'object' && error.details !== null
        ? (error.details as Record<string, unknown>)
        : {};
    // Ayrıntılar (ör. min, count) metne yerleşir; anahtarı olmayan metinler etkilenmez.
    return t(`errors.${isApiError(error) ? error.code : 'INTERNAL'}`, {
      ...details,
      defaultValue: t('errors.INTERNAL'),
    });
  };
}
