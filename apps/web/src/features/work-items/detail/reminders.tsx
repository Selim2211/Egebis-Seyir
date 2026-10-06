import { useQuery } from '@tanstack/react-query';
import { BellRing, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { remindersQuery, useAddReminder, useDeleteReminder } from '../queries';

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

/** Kişisel hatırlatıcılar (Faz 7.3): yalnızca kendin görürsün; zamanı gelince bildirim ve e-posta gelir. */
export function Reminders({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(remindersQuery(workspaceId, itemId));
  const add = useAddReminder();
  const remove = useDeleteReminder();
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!when) return;
    add.mutate(
      { itemId, body: { remindAt: new Date(when).toISOString(), note: note.trim() || null } },
      {
        onSuccess: () => {
          setWhen('');
          setNote('');
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const reminders = data?.reminders ?? [];
  return (
    <div className="flex flex-col gap-2">
      {reminders.length > 0 && (
        <ul className="flex flex-col gap-1">
          {reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <BellRing className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <span className={r.sent ? 'text-muted-foreground line-through' : undefined}>
                {formatWhen(r.remindAt)}
                {r.note && ` · ${r.note}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-6"
                aria-label={t('reminders.delete', { when: formatWhen(r.remindAt) })}
                onClick={() =>
                  remove.mutate(
                    { itemId, reminderId: r.id },
                    { onError: (error) => toast.error(errorMessage(error)) },
                  )
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label={t('reminders.when')}
          className="h-8 w-auto text-xs"
        />
        <Input
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('reminders.notePlaceholder')}
          aria-label={t('reminders.note')}
          className="h-8 min-w-24 flex-1 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!when || add.isPending}>
          {t('reminders.add')}
        </Button>
      </form>
    </div>
  );
}
