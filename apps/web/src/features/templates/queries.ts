import {
  type ApplyTemplateRequest,
  CreatedSchema,
  type CreateSpaceFromTemplateRequest,
  type CreateSpaceTemplateRequest,
  type CreateTemplateRequest,
  TemplatesResponseSchema,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const templatesQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'templates'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/templates`, TemplatesResponseSchema),
  });

export const spaceTemplatesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'space-templates'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/space-templates`, TemplatesResponseSchema),
  });

export function useTemplates(spaceId: string, enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...templatesQuery(id, spaceId), enabled });
}

export function useSpaceTemplates(enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...spaceTemplatesQuery(id), enabled });
}

/** Şablon değişikliği; bitince workspace sorguları tazelenir (uygulanan içerik dahil). */
function useTemplateMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useSaveTemplate = () =>
  useTemplateMutation((id, input: { spaceId: string; body: CreateTemplateRequest }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/templates`, CreatedSchema, {
      method: 'POST',
      body: input.body,
    }),
  );

export const useApplyTemplate = () =>
  useTemplateMutation(
    (id, input: { spaceId: string; templateId: string; body: ApplyTemplateRequest }) =>
      apiRequest(
        `${ws(id)}/spaces/${input.spaceId}/templates/${input.templateId}/apply`,
        CreatedSchema,
        { method: 'POST', body: input.body },
      ),
  );

export const useDeleteTemplate = () =>
  useTemplateMutation((id, input: { spaceId: string; templateId: string }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/templates/${input.templateId}`, NoContent, {
      method: 'DELETE',
    }),
  );

export const useSaveSpaceTemplate = () =>
  useTemplateMutation((id, body: CreateSpaceTemplateRequest) =>
    apiRequest(`${ws(id)}/space-templates`, CreatedSchema, { method: 'POST', body }),
  );

export const useDeleteSpaceTemplate = () =>
  useTemplateMutation((id, templateId: string) =>
    apiRequest(`${ws(id)}/space-templates/${templateId}`, NoContent, { method: 'DELETE' }),
  );

export const useCreateSpaceFromTemplate = () =>
  useTemplateMutation((id, body: CreateSpaceFromTemplateRequest) =>
    apiRequest(`${ws(id)}/spaces/from-template`, CreatedSchema, { method: 'POST', body }),
  );
