import {
  AiSprintGoalSchema,
  AiStatusSchema,
  SPRINT_GOAL_MIN_LENGTH,
  type AiSprintGoal,
  type AiSprintGoalRequest,
} from '@scrum/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useErrorMessage } from '@/lib/use-error-message';

const VERDICT_TONE: Record<NonNullable<AiSprintGoal['verdict']>, string> = {
  FITS: 'text-emerald-700 dark:text-emerald-400',
  PARTIAL: 'text-amber-700 dark:text-amber-400',
  OFF_TRACK: 'text-destructive',
};

/**
 * Sprint penceresinde "AI ile öner" ve "AI ile kontrol et" (ADR-175). AI projeyi ve geçmiş
 * sprint'leri okuyarak hedef önerir ya da yazılan hedefin uyumunu puanlar; sonuç yalnızca
 * "Kullan" ile forma yazılır, kaydetmek yine kullanıcının elindedir.
 */
export function AiSprintGoal({
  spaceId,
  sprintId,
  name,
  goal,
  onUse,
}: {
  spaceId: string;
  /** Düzenlenen sprint; yeni sprint'te yok (Backlog'un üstü esas alınır). */
  sprintId?: string;
  name: string;
  goal: string;
  onUse: (goal: string) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const status = useQuery({
    queryKey: ['workspaces', workspaceId, 'ai-status'],
    queryFn: () => apiRequest(`/workspaces/${workspaceId}/ai/status`, AiStatusSchema),
    staleTime: 5 * 60_000,
  });
  const [result, setResult] = useState<(AiSprintGoal & { mode: 'SUGGEST' | 'CHECK' }) | null>(null);
  const run = useMutation({
    mutationFn: (mode: AiSprintGoalRequest['mode']) =>
      apiRequest(
        `/workspaces/${workspaceId}/spaces/${spaceId}/ai/sprint-goal`,
        AiSprintGoalSchema,
        {
          method: 'POST',
          body: {
            mode,
            ...(sprintId && { sprintId }),
            ...(name.trim() && { name: name.trim().slice(0, 80) }),
            ...(mode === 'CHECK' && { goal: goal.trim() }),
          } satisfies AiSprintGoalRequest,
        },
      ).then((r) => ({ ...r, mode })),
    onSuccess: setResult,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!status.data?.enabled || !status.data.sprintGoal.enabled) return null;
  const hasGoal = goal.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5" data-testid="ai-sprint-goal">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={run.isPending}
          onClick={() => run.mutate('SUGGEST')}
          data-testid="ai-goal-suggest"
        >
          {run.isPending && run.variables === 'SUGGEST' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          {t('aiSprintGoal.suggest')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={run.isPending || !hasGoal}
          title={hasGoal ? undefined : t('aiSprintGoal.needGoal')}
          onClick={() => run.mutate('CHECK')}
          data-testid="ai-goal-check"
        >
          {run.isPending && run.variables === 'CHECK' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="size-3.5" aria-hidden />
          )}
          {t('aiSprintGoal.check')}
        </Button>
        {run.isPending && (
          <span className="text-muted-foreground text-xs" role="status">
            {t('aiSprintGoal.working')}
          </span>
        )}
      </div>
      {result && (
        <div
          className="bg-primary/5 border-primary/20 rounded-md border p-2.5 text-xs"
          data-testid="ai-goal-result"
          role="region"
          aria-label={t(
            result.mode === 'CHECK' ? 'aiSprintGoal.improved' : 'aiSprintGoal.suggestion',
          )}
        >
          {result.mode === 'CHECK' && result.verdict && (
            <p className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className={cn('font-semibold', VERDICT_TONE[result.verdict])}>
                {t(`aiSprintGoal.verdict.${result.verdict}`)}
              </span>
              {result.score !== null && (
                <span className="text-muted-foreground">
                  {t('aiSprintGoal.score', { score: result.score })}
                </span>
              )}
            </p>
          )}
          {result.feedback.length > 0 && (
            <ul className="text-muted-foreground mb-2 list-disc space-y-0.5 pl-4">
              {result.feedback.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          <p className="font-medium">
            {t(result.mode === 'CHECK' ? 'aiSprintGoal.improved' : 'aiSprintGoal.suggestion')}
          </p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap">{result.goal}</p>
          {!result.meetsMinLength && (
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              {t('aiSprintGoal.tooShort', { min: SPRINT_GOAL_MIN_LENGTH })}
            </p>
          )}
          <p className="text-muted-foreground mt-1">{t('aiSprintGoal.disclaimer')}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onUse(result.goal.slice(0, 500));
                setResult(null);
              }}
              data-testid="ai-goal-use"
            >
              <Check className="size-3.5" /> {t('aiSprintGoal.use')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setResult(null)}
            >
              <X className="size-3.5" /> {t('aiSprintGoal.dismiss')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
