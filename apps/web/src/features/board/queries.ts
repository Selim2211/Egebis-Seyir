import { SprintDetailSchema, type SprintDetail } from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import type { BoardStatus } from './board-model';

/** Sprint panosu: sprint öğeleri ve tüm alt öğeleri (üstlerinin arkasında). */
export const sprintBoardQuery = (workspaceId: string, sprintId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'sprints', sprintId, 'board'],
    queryFn: () =>
      apiRequest(`/workspaces/${workspaceId}/sprints/${sprintId}?tree=true`, SprintDetailSchema),
  });

/**
 * Sprint panosunda durum değişikliği; kart anında yeni sütuna geçer (optimistic),
 * hata olursa (uyarı onayı dahil) eski yerine döner.
 */
export function useSprintBoardStatus(sprintId: string, statuses: readonly BoardStatus[]) {
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const key = sprintBoardQuery(workspaceId, sprintId).queryKey;
  return useMutation({
    mutationFn: (input: { itemId: string; statusId: string; force?: boolean }) =>
      apiRequest(`/workspaces/${workspaceId}/items/${input.itemId}`, NoContent, {
        method: 'PATCH',
        body: { statusId: input.statusId, ...(input.force && { force: true }) },
      }),
    onMutate: async ({ itemId, statusId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SprintDetail>(key);
      const status = statuses.find((s) => s.id === statusId);
      if (previous && status) {
        qc.setQueryData<SprintDetail>(key, {
          ...previous,
          items: previous.items.map((item) =>
            item.id === itemId ? { ...item, statusId, status } : item,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId] }),
  });
}
