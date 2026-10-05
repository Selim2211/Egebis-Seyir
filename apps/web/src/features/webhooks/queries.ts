import {
  CreatedWebhookSchema,
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
  WebhookDeliveriesResponseSchema,
  WebhooksResponseSchema,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string, spaceId: string) =>
  `/workspaces/${workspaceId}/spaces/${spaceId}/webhooks`;

export const webhooksQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'webhooks'],
    queryFn: () => apiRequest(base(workspaceId, spaceId), WebhooksResponseSchema),
  });

export function useWebhooks(spaceId: string) {
  const { id } = useCurrentWorkspace();
  return useQuery(webhooksQuery(id, spaceId));
}

export function useDeliveries(spaceId: string, webhookId: string) {
  const { id } = useCurrentWorkspace();
  return useQuery({
    queryKey: ['workspaces', id, 'spaces', spaceId, 'webhooks', webhookId, 'deliveries'],
    queryFn: () =>
      apiRequest(`${base(id, spaceId)}/${webhookId}/deliveries`, WebhookDeliveriesResponseSchema),
  });
}

function useWebhookMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateWebhook = () =>
  useWebhookMutation((id, input: { spaceId: string; body: CreateWebhookRequest }) =>
    apiRequest(base(id, input.spaceId), CreatedWebhookSchema, { method: 'POST', body: input.body }),
  );

export const useUpdateWebhook = () =>
  useWebhookMutation(
    (id, input: { spaceId: string; webhookId: string; body: UpdateWebhookRequest }) =>
      apiRequest(`${base(id, input.spaceId)}/${input.webhookId}`, NoContent, {
        method: 'PATCH',
        body: input.body,
      }),
  );

export const useDeleteWebhook = () =>
  useWebhookMutation((id, input: { spaceId: string; webhookId: string }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.webhookId}`, NoContent, { method: 'DELETE' }),
  );

export const useTestWebhook = () =>
  useWebhookMutation((id, input: { spaceId: string; webhookId: string }) =>
    apiRequest(`${base(id, input.spaceId)}/${input.webhookId}/test`, NoContent, {
      method: 'POST',
      body: {},
    }),
  );
