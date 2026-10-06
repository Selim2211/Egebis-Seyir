import {
  ConversationsResponseSchema,
  CreatedSchema,
  MessagesResponseSchema,
  type SendMessageRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const base = (workspaceId: string) => `/workspaces/${workspaceId}/conversations`;

/** Gerçek zamanlı kanal yok (ADR-098): liste ve açık konuşma kısa aralıkla yoklanır. */
export const CONVERSATIONS_POLL_MS = 15_000;
export const THREAD_POLL_MS = 4_000;

export const conversationsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'conversations'],
    queryFn: () => apiRequest(base(workspaceId), ConversationsResponseSchema),
    refetchInterval: CONVERSATIONS_POLL_MS,
  });

export const threadQuery = (workspaceId: string, conversationId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'conversations', conversationId, 'messages'],
    queryFn: () =>
      apiRequest(`${base(workspaceId)}/${conversationId}/messages`, MessagesResponseSchema),
    refetchInterval: THREAD_POLL_MS,
  });

export function useConversations(enabled = true) {
  const { id } = useCurrentWorkspace();
  return useQuery({ ...conversationsQuery(id), enabled });
}

function useMessageMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'conversations'] }),
  });
}

export const useOpenConversation = () =>
  useMessageMutation((id, userId: string) =>
    apiRequest(base(id), CreatedSchema, { method: 'POST', body: { userId } }),
  );

export const useSendMessage = () =>
  useMessageMutation((id, input: { conversationId: string; body: SendMessageRequest['body'] }) =>
    apiRequest(`${base(id)}/${input.conversationId}/messages`, CreatedSchema, {
      method: 'POST',
      body: { body: input.body },
    }),
  );

export const useMarkRead = () =>
  useMessageMutation((id, conversationId: string) =>
    apiRequest(`${base(id)}/${conversationId}/read`, NoContent, { method: 'POST' }),
  );

export const useDeleteMessage = () =>
  useMessageMutation((id, input: { conversationId: string; messageId: string }) =>
    apiRequest(`${base(id)}/${input.conversationId}/messages/${input.messageId}`, NoContent, {
      method: 'DELETE',
    }),
  );
