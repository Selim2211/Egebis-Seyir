import { WORKSPACE_PERMISSIONS } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '@/components/layout/page-heading';
import { BackupKeyPanel } from '@/features/backup/backup-key';
import { useCan } from '@/features/workspace/queries';

export const Route = createFileRoute('/_app/settings/backup-key')({ component: BackupKeyPage });

/** Yedek şifreleme anahtarı (ADR-171): yalnızca Super Admin. */
function BackupKeyPage() {
  const { t } = useTranslation();
  const allowed = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  if (!allowed) return <p className="text-muted-foreground text-sm">{t('backupKey.forbidden')}</p>;
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title={t('backupKey.pageTitle')} subtitle={t('backupKey.pageSubtitle')} />
      <BackupKeyPanel />
    </div>
  );
}
