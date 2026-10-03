import { RETRO_COLUMNS, RETRO_TEXT_MAX, type RetroColumn, type RetroItem } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ListPlus, ThumbsUp, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { retroQuery, useRetro } from './queries';
import { ScrumTabs } from './scrum-tabs';

const COLUMN_TONE: Record<RetroColumn, string> = {
  WENT_WELL: 'border-t-status-done',
  IMPROVE: 'border-t-amber-500',
  ACTION: 'border-t-primary',
};

/** Sprint retrospektifi: iyi gitti / geliştirilmeli / aksiyon sütunları, oylama, göreve çevirme (ADR-071). */
export function RetroPage({ spaceId, sprintId }: { spaceId: string; sprintId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const retro = useQuery(retroQuery(workspaceId, sprintId));
  const actions = useRetro(sprintId);

  if (space.isPending || retro.isPending) return <LoadingState />;
  if (space.isError || retro.isError || retro.data.sprint.spaceId !== spaceId) {
    return <NotFoundState />;
  }

  const canParticipate = retro.data.canParticipate && !space.data.archived;
  const onError = (error: unknown) => toast.error(errorMessage(error));

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={false}
      >
        <ScrumTabs spaceId={spaceId} current="history" />
      </ContainerHeader>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            {t('retro.title', { name: retro.data.sprint.name })}
          </h1>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to="/spaces/$spaceId/review/$sprintId" params={{ spaceId, sprintId }}>
              {t('retro.openReview')}
            </Link>
          </Button>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {RETRO_COLUMNS.map((column) => (
            <RetroColumnView
              key={column}
              column={column}
              items={retro.data.items.filter((i) => i.column === column)}
              canParticipate={canParticipate}
              pending={actions.add.isPending}
              onAdd={(text) =>
                actions.add.mutateAsync({ column, text }).then(
                  () => true,
                  (error) => {
                    onError(error);
                    return false;
                  },
                )
              }
              onVote={(id) => actions.vote.mutate(id, { onError })}
              onRemove={(id) => actions.remove.mutate(id, { onError })}
              onToTask={(id) =>
                void actions.toTask
                  .mutateAsync(id)
                  .then((task) => toast.success(t('retro.taskCreated', { key: task.key })), onError)
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}

function RetroColumnView({
  column,
  items,
  canParticipate,
  pending,
  onAdd,
  onVote,
  onRemove,
  onToTask,
}: {
  column: RetroColumn;
  items: RetroItem[];
  canParticipate: boolean;
  pending: boolean;
  onAdd: (text: string) => Promise<boolean>;
  onVote: (id: string) => void;
  onRemove: (id: string) => void;
  onToTask: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const title = t(`retro.column.${column}`);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    void onAdd(value).then((ok) => ok && setText(''));
  };

  return (
    <section
      aria-label={title}
      className={cn(
        'bg-card flex flex-col gap-3 rounded-lg border border-t-4 p-3',
        COLUMN_TONE[column],
      )}
    >
      <h2 className="text-sm font-semibold">
        {title} <span className="text-muted-foreground font-normal">{items.length}</span>
      </h2>
      {canParticipate && (
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={RETRO_TEXT_MAX}
            placeholder={t('retro.addPlaceholder')}
            aria-label={t('retro.addTo', { column: title })}
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={pending || !text.trim()}>
            {t('retro.add')}
          </Button>
        </form>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-sm">{t('retro.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="bg-background flex flex-col gap-1.5 rounded-md border p-2.5"
            >
              <p className="text-sm break-words">{item.text}</p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span>{item.author?.name ?? '—'}</span>
                <Button
                  variant={item.voted ? 'secondary' : 'ghost'}
                  size="sm"
                  className="ml-auto h-6 gap-1 px-1.5"
                  disabled={!canParticipate}
                  aria-pressed={item.voted}
                  aria-label={t('retro.vote', { text: item.text })}
                  onClick={() => onVote(item.id)}
                >
                  <ThumbsUp className="size-3.5" /> {item.votes}
                </Button>
                {column === 'ACTION' && canParticipate && !item.task && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5"
                    aria-label={t('retro.toTaskNamed', { text: item.text })}
                    onClick={() => onToTask(item.id)}
                  >
                    <ListPlus className="size-3.5" /> {t('retro.toTask')}
                  </Button>
                )}
                {item.canDelete && canParticipate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t('retro.remove', { text: item.text })}
                    onClick={() => onRemove(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
              {item.task && (
                <Link
                  to="/items/$key"
                  params={{ key: item.task.key }}
                  className="text-primary text-xs hover:underline"
                >
                  {item.task.key} · {item.task.title}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
