import {
  AutomationRunsResponseSchema,
  AutomationsResponseSchema,
  type CreateAutomationRequest,
  CreatedSchema,
  type UpdateAutomationRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string, spaceId: string) =>
  `/workspaces/${workspaceId}/spaces/${spaceId}/automations`;

export const automationsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'automations'],
    queryFn: () => apiRequest(base(workspaceId, spaceId), AutomationsResponseSchema),
  });

export const automationRunsQuery = (workspaceId: string, spaceId: string, automationId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'automations', automationId, 'runs'],
    queryFn: () =>
      apiRequest(
        `${base(workspaceId, spaceId)}/${automationId}/runs`,
        AutomationRunsResponseSchema,
      ),
  });

export function useAutomations(spaceId: string, enabled: boolean) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...automationsQuery(id, spaceId), enabled });
}

export function useAutomationRuns(spaceId: string, automationId: string, enabled: boolean) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...automationRunsQuery(id, spaceId, automationId), enabled });
}

function useAutomationMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateAutomation = () =>
  useAutomationMutation((id, input: { spaceId: string; body: CreateAutomationRequest }) =>
    apiRequest(base(id, input.spaceId), CreatedSchema, { method: 'POST', body: input.body }),
  );

export const useUpdateAutomation = () =>
  useAutomationMutation(
    (id, input: { spaceId: string; automationId: string; body: UpdateAutomationRequest }) =>
      apiRequest(`${base(id, input.spaceId)}/${input.automationId}`, NoContent, {
        method: 'PATCH',
        body: input.body,
      }),
  );

export const useDeleteAutomation = () =>
  useAutomationMutation((id, input: { spaceId: string; automationId: string }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.automationId}`, NoContent, {
      method: 'DELETE',
    }),
  );
