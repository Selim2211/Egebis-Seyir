import { SPACE_PERMISSIONS as S } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { ItemNavContext } from '@/features/work-items/detail/item-nav-context';
import { ItemOpenLink } from '@/features/work-items/detail/item-nav';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatDate, formatShortDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { BacklogRow } from './backlog-row';
import { sprintReviewQuery, useSetReviewNotes } from './queries';
import { ScrumTabs } from './scrum-tabs';

/** Sprint Review özeti (brief §5.6): sonuçlar, bitenler/bitmeyenler, kapsam değişiklikleri, demo notları. */
export function ReviewPage({ spaceId, sprintId }: { spaceId: string; sprintId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const review = useQuery(sprintReviewQuery(workspaceId, sprintId));

  if (space.isPending || review.isPending) return <LoadingState />;
  if (space.isError || review.isError || review.data.sprint.spaceId !== spaceId) {
    return <NotFoundState />;
  }

  const { sprint, completed, unfinished, scopeChanges, notes } = review.data;
  const canNote = space.data.permissions.includes(S.SPRINT_COMPLETE) && !space.data.archived;
  const points = sprint.completedPoints ?? sprint.donePoints;

  return (
    <ItemNavContext.Provider value={(key) => void navigate({ to: '/items/$key', params: { key } })}>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="history" />
      </ContainerHeader>

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{t('review.title', { name: sprint.name })}</h1>
            <Badge variant={sprint.status === 'ACTIVE' ? 'default' : 'outline'}>
              {t(`sprints.status.${sprint.status}`)}
            </Badge>
            <Button asChild variant="ghost" size="sm" className="ml-auto">
              <Link to="/spaces/$spaceId/board" params={{ spaceId }} search={{ sprint: sprint.id }}>
                {t('review.openBoard')}
              </Link>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
            {sprint.completedAt &&
              ` · ${t('review.completedOn', { date: formatDate(sprint.completedAt) })}`}
          </p>
          {sprint.goal && (
            <p className="text-sm">
              <span className="font-medium">{t('sprints.goal')}:</span> {sprint.goal}
            </p>
          )}
          {sprint.status === 'ACTIVE' && (
            <p role="status" className="text-muted-foreground text-xs">
              {t('review.preview')}
            </p>
          )}
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('review.points')} value={points} />
          <Stat
            label={t('review.doneItems')}
            value={`${completed.length} / ${completed.length + unfinished.length}`}
          />
          <Stat label={t('review.unfinishedItems')} value={unfinished.length} />
          <Stat label={t('review.scopeChanges')} value={scopeChanges.length} />
        </dl>

        <ItemList
          title={t('review.completed')}
          empty={t('review.completedEmpty')}
          count={completed.length}
        >
          {completed.map((item) => (
            <BacklogRow
              key={item.id}
              item={item}
              targets={[]}
              canPlan={false}
              onMove={() => undefined}
            />
          ))}
        </ItemList>

        <ItemList
          title={t('review.unfinished')}
          empty={t('review.unfinishedEmpty')}
          count={unfinished.length}
        >
          {unfinished.map((item) => (
            <BacklogRow
              key={item.id}
              item={item}
              targets={[]}
              canPlan={false}
              onMove={() => undefined}
            />
          ))}
        </ItemList>

        {scopeChanges.length > 0 && (
          <section aria-labelledby="review-scope">
            <h2 id="review-scope" className="mb-2 text-sm font-semibold">
              {t('review.scopeChanges')}
            </h2>
            <ul className="bg-card divide-y rounded-lg border">
              {scopeChanges.map((change, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge variant={change.action === 'ADDED' ? 'secondary' : 'outline'}>
                    {t(`review.action.${change.action}`)}
                  </Badge>
                  <ItemOpenLink
                    itemKey={change.item.key}
                    className="font-mono text-xs hover:underline"
                  >
                    {change.item.key}
                  </ItemOpenLink>
                  <span className="min-w-0 flex-1 truncate">{change.item.title}</span>
                  {change.points !== null && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {change.action === 'ADDED' ? '+' : '−'}
                      {change.points}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">{formatDate(change.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Notes sprintId={sprintId} notes={notes} editable={canNote} />
      </div>
    </ItemNavContext.Provider>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-card rounded-lg border px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ItemList({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="text-muted-foreground text-xs font-normal tabular-nums">{count}</span>
      </h2>
      <div className="bg-card overflow-hidden rounded-lg border">
        {count === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Notes({
  sprintId,
  notes,
  editable,
}: {
  sprintId: string;
  notes: string | null;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const save = useSetReviewNotes();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? notes ?? '';

  return (
    <section aria-labelledby="review-notes">
      <h2 id="review-notes" className="mb-2 text-sm font-semibold">
        {t('review.notes')}
      </h2>
      {editable ? (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={5}
            maxLength={5000}
            value={value}
            placeholder={t('review.notesPlaceholder')}
            aria-labelledby="review-notes"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div>
            <Button
              size="sm"
              disabled={draft === null || save.isPending}
              onClick={() =>
                save.mutate(
                  { sprintId, notes: draft },
                  {
                    onSuccess: () => {
                      toast.success(t('review.notesSaved'));
                      setDraft(null);
                    },
                    onError: (error) => toast.error(errorMessage(error)),
                  },
                )
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : notes ? (
        <p className="bg-card rounded-lg border px-4 py-3 text-sm whitespace-pre-line">{notes}</p>
      ) : (
        <p className="text-muted-foreground text-sm">{t('review.noNotes')}</p>
      )}
    </section>
  );
}
