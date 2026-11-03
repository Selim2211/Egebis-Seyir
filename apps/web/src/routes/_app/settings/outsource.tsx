import { CONTENT_ACCESS, type ContentAccess, type OutsourcePerson } from '@scrum/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { usePutSpaceMember, useRemoveSpaceMember } from '@/features/spaces/queries';
import { useOutsource, useSetContentAccess } from '@/features/workspace/queries';
import { relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/outsource')({ component: OutsourcePage });

/**
 * Dış kaynak kişiler tek pencerede (ADR-152): Super Admin herkesi görür ve doküman/video erişimini
 * belirler; Proje Yöneticisi yalnızca yönettiği Projelerdeki dış kaynakları görür, Projelerine ekler
 * ya da çıkarır.
 */
function OutsourcePage() {
  const { t } = useTranslation();
  const { data, isPending } = useOutsource();

  return (
    <div>
      <PageHeading title={t('outsource.title')} subtitle={t('outsource.description')} />
      {isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : !data || data.people.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
          {t('outsource.empty')}
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-lg border" data-testid="outsource-list">
          {data.people.map((person) => (
            <PersonRow
              key={person.userId}
              person={person}
              superAdmin={data.superAdmin}
              projects={data.projects}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonRow({
  person,
  superAdmin,
  projects,
}: {
  person: OutsourcePerson;
  superAdmin: boolean;
  projects: { spaceId: string; name: string; key: string }[];
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const setAccess = useSetContentAccess();
  const put = usePutSpaceMember();
  const remove = useRemoveSpaceMember();
  const [adding, setAdding] = useState('');
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const joined = new Set(person.projects.map((p) => p.spaceId));
  const addable = projects.filter((p) => !joined.has(p.spaceId));

  return (
    <li className="flex flex-col gap-3 px-4 py-3" data-testid="outsource-row">
      <div className="flex flex-wrap items-center gap-3">
        <UserAvatar
          id={person.userId}
          name={person.name}
          size={32}
          avatarVersion={person.avatarVersion}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-orange-700 dark:text-orange-400">{person.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {person.email} ·{' '}
            {person.lastSeenAt ? relativeTime(person.lastSeenAt) : t('common.never')}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('outsource.content')}</span>
          {superAdmin ? (
            <NativeSelect
              aria-label={t('outsource.contentFor', { name: person.name })}
              value={person.contentAccess}
              className="h-8"
              disabled={setAccess.isPending}
              onChange={(e) =>
                setAccess.mutate(
                  { userId: person.userId, contentAccess: e.target.value as ContentAccess },
                  { onSuccess: () => toast.success(t('outsource.contentSaved')), onError },
                )
              }
            >
              {CONTENT_ACCESS.map((a) => (
                <option key={a} value={a}>
                  {t(`outsource.access.${a}`)}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <span className="font-medium">{t(`outsource.access.${person.contentAccess}`)}</span>
          )}
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-11">
        {person.projects.map((p) => (
          <span
            key={p.spaceId}
            className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
          >
            <span className="font-mono">{p.key}</span> {p.name}
            <button
              type="button"
              className="hover:bg-background rounded-full p-0.5"
              aria-label={t('outsource.removeFrom', { name: person.name, project: p.name })}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(
                  { spaceId: p.spaceId, userId: person.userId },
                  { onSuccess: () => toast.success(t('outsource.removed')), onError },
                )
              }
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {addable.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <NativeSelect
              aria-label={t('outsource.addTo', { name: person.name })}
              value={adding}
              className="h-7 text-xs"
              onChange={(e) => setAdding(e.target.value)}
            >
              <option value="">{t('outsource.addProject')}</option>
              {addable.map((p) => (
                <option key={p.spaceId} value={p.spaceId}>
                  {p.key} · {p.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              aria-label={t('outsource.add')}
              disabled={!adding || put.isPending}
              onClick={() =>
                put.mutate(
                  { spaceId: adding, userId: person.userId, role: 'PROJECT_MEMBER' },
                  {
                    onSuccess: () => {
                      setAdding('');
                      toast.success(t('outsource.added'));
                    },
                    onError,
                  },
                )
              }
            >
              <Plus />
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}
