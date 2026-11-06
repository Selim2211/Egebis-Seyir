import { BUG_SENDER_PATTERN, type SpaceDetail } from '@scrum/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useSpaceMembers } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

function Card({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="bg-card mb-5 rounded-lg border" data-testid={testId}>
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

function useSpacePut<T>(spaceId: string, suffix: string, doneKey: string) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (body: T) =>
      apiRequest(`/workspaces/${workspaceId}/spaces/${spaceId}/${suffix}`, NoContent, {
        method: 'PUT',
        body,
      }),
    onSuccess: () => toast.success(t(doneKey as never)),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId] }),
  });
}

/**
 * Projenin tek Product Owner'ı ve Scrum Master'ı. Bir kişi birden çok Projede bu görevi
 * üstlenebilir, ama bir Projede her görev için yalnızca bir kişi vardır. Backlog'a açılan Epik
 * ve Task'ların sahibi otomatik Product Owner olur; sprint silme/askıya alma Scrum Master'dadır.
 */
export function ScrumRolesSection({ space, canEdit }: { space: SpaceDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const { data } = useSpaceMembers(space.id);
  const save = useSpacePut<{ productOwnerId: string | null; scrumMasterId: string | null }>(
    space.id,
    'scrum-roles',
    'scrumRoles.saved',
  );
  const members = data?.members ?? [];
  const po = space.productOwner?.id ?? '';
  const sm = space.scrumMaster?.id ?? '';
  const change = (next: { po?: string; sm?: string }) =>
    save.mutate({
      productOwnerId: (next.po ?? po) || null,
      scrumMasterId: (next.sm ?? sm) || null,
    });

  const field = (
    id: string,
    label: string,
    value: string,
    current: SpaceDetail['productOwner'],
    onChange: (v: string) => void,
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {canEdit ? (
        <NativeSelect
          id={id}
          value={value}
          disabled={save.isPending}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        >
          <option value="">{t('scrumRoles.none')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <p className="text-sm">{current?.name ?? t('scrumRoles.none')}</p>
      )}
    </div>
  );

  return (
    <Card
      title={t('scrumRoles.title')}
      description={t('scrumRoles.description')}
      testId="scrum-roles"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field('scrum-po', t('scrumRoles.productOwner'), po, space.productOwner, (v) =>
          change({ po: v }),
        )}
        {field('scrum-sm', t('scrumRoles.scrumMaster'), sm, space.scrumMaster, (v) =>
          change({ sm: v }),
        )}
      </div>
    </Card>
  );
}

/**
 * Bu Projeye e-postayla Bug gönderebilecek adresler. Her satır bir adres; isim kısmında `*`
 * (her uzunlukta) ve `?` (tek karakter) kullanılabilir. Liste boşsa kısıtlama yoktur.
 */
export function BugSendersSection({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const save = useSpacePut<{ senders: string[] }>(space.id, 'bug-senders', 'bugSenders.saved');
  const initial = space.bugSenders.join('\n');
  const [text, setText] = useState(initial);
  const lines = text
    .split(/[\n,;]+/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  const invalid = lines.filter((l) => !BUG_SENDER_PATTERN.test(l));
  const dirty = lines.join('\n') !== initial;

  return (
    <Card
      title={t('bugSenders.title')}
      description={t('bugSenders.description')}
      testId="bug-senders"
    >
      <textarea
        aria-label={t('bugSenders.title')}
        value={text}
        rows={4}
        placeholder={t('bugSenders.placeholder')}
        onChange={(e) => setText(e.target.value)}
        className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
      />
      <p
        className={
          invalid.length > 0 ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
        }
      >
        {invalid.length > 0
          ? t('bugSenders.invalid', { list: invalid.join(', ') })
          : t('bugSenders.hint')}
      </p>
      <div>
        <Button
          size="sm"
          disabled={!dirty || invalid.length > 0 || save.isPending}
          onClick={() => save.mutate({ senders: [...new Set(lines)] })}
        >
          {t('bugSenders.save')}
        </Button>
      </div>
    </Card>
  );
}
