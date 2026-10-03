import { completePreferences, type ChannelPreference, type NotificationType } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeading } from '@/components/layout/page-heading';
import { Switch } from '@/components/ui/switch';
import {
  notificationPreferencesQuery,
  useSetNotificationPreferences,
} from '@/features/notifications/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/notifications')({
  component: NotificationSettingsPage,
});

/** Bildirim türü × kanal tercihleri; her anahtar anında kaydedilir (ADR-066). */
function NotificationSettingsPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const prefs = useQuery(notificationPreferencesQuery(workspaceId));
  const save = useSetNotificationPreferences();

  const rows = completePreferences(prefs.data?.preferences ?? []);

  const change = (type: NotificationType, patch: Partial<ChannelPreference>) => {
    const current = rows.find((r) => r.type === type)!;
    save.mutate(
      { preferences: [{ ...current, ...patch }] },
      {
        onSuccess: () => toast.success(t('notifications.prefsSaved')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <>
      <PageHeading
        title={t('notifications.settingsTitle')}
        subtitle={t('notifications.settingsSubtitle')}
      />
      <div className="bg-card max-w-2xl overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('notifications.settingsTitle')}</caption>
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                {t('notifications.event')}
              </th>
              <th scope="col" className="w-28 px-4 py-2 text-center font-medium">
                {t('notifications.channelInApp')}
              </th>
              <th scope="col" className="w-28 px-4 py-2 text-center font-medium">
                {t('notifications.channelEmail')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.type}>
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="block font-medium">{t(`notifications.types.${row.type}`)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`notifications.typeHelp.${row.type}`)}
                  </span>
                </th>
                {(['inApp', 'email'] as const).map((channel) => (
                  <td key={channel} className="px-4 py-3 text-center">
                    <Switch
                      checked={row[channel]}
                      disabled={prefs.isPending}
                      aria-label={t('notifications.switchLabel', {
                        type: t(`notifications.types.${row.type}`),
                        channel: t(
                          channel === 'inApp'
                            ? 'notifications.channelInApp'
                            : 'notifications.channelEmail',
                        ),
                      })}
                      onCheckedChange={(checked) => change(row.type, { [channel]: checked })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
