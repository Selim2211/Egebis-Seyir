import {
  CreatedSchema,
  type CreateCustomFieldRequest,
  CustomFieldsResponseSchema,
  type UpdateCustomFieldRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string, spaceId: string) =>
  `/workspaces/${workspaceId}/spaces/${spaceId}/custom-fields`;

export const customFieldsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'custom-fields'],
    queryFn: () => apiRequest(base(workspaceId, spaceId), CustomFieldsResponseSchema),
    staleTime: 60_000,
  });

/** Space'in özel alan tanımları (yüklenene kadar boş). */
export function useCustomFields(spaceId: string) {
  const { id } = useCurrentWorkspace();
  const { data } = useQuery(customFieldsQuery(id, spaceId));
  return data?.fields ?? [];
}

/** Alan tanımı değişikliği; bitince workspace sorguları tazelenir (öğelerdeki değerler dahil). */
function useFieldMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateCustomField = () =>
  useFieldMutation((id, input: { spaceId: string; body: CreateCustomFieldRequest }) =>
    apiRequest(base(id, input.spaceId), CreatedSchema, { method: 'POST', body: input.body }),
  );

export const useUpdateCustomField = () =>
  useFieldMutation(
    (id, input: { spaceId: string; fieldId: string; body: UpdateCustomFieldRequest }) =>
      apiRequest(`${base(id, input.spaceId)}/${input.fieldId}`, NoContent, {
        method: 'PATCH',
        body: input.body,
      }),
  );

export const useMoveCustomField = () =>
  useFieldMutation((id, input: { spaceId: string; fieldId: string; afterId: string | null }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.fieldId}/move`, NoContent, {
      method: 'POST',
      body: { afterId: input.afterId },
    }),
  );

export const useDeleteCustomField = () =>
  useFieldMutation((id, input: { spaceId: string; fieldId: string }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.fieldId}`, NoContent, { method: 'DELETE' }),
  );
