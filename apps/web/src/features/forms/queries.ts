import {
  CreatedItemSchema,
  CreatedSchema,
  FormsResponseSchema,
  type CreateFormRequest,
  type SubmitFormRequest,
  type UpdateFormRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string, spaceId: string) =>
  `/workspaces/${workspaceId}/spaces/${spaceId}/forms`;

export const formsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'forms'],
    queryFn: () => apiRequest(base(workspaceId, spaceId), FormsResponseSchema),
  });

export function useForms(spaceId: string) {
  const { id } = useCurrentWorkspace();
  return useQuery(formsQuery(id, spaceId));
}

function useFormMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateForm = () =>
  useFormMutation((id, input: { spaceId: string; body: CreateFormRequest }) =>
    apiRequest(base(id, input.spaceId), CreatedSchema, { method: 'POST', body: input.body }),
  );

export const useUpdateForm = () =>
  useFormMutation((id, input: { spaceId: string; formId: string; body: UpdateFormRequest }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.formId}`, NoContent, {
      method: 'PATCH',
      body: input.body,
    }),
  );

export const useDeleteForm = () =>
  useFormMutation((id, input: { spaceId: string; formId: string }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.formId}`, NoContent, { method: 'DELETE' }),
  );

export const useSubmitForm = () =>
  useFormMutation((id, input: { spaceId: string; formId: string; body: SubmitFormRequest }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.formId}/submissions`, CreatedItemSchema, {
      method: 'POST',
      body: input.body,
    }),
  );
