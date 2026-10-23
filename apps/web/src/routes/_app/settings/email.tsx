import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '@/components/layout/page-heading';
import { NotFoundState } from '@/features/spaces/container-header';
import { CompaniesSection, RulesSection } from '@/features/tickets/companies-section';
import { useTicketSettings } from '@/features/tickets/queries';
import { SettingsForm } from '@/features/tickets/settings-form';
import { useCan } from '@/features/workspace/queries';

export const Route = createFileRoute('/_app/settings/email')({
  component: EmailSettingsPage,
});

/** E-posta ayarları (ADR-140): posta kutusu, şirket bilgisi, yanıt şablonları, firmalar ve yönlendirme kuralları. */
function EmailSettingsPage() {
  const { t } = useTranslation();
  const canEdit = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const settings = useTicketSettings();
  if (!canEdit) return <NotFoundState />;
  return (
    <div data-testid="email-settings-page">
      <PageHeading title={t('emailSettings.title')} subtitle={t('emailSettings.subtitle')} />
      {settings.isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : settings.isError ? (
        <NotFoundState />
      ) : (
        <>
          <SettingsForm settings={settings.data} />
          <CompaniesSection />
          <RulesSection />
        </>
      )}
    </div>
  );
}
