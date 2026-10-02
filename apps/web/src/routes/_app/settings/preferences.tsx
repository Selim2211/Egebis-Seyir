import type { Locale, Theme } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { useMe, useUpdateProfile } from '@/features/auth/queries';
import { useUiStore } from '@/lib/ui-store';

export const Route = createFileRoute('/_app/settings/preferences')({
  component: PreferencesPage,
});

/** Tercihler anında kaydedilir; bu cihaza da hemen uygulanır (ADR-037). */
function PreferencesPage() {
  const { t } = useTranslation();
  const { user } = useMe();
  const update = useUpdateProfile();
  const { setLanguage, setTheme } = useUiStore();
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);

  const save = (patch: { locale?: Locale; theme?: Theme; timezone?: string }) => {
    if (patch.locale) setLanguage(patch.locale);
    if (patch.theme) setTheme(patch.theme);
    update.mutate(patch, { onSuccess: () => toast.success(t('preferences.saved')) });
  };

  return (
    <>
      <PageHeading title={t('preferences.title')} subtitle={t('preferences.subtitle')} />
      <div className="bg-card flex max-w-xl flex-col gap-4 rounded-lg border p-5">
        <FormError error={update.error} />
        <SelectField
          label={t('userMenu.language')}
          value={user.locale}
          onChange={(e) => save({ locale: e.target.value as Locale })}
        >
          <option value="tr">{t('language.tr')}</option>
          <option value="en">{t('language.en')}</option>
        </SelectField>
        <SelectField
          label={t('userMenu.theme')}
          value={user.theme}
          onChange={(e) => save({ theme: e.target.value as Theme })}
        >
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
          <option value="system">{t('theme.system')}</option>
        </SelectField>
        <SelectField
          label={t('preferences.timezone')}
          value={user.timezone}
          onChange={(e) => save({ timezone: e.target.value })}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll('_', ' ')}
            </option>
          ))}
        </SelectField>
      </div>
    </>
  );
}
