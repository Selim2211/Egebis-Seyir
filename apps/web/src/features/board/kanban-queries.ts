import { WorkItemsResponseSchema, type WorkItemsResponse } from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

/** Space geneli Kanban panosu: tüm listelerin açık öğeleri (ADR-115). */
export const kanbanQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'kanban'],
    queryFn: () =>
      apiRequest(`/workspaces/${workspaceId}/spaces/${spaceId}/kanban`, WorkItemsResponseSchema),
  });

/** Kartı yeni sütuna taşır; kart anında geçer (optimistic), hata olursa geri döner. */
export function useKanbanStatus(spaceId: string) {
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const key = kanbanQuery(workspaceId, spaceId).queryKey;
  return useMutation({
    mutationFn: (input: { itemId: string; statusId: string; force?: boolean }) =>
      apiRequest(`/workspaces/${workspaceId}/items/${input.itemId}`, NoContent, {
        method: 'PATCH',
        body: { statusId: input.statusId, ...(input.force && { force: true }) },
      }),
    onMutate: async ({ itemId, statusId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<WorkItemsResponse>(key);
      if (previous) {
        qc.setQueryData<WorkItemsResponse>(key, {
          ...previous,
          items: previous.items.map((item) => (item.id === itemId ? { ...item, statusId } : item)),
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
