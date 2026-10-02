import { useTranslation } from 'react-i18next';
import { isApiError } from './api';

/** Bir API hata kodunu metne çevirir (toast vb. için). */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (error: unknown) =>
    t(`errors.${isApiError(error) ? error.code : 'INTERNAL'}`, {
      defaultValue: t('errors.INTERNAL'),
    });
}
