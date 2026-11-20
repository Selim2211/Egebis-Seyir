import { BUG_SENDER_PATTERN, type SpaceDetail } from '@scrum/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { SettingsSection } from '@/components/settings-section';

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
    <SettingsSection title={title} description={description} testId={testId}>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </SettingsSection>
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
