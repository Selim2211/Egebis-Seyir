import { ItemAccessSchema, type PutItemAccessRequest } from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const itemAccessQuery = (workspaceId: string, itemId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'items', itemId, 'access'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/items/${itemId}/access`, ItemAccessSchema),
  });

export function useItemAccess(itemId: string, enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...itemAccessQuery(id, itemId), enabled });
}

/** Erişim değişince listeler, ağaç ve detay da değişebilir; çalışma alanı sorgularını yeniler. */
function useAccessMutation<T>(fn: (workspaceId: string, input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const usePutItemAccess = () =>
  useAccessMutation((id, input: { itemId: string; body: PutItemAccessRequest }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/access`, NoContent, {
      method: 'PUT',
      body: input.body,
    }),
  );

export const useClearItemAccess = () =>
  useAccessMutation((id, itemId: string) =>
    apiRequest(`${ws(id)}/items/${itemId}/access`, NoContent, { method: 'DELETE' }),
  );
