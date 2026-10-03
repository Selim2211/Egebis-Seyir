import { DashboardSchema, FlowSchema, type Dashboard } from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const flowQuery = (workspaceId: string, spaceId: string, days: number) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'flow', days],
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/flow?days=${days}`, FlowSchema),
  });

export const dashboardQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'dashboard'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/dashboard`, DashboardSchema),
  });

/** Düzen değişikliği anında ekrana yansır; sunucu normalleştirilmiş hâli döndürünce önbellek ona eşitlenir. */
export function useSaveDashboard(spaceId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  const key = dashboardQuery(id, spaceId).queryKey;
  return useMutation({
    mutationFn: (body: Dashboard) =>
      apiRequest(`${ws(id)}/spaces/${spaceId}/dashboard`, DashboardSchema, {
        method: 'PUT',
        body,
      }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Dashboard>(key);
      qc.setQueryData<Dashboard>(key, body);
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (saved) => qc.setQueryData(key, saved),
  });
}
