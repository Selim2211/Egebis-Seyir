import { SPACE_PERMISSIONS as S, SPRINT_GOAL_MIN_LENGTH, type SprintSummary } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AiSprintGoal } from '@/features/ai/ai-sprint-goal';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { GoalCount } from './goal-count';
import { sprintsQuery, useUpdateSprint } from './queries';
import { ScrumTabs } from './scrum-tabs';

/** Bitmiş ya da iptal edilmiş sprint'in hedefi kayıt olarak kalır, değiştirilmez. */
const editable = (status: SprintSummary['status']) =>
  status !== 'COMPLETED' && status !== 'CANCELLED';

/**
 * Sprint hedefleri sekmesi (yönetici 5. tur, ADR-176): Projenin tüm sprint'lerinin hedefleri tek
 * sayfada; açık sprint'lerin hedefi buradan yazılır, AI ile önerilir ya da kontrol edilir.
 */
export function GoalsPage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (space.isPending || sprints.isPending) return <LoadingState />;
  if (space.isError || sprints.isError) return <NotFoundState />;

  // En yeni sprint (başlangıç tarihine göre) varsayılandır; diğerleri aramayla seçilir.
  const sorted = [...sprints.data.sprints].sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
  );
  const current = sorted.find((sprint) => sprint.id === pickedId) ?? sorted[0];
  const canPlan = space.data.permissions.includes(S.SPRINT_PLAN);

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      >
        <ScrumTabs spaceId={spaceId} current="goals" />
      </ContainerHeader>
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 sm:px-6">
        <p className="text-muted-foreground text-sm">
          {t('sprintGoals.help', { min: SPRINT_GOAL_MIN_LENGTH })}
        </p>
        {!current ? (
          <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
            {t('sprintGoals.empty')}
          </p>
        ) : (
          <>
            <SprintPicker sprints={sorted} current={current} onPick={setPickedId} />
            <GoalCard
              key={`${current.id}:${current.goal ?? ''}`}
              spaceId={spaceId}
              sprint={current}
              canEdit={canPlan && editable(current.status)}
            />
          </>
        )}
      </div>
    </>
  );
}

/** Sprint arama kutusu: ada ya da hedefe göre süzer, seçilen sprint aşağıda açılır. */
function SprintPicker({
  sprints,
  current,
  onPick,
}: {
  sprints: SprintSummary[];
  current: SprintSummary;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLocaleLowerCase('tr');
  const matches = sprints
    .filter(
      (sprint) =>
        !needle ||
        sprint.name.toLocaleLowerCase('tr').includes(needle) ||
        (sprint.goal ?? '').toLocaleLowerCase('tr').includes(needle),
    )
    .slice(0, 8);
  return (
    <div className="relative max-w-md">
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4"
      />
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={t('sprintGoals.search')}
        placeholder={t('sprintGoals.searchPlaceholder', { name: current.name })}
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="bg-background focus-visible:ring-ring h-9 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="bg-popover absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border p-1 shadow-md"
        >
          {matches.length === 0 && (
            <li className="text-muted-foreground px-2 py-2 text-sm">{t('sprintGoals.noMatch')}</li>
          )}
          {matches.map((sprint) => (
            <li
              key={sprint.id}
              role="option"
              aria-selected={sprint.id === current.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(sprint.id);
                setQuery('');
                setOpen(false);
              }}
              className="hover:bg-accent flex cursor-pointer flex-col rounded px-2 py-1.5 text-sm aria-selected:font-semibold"
            >
              <span>
                {sprint.name}{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  {t(`sprints.status.${sprint.status}`)}
                </span>
              </span>
              {sprint.goal && (
                <span className="text-muted-foreground truncate text-xs font-normal">
                  {sprint.goal}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GoalCard({
  spaceId,
  sprint,
  canEdit,
}: {
  spaceId: string;
  sprint: SprintSummary;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const errorMessage = useErrorMessage();
  const update = useUpdateSprint();
  const saved = sprint.goal ?? '';
  const [goal, setGoal] = useState(saved);
  const length = goal.trim().length;
  const tooShort = length > 0 && length < SPRINT_GOAL_MIN_LENGTH;
  const dirty = goal.trim() !== saved.trim();

  const save = () => {
    if (tooShort) return;
    update.mutate(
      { sprintId: sprint.id, body: { goal: length === 0 ? null : goal.trim() } },
      {
        onSuccess: () => toast.success(t('sprintGoals.saved', { name: sprint.name })),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <section
      aria-labelledby={`${id}-name`}
      className="bg-card flex flex-col gap-2 rounded-lg border p-4"
      data-testid="sprint-goal-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${id}-name`} className="text-sm font-semibold">
          {sprint.name}
        </h2>
        <Badge variant={sprint.status === 'ACTIVE' ? 'default' : 'outline'}>
          {t(`sprints.status.${sprint.status}`)}
        </Badge>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)}
        </span>
      </div>
      {canEdit ? (
        <>
          <Textarea
            aria-label={t('sprintGoals.goalFor', { name: sprint.name })}
            rows={3}
            maxLength={500}
            value={goal}
            placeholder={t('sprints.goalPlaceholder')}
            aria-invalid={tooShort || undefined}
            onChange={(e) => setGoal(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {tooShort ? (
              <span className="text-destructive">
                {t('sprints.errors.SPRINT_GOAL_TOO_SHORT', { min: SPRINT_GOAL_MIN_LENGTH })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t('sprints.goalHint', { min: SPRINT_GOAL_MIN_LENGTH })}
              </span>
            )}
            <div className="flex items-center gap-3">
              <GoalCount length={length} />
              {dirty && (
                <Button
                  size="sm"
                  onClick={save}
                  disabled={tooShort || update.isPending}
                  aria-label={t('sprintGoals.saveFor', { name: sprint.name })}
                >
                  {update.isPending ? t('common.saving') : t('common.save')}
                </Button>
              )}
            </div>
          </div>
          <AiSprintGoal
            spaceId={spaceId}
            sprintId={sprint.id}
            name={sprint.name}
            goal={goal}
            onUse={setGoal}
          />
        </>
      ) : (
        <p className="text-sm whitespace-pre-wrap">
          {sprint.goal ?? <span className="text-muted-foreground">{t('sprintGoals.none')}</span>}
        </p>
      )}
    </section>
  );
}
