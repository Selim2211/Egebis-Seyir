import {
  CreatedSchema,
  type SaveTicketCompanyRequest,
  type SaveTicketRuleRequest,
  TicketCompaniesResponseSchema,
  TicketConnectionTestSchema,
  TicketRulesResponseSchema,
  TicketSettingsSchema,
  type UpdateTicketSettingsRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string) => `/workspaces/${workspaceId}/tickets`;
const key = (workspaceId: string, part: string) => ['workspaces', workspaceId, 'tickets', part];

export const ticketSettingsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'settings'),
    queryFn: () => apiRequest(`${base(workspaceId)}/settings`, TicketSettingsSchema),
  });
export const ticketCompaniesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'companies'),
    queryFn: () => apiRequest(`${base(workspaceId)}/companies`, TicketCompaniesResponseSchema),
  });
export const ticketRulesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'rules'),
    queryFn: () => apiRequest(`${base(workspaceId)}/rules`, TicketRulesResponseSchema),
  });

export function useTicketSettings() {
  const { id } = useCurrentWorkspace();
  return useQuery(ticketSettingsQuery(id));
}
export function useTicketCompanies() {
  const { id } = useCurrentWorkspace();
  return useQuery(ticketCompaniesQuery(id));
}
export function useTicketRules() {
  const { id } = useCurrentWorkspace();
  return useQuery(ticketRulesQuery(id));
}

/** Ayar/firma/kural değişiminden sonra çağrı sistemi sorguları ve Bug Kutusu tazelenir. */
function useTicketMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['workspaces', id, 'tickets'] });
      void qc.invalidateQueries({ queryKey: ['workspaces', id, 'bug-box'] });
    },
  });
}

export const useSaveTicketSettings = () =>
  useTicketMutation((id, body: UpdateTicketSettingsRequest) =>
    apiRequest(`${base(id)}/settings`, NoContent, { method: 'PUT', body }),
  );

export const useTestTicketConnection = () =>
  useTicketMutation((id, _: void) =>
    apiRequest(`${base(id)}/settings/test`, TicketConnectionTestSchema, { method: 'POST' }),
  );

export const useSaveCompany = () =>
  useTicketMutation((id, input: { companyId?: string; body: SaveTicketCompanyRequest }) =>
    input.companyId
      ? apiRequest(`${base(id)}/companies/${input.companyId}`, NoContent, {
          method: 'PUT',
          body: input.body,
        })
      : apiRequest(`${base(id)}/companies`, CreatedSchema, { method: 'POST', body: input.body }),
  );
export const useDeleteCompany = () =>
  useTicketMutation((id, companyId: string) =>
    apiRequest(`${base(id)}/companies/${companyId}`, NoContent, { method: 'DELETE' }),
  );

export const useSaveRule = () =>
  useTicketMutation((id, input: { ruleId?: string; body: SaveTicketRuleRequest }) =>
    input.ruleId
      ? apiRequest(`${base(id)}/rules/${input.ruleId}`, NoContent, {
          method: 'PUT',
          body: input.body,
        })
      : apiRequest(`${base(id)}/rules`, CreatedSchema, { method: 'POST', body: input.body }),
  );
export const useDeleteRule = () =>
  useTicketMutation((id, ruleId: string) =>
    apiRequest(`${base(id)}/rules/${ruleId}`, NoContent, { method: 'DELETE' }),
  );
export const useMoveRule = () =>
  useTicketMutation((id, input: { ruleId: string; direction: 'up' | 'down' }) =>
    apiRequest(`${base(id)}/rules/${input.ruleId}/move/${input.direction}`, NoContent, {
      method: 'POST',
    }),
  );
