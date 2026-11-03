import {
  AiEstimateSchema,
  AiStatusSchema,
  countSentences,
  richTextToPlain,
  type AiEstimate,
  type WorkItemDetail,
} from '@scrum/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * AI ile Story Point önerisi (yönetici notları madde 8, ADR-155). Açıklama Super Admin'in belirlediği
 * cümle sayısına ulaşmadan düğme pasiftir; öneri yalnızca "Uygula" ile puana yazılır.
 */
export function AiEstimateButton({
  item,
  onApply,
}: {
  item: WorkItemDetail;
  onApply: (points: number) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const status = useQuery({
    queryKey: ['workspaces', workspaceId, 'ai-status'],
    queryFn: () => apiRequest(`/workspaces/${workspaceId}/ai/status`, AiStatusSchema),
    staleTime: 5 * 60_000,
  });
  const [result, setResult] = useState<AiEstimate | null>(null);
  const run = useMutation({
    mutationFn: () =>
      apiRequest(`/workspaces/${workspaceId}/items/${item.id}/ai/estimate`, AiEstimateSchema, {
        method: 'POST',
        body: {},
      }),
    onSuccess: setResult,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!status.data?.enabled || !status.data.estimate.enabled || item.type === 'EPIC') return null;
  const min = status.data.estimate.minSentences;
  const count = item.description ? countSentences(richTextToPlain(item.description)) : 0;
  const short = count < min;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={short || run.isPending}
          onClick={() => run.mutate()}
          data-testid="ai-estimate"
        >
          {run.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3.5" aria-hidden />
          )}
          {t('aiEstimate.button')}
        </Button>
        <span
          className={
            short
              ? 'text-muted-foreground text-xs'
              : 'text-xs text-emerald-700 dark:text-emerald-400'
          }
        >
          {t('aiEstimate.sentences', { count, min })}
        </span>
      </div>
      {result && (
        <div
          className="bg-primary/5 border-primary/20 rounded-md border p-2.5 text-xs"
          data-testid="ai-estimate-result"
        >
          <p className="flex items-center gap-2 text-sm">
            <span className="font-semibold">
              {t('aiEstimate.suggested', { points: result.points })}
            </span>
            <span className="text-muted-foreground">
              {t(`aiEstimate.confidence.${result.confidence}`)}
            </span>
          </p>
          <p className="text-muted-foreground mt-1">{result.reason}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onApply(result.points);
                setResult(null);
              }}
            >
              <Check className="size-3.5" /> {t('aiEstimate.apply')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setResult(null)}
            >
              <X className="size-3.5" /> {t('aiEstimate.dismiss')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
