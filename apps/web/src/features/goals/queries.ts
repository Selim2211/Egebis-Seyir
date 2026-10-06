import {
  CreatedSchema,
  GoalsResponseSchema,
  type CreateGoalRequest,
  type UpdateGoalRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string) => `/workspaces/${workspaceId}/goals`;

export const goalsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'goals'],
    queryFn: () => apiRequest(base(workspaceId), GoalsResponseSchema),
  });

export function useGoals() {
  const { id } = useCurrentWorkspace();
  return useQuery(goalsQuery(id));
}

function useGoalMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateGoal = () =>
  useGoalMutation((id, body: CreateGoalRequest) =>
    apiRequest(base(id), CreatedSchema, { method: 'POST', body }),
  );

export const useUpdateGoal = () =>
  useGoalMutation((id, input: { goalId: string; body: UpdateGoalRequest }) =>
    apiRequest(`${base(id)}/${input.goalId}`, NoContent, { method: 'PATCH', body: input.body }),
  );

export const useDeleteGoal = () =>
  useGoalMutation((id, goalId: string) =>
    apiRequest(`${base(id)}/${goalId}`, NoContent, { method: 'DELETE' }),
  );

export const useLinkGoalItem = () =>
  useGoalMutation((id, input: { goalId: string; itemId: string; link: boolean }) =>
    apiRequest(`${base(id)}/${input.goalId}/items/${input.itemId}`, NoContent, {
      method: input.link ? 'PUT' : 'DELETE',
    }),
  );
