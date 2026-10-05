import {
  AiSplitSuggestionSchema,
  AiStatusSchema,
  AiStorySuggestionSchema,
  AiSummarySchema,
  type AiSplitSuggestion,
  type AiStorySuggestion,
  type WorkItemDetail,
} from '@scrum/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ListPlus, Loader2, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCreateItem, useChecklist, useUpdateItemFields } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

/** Düz metni satır satır Tiptap belgesine çevirir. */
function paragraphs(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }));
}

type Result =
  | { kind: 'summary'; text: string }
  | { kind: 'story'; data: AiStorySuggestion }
  | { kind: 'split'; data: AiSplitSuggestion };

/**
 * Yapay zekâ destekli öneriler (brief §5.19, ADR-090): özetle, hikâye + kabul kriteri öner, Epic'i böl.
 * Sunucuda anahtar tanımlı değilse hiçbir şey çizilmez. Öneriler yalnızca kullanıcı onaylayınca uygulanır.
 */
export function AiAssist({ item, canWrite }: { item: WorkItemDetail; canWrite: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const status = useQuery({
    queryKey: ['workspaces', workspaceId, 'ai-status'],
    queryFn: () => apiRequest(`/workspaces/${workspaceId}/ai/status`, AiStatusSchema),
    staleTime: 5 * 60_000,
  });
  const [result, setResult] = useState<Result | null>(null);
  const base = `/workspaces/${workspaceId}/items/${item.id}/ai`;

  const run = useMutation({
    mutationFn: async (kind: 'summarize' | 'suggest-story' | 'split-epic'): Promise<Result> => {
      if (kind === 'summarize') {
        const { summary } = await apiRequest(`${base}/summarize`, AiSummarySchema, {
          method: 'POST',
          body: {},
        });
        return { kind: 'summary', text: summary };
      }
      if (kind === 'suggest-story') {
        return {
          kind: 'story',
          data: await apiRequest(`${base}/suggest-story`, AiStorySuggestionSchema, {
            method: 'POST',
            body: {},
          }),
        };
      }
      return {
        kind: 'split',
        data: await apiRequest(`${base}/split-epic`, AiSplitSuggestionSchema, {
          method: 'POST',
          body: {},
        }),
      };
    },
    onSuccess: setResult,
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!status.data?.enabled) return null;
  const isEpic = item.type === 'EPIC';
  const canStory = canWrite && !isEpic && item.type !== 'SUBTASK';

  return (
    <section aria-label={t('ai.title')} className="mt-4 border-t pt-3">
      <div className="flex items-center gap-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t('ai.title')}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-7" disabled={run.isPending}>
              {run.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {t('ai.assist')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => run.mutate('summarize')}>
              {t('ai.summarize')}
            </DropdownMenuItem>
            {canStory && (
              <DropdownMenuItem onSelect={() => run.mutate('suggest-story')}>
                {t('ai.suggestStory')}
              </DropdownMenuItem>
            )}
            {canWrite && isEpic && (
              <DropdownMenuItem onSelect={() => run.mutate('split-epic')}>
                {t('ai.splitEpic')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {result && (
        <div
          className="bg-muted/30 mt-2 rounded-md p-3 text-sm"
          role="region"
          aria-label={t('ai.result')}
        >
          <div className="mb-1 flex items-center">
            <p className="text-muted-foreground text-xs">{t('ai.disclaimer')}</p>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-6"
              aria-label={t('common.close')}
              onClick={() => setResult(null)}
            >
              <X />
            </Button>
          </div>
          {result.kind === 'summary' && <p className="whitespace-pre-wrap">{result.text}</p>}
          {result.kind === 'story' && <StoryResult item={item} data={result.data} />}
          {result.kind === 'split' && <SplitResult item={item} data={result.data} />}
        </div>
      )}
    </section>
  );
}

function StoryResult({ item, data }: { item: WorkItemDetail; data: AiStorySuggestion }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateItemFields();
  const checklist = useChecklist();
  const [done, setDone] = useState<{ description?: boolean; criteria?: boolean }>({});

  const addDescription = () => {
    const existing = item.description?.content ?? [];
    update.mutate(
      {
        itemId: item.id,
        body: {
          description: {
            type: 'doc',
            content: [...existing, ...paragraphs(data.description)],
          } as never,
        },
      },
      {
        onSuccess: () => setDone((d) => ({ ...d, description: true })),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };
  const addCriteria = async () => {
    try {
      const made = (await checklist.mutateAsync({
        itemId: item.id,
        op: 'createList',
        title: t('ai.criteriaTitle'),
      })) as { id: string };
      const { id } = made;
      for (const text of data.acceptanceCriteria) {
        await checklist.mutateAsync({ itemId: item.id, op: 'addEntry', checklistId: id, text });
      }
      setDone((d) => ({ ...d, criteria: true }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-wrap">{data.description}</p>
      <ul className="list-disc pl-5">
        {data.acceptanceCriteria.map((criterion, i) => (
          <li key={i}>{criterion}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={done.description || update.isPending}
          onClick={addDescription}
        >
          {done.description ? t('ai.added') : t('ai.addDescription')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={done.criteria || checklist.isPending || data.acceptanceCriteria.length === 0}
          onClick={() => void addCriteria()}
        >
          {done.criteria ? t('ai.added') : t('ai.addCriteria')}
        </Button>
      </div>
    </div>
  );
}

function SplitResult({ item, data }: { item: WorkItemDetail; data: AiSplitSuggestion }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateItem();
  const update = useUpdateItemFields();
  const [created, setCreated] = useState<Set<number>>(new Set());

  const make = async (index: number) => {
    const story = data.stories[index]!;
    try {
      const made = await create.mutateAsync({
        listId: item.listId,
        body: { type: 'STORY', title: story.title, parentId: item.id },
      });
      if (story.description.trim()) {
        await update.mutateAsync({
          itemId: made.id,
          body: { description: { type: 'doc', content: paragraphs(story.description) } as never },
        });
      }
      setCreated((set) => new Set(set).add(index));
      toast.success(t('ai.storyCreated', { key: made.key }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <ul className="flex flex-col gap-2">
      {data.stories.map((story, index) => (
        <li key={index} className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{story.title}</span>
            <span className="text-muted-foreground block text-xs">{story.description}</span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={created.has(index) || create.isPending}
            aria-label={t('ai.createStory', { title: story.title })}
            onClick={() => void make(index)}
          >
            <ListPlus />
            {created.has(index) ? t('ai.added') : t('ai.create')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
