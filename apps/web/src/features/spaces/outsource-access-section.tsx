import {
  ACCESS_LEVELS,
  type AccessLevel,
  type OutsourceArea,
  type OutsourceAccessPerson,
  OutsourceAccessResponseSchema,
  OUTSOURCE_AREAS,
} from '@scrum/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { UserAvatar } from '@/components/user-avatar';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/** Her alanda seçilebilecek düzeyler: Okuma/Yazma/Yok anlamlı olduğu yerlerde (ADR-172). */
const LEVELS: Record<OutsourceArea, readonly AccessLevel[]> = {
  items: ['READ', 'WRITE'],
  comments: ['READ', 'WRITE'],
  docs: ACCESS_LEVELS,
  videos: ACCESS_LEVELS,
  reports: ['NONE', 'READ'],
};

function useOutsourceAccess(spaceId: string) {
  const { id } = useCurrentWorkspace();
  return useQuery({
    queryKey: ['workspaces', id, 'spaces', spaceId, 'outsource-access'],
    queryFn: () =>
      apiRequest(
        `/workspaces/${id}/spaces/${spaceId}/outsource-access`,
        OutsourceAccessResponseSchema,
      ),
  });
}

function usePutOutsourceAccess(spaceId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  const errorMessage = useErrorMessage();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: { userId: string; access: OutsourceAccessPerson['access'] }) =>
      apiRequest(
        `/workspaces/${id}/spaces/${spaceId}/outsource-access/${input.userId}`,
        NoContent,
        {
          method: 'PUT',
          body: { access: input.access },
        },
      ),
    onSuccess: () => toast.success(t('outsourceAccess.saved')),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ['workspaces', id, 'spaces', spaceId, 'outsource-access'] }),
  });
}

/**
 * Projeye atanmış dış kaynakların bu Projedeki okuma/yazma yetkisi (ADR-172). Rol bazlı değil, kişi
 * ve Proje bazlıdır; yalnızca Projenin Scrum Master'ı, Proje yöneticisi ya da Super Admin ayarlar.
 */
export function OutsourceAccessSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { data, isPending } = useOutsourceAccess(spaceId);
  const put = usePutOutsourceAccess(spaceId);
  const people = data?.people ?? [];

  return (
    <section className="bg-card mb-5 rounded-lg border" data-testid="outsource-access">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('outsourceAccess.title')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('outsourceAccess.description')}</p>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {isPending ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : people.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('outsourceAccess.empty')}</p>
        ) : (
          people.map((person) => (
            <div
              key={person.userId}
              className="rounded-md border p-3"
              data-testid="outsource-access-row"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <UserAvatar
                  id={person.userId}
                  name={person.name}
                  size={28}
                  avatarVersion={person.avatarVersion}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{person.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {person.email}
                    {person.expiresAt &&
                      ` · ${t(person.locked ? 'members.expiredOn' : 'members.expiresOn', {
                        date: new Date(person.expiresAt).toLocaleDateString(),
                      })}`}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {OUTSOURCE_AREAS.map((area) => (
                  <label key={area} className="flex items-center justify-between gap-3 text-sm">
                    <span>{t(`outsourceAccess.areas.${area}`)}</span>
                    <NativeSelect
                      aria-label={`${person.name}: ${t(`outsourceAccess.areas.${area}`)}`}
                      value={person.access[area]}
                      className="h-8 w-36"
                      disabled={put.isPending}
                      onChange={(e) =>
                        put.mutate({
                          userId: person.userId,
                          access: { ...person.access, [area]: e.target.value as AccessLevel },
                        })
                      }
                    >
                      {LEVELS[area].map((level) => (
                        <option key={level} value={level}>
                          {t(`outsourceAccess.levels.${level}`)}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
