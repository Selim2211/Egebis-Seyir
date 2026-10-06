import {
  CreatedSchema,
  TeamsResponseSchema,
  type CreateTeamRequest,
  type UpdateTeamRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string) => `/workspaces/${workspaceId}/teams`;

export const teamsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'teams'],
    queryFn: () => apiRequest(base(workspaceId), TeamsResponseSchema),
  });

export function useTeams(enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...teamsQuery(id), enabled });
}

function useTeamMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'teams'] }),
  });
}

export const useCreateTeam = () =>
  useTeamMutation((id, body: CreateTeamRequest) =>
    apiRequest(base(id), CreatedSchema, { method: 'POST', body }),
  );

export const useUpdateTeam = () =>
  useTeamMutation((id, input: { teamId: string; body: UpdateTeamRequest }) =>
    apiRequest(`${base(id)}/${input.teamId}`, NoContent, { method: 'PATCH', body: input.body }),
  );

export const useDeleteTeam = () =>
  useTeamMutation((id, teamId: string) =>
    apiRequest(`${base(id)}/${teamId}`, NoContent, { method: 'DELETE' }),
  );
