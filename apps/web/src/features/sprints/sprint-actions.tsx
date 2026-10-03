import { SPACE_PERMISSIONS as S, type SprintSummary } from '@scrum/shared';
import { Flag, Play, XCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatShortDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { useCancelSprint, useCompleteSprint, useStartSprint } from './queries';

/**
 * Sprint yaşam döngüsü düğmeleri (brief §6.1): planlıda Başlat, aktifte Tamamla, ikisinde İptal.
 * Görünürlük izne göre; kural denetimi sunucudadır, burada yalnızca erken uyarı verilir.
 */
export function SprintActions({
  sprint,
  permissions,
  goalRequired,
  plannedOthers,
  archived,
}: {
  sprint: SprintSummary;
  permissions: readonly string[];
  goalRequired: boolean;
  /** Devredilebilecek diğer planlı sprint'ler. */
  plannedOthers: readonly SprintSummary[];
  archived: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<'start' | 'complete' | 'cancel' | null>(null);
  const isOpen = sprint.status === 'PLANNED' || sprint.status === 'ACTIVE';
  if (archived || !isOpen) return null;

  const canStart = permissions.includes(S.SPRINT_START) && sprint.status === 'PLANNED';
  const canComplete = permissions.includes(S.SPRINT_COMPLETE) && sprint.status === 'ACTIVE';
  const canCancel = permissions.includes(S.SPRINT_CANCEL);

  return (
    <>
      {canStart && (
        <Button size="sm" variant="outline" onClick={() => setOpen('start')}>
          <Play />
          {t('sprints.start')}
        </Button>
      )}
      {canComplete && (
        <Button size="sm" variant="outline" onClick={() => setOpen('complete')}>
          <Flag />
          {t('sprints.complete')}
        </Button>
      )}
      {canCancel && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen('cancel')}
          aria-label={t('sprints.cancelAction', { name: sprint.name })}
        >
          <XCircle />
          <span className="max-sm:sr-only">{t('sprints.cancel')}</span>
        </Button>
      )}
      <StartDialog
        sprint={sprint}
        goalRequired={goalRequired}
        open={open === 'start'}
        onClose={() => setOpen(null)}
      />
      <CompleteDialog
        sprint={sprint}
        plannedOthers={plannedOthers}
        open={open === 'complete'}
        onClose={() => setOpen(null)}
      />
      <CancelDialog sprint={sprint} open={open === 'cancel'} onClose={() => setOpen(null)} />
    </>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm'
          : 'rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
      }
    >
      {children}
    </p>
  );
}

function StartDialog({
  sprint,
  goalRequired,
  open,
  onClose,
}: {
  sprint: SprintSummary;
  goalRequired: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const start = useStartSprint();
  const noGoal = !sprint.goal?.trim();
  const blocked = noGoal && goalRequired;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('sprints.startTitle', { name: sprint.name })}</DialogTitle>
          <DialogDescription>
            {formatShortDate(sprint.startDate)} – {formatShortDate(sprint.endDate)} ·{' '}
            {t('sprints.totals', { count: sprint.itemCount, points: sprint.points })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {blocked && <Notice tone="error">{t('sprints.goalRequired')}</Notice>}
          {noGoal && !goalRequired && <Notice tone="warn">{t('sprints.goalMissingWarn')}</Notice>}
          {sprint.itemCount === 0 && <Notice tone="warn">{t('sprints.emptyWarn')}</Notice>}
          {sprint.unestimatedCount > 0 && (
            <Notice tone="warn">
              {t('sprints.unestimatedWarn', { count: sprint.unestimatedCount })}
            </Notice>
          )}
          {start.error && <FormError error={start.error} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={blocked || start.isPending}
            onClick={() =>
              start.mutate(sprint.id, {
                onSuccess: () => {
                  toast.success(t('sprints.started', { name: sprint.name }));
                  onClose();
                },
              })
            }
          >
            {t('sprints.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  sprint,
  plannedOthers,
  open,
  onClose,
}: {
  sprint: SprintSummary;
  plannedOthers: readonly SprintSummary[];
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const complete = useCompleteSprint();
  const unfinished = sprint.itemCount - sprint.doneItemCount;
  const [target, setTarget] = useState<string>(plannedOthers[0]?.id ?? 'BACKLOG');
  const chosen = plannedOthers.some((s) => s.id === target) ? target : 'BACKLOG';

  const submit = () =>
    complete.mutate(
      {
        sprintId: sprint.id,
        body:
          chosen === 'BACKLOG'
            ? { unfinished: 'BACKLOG' }
            : { unfinished: 'NEXT_SPRINT', nextSprintId: chosen },
      },
      {
        onSuccess: () => {
          toast.success(t('sprints.completed', { name: sprint.name }));
          onClose();
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('sprints.completeTitle', { name: sprint.name })}</DialogTitle>
          <DialogDescription>
            {t('sprints.completeSummary', {
              done: sprint.doneItemCount,
              total: sprint.itemCount,
              points: sprint.donePoints,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {unfinished === 0 ? (
            <p className="text-sm">{t('sprints.allDone')}</p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                {t('sprints.unfinishedQuestion', { count: unfinished })}
              </legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="unfinished"
                  className="mt-1"
                  checked={chosen !== 'BACKLOG'}
                  disabled={plannedOthers.length === 0}
                  onChange={() => setTarget(plannedOthers[0]?.id ?? 'BACKLOG')}
                />
                <span className="flex flex-1 flex-col gap-1.5">
                  {t('sprints.carryOver')}
                  <NativeSelect
                    value={chosen}
                    disabled={chosen === 'BACKLOG'}
                    aria-label={t('sprints.nextSprint')}
                    onChange={(e) => setTarget(e.target.value)}
                    className="h-8"
                  >
                    {plannedOthers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    {plannedOthers.length === 0 && <option value="BACKLOG">—</option>}
                  </NativeSelect>
                  {plannedOthers.length === 0 && (
                    <span className="text-muted-foreground text-xs">
                      {t('sprints.noNextSprint')}
                    </span>
                  )}
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="unfinished"
                  checked={chosen === 'BACKLOG'}
                  onChange={() => setTarget('BACKLOG')}
                />
                {t('sprints.toBacklog')}
              </label>
            </fieldset>
          )}
          {complete.error && <FormError error={complete.error} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={complete.isPending} onClick={submit}>
            {t('sprints.complete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  sprint,
  open,
  onClose,
}: {
  sprint: SprintSummary;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const cancel = useCancelSprint();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('sprints.cancelTitle', { name: sprint.name })}
      description={t('sprints.cancelBody', { count: sprint.itemCount })}
      confirmLabel={t('sprints.cancel')}
      pending={cancel.isPending}
      onConfirm={() =>
        cancel.mutate(sprint.id, {
          onSuccess: () => {
            toast.success(t('sprints.cancelled', { name: sprint.name }));
            onClose();
          },
          onError: (error) => {
            toast.error(errorMessage(error));
            onClose();
          },
        })
      }
    />
  );
}
