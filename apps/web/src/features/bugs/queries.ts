import {
  type BugStatus,
  BugsResponseSchema,
  type CreateBugRequest,
  CreatedItemSchema,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

/** Space'in Bug'ları (ADR-117). */
export const bugsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'bugs'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/bugs`, BugsResponseSchema),
  });

export function useBugs(spaceId: string) {
  const { id } = useCurrentWorkspace();
  return useQuery(bugsQuery(id, spaceId));
}

function useBugMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useReportBug = () =>
  useBugMutation((id, input: { spaceId: string; body: CreateBugRequest }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/bugs`, CreatedItemSchema, {
      method: 'POST',
      body: input.body,
    }),
  );

export const useAssignBug = () =>
  useBugMutation((id, input: { itemId: string; userId: string | null }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/bug-assignee`, NoContent, {
      method: 'PUT',
      body: { userId: input.userId },
    }),
  );

export const useSetBugStatus = () =>
  useBugMutation((id, input: { itemId: string; status: BugStatus }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/bug-status`, NoContent, {
      method: 'PUT',
      body: { status: input.status },
    }),
  );
