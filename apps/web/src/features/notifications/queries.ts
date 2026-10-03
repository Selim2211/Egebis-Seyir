import {
  NotificationPreferencesSchema,
  NotificationsResponseSchema,
  UnreadCountSchema,
  type NotificationPreferences,
} from '@scrum/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}/notifications`;
const root = (id: string) => ['workspaces', id, 'notifications'] as const;

/** Okunmamış sayı rozeti: hafif uç, 30 sn'de bir ve pencere odaklanınca yenilenir (gerçek zamanlı: sonra). */
export const unreadCountQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...root(workspaceId), 'unread-count'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/unread-count`, UnreadCountSchema),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export function useUnreadCount(): number {
  const { id } = useCurrentWorkspace();
  return useQuery(unreadCountQuery(id)).data?.unreadCount ?? 0;
}

/** Bildirim kutusu; eski kayıtlar `before` imleciyle sayfa sayfa yüklenir. */
export const notificationsQuery = (workspaceId: string, unreadOnly: boolean) =>
  infiniteQueryOptions({
    queryKey: [...root(workspaceId), 'list', { unreadOnly }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (unreadOnly) params.set('unread', 'true');
      if (pageParam) params.set('before', pageParam);
      const query = params.toString();
      return apiRequest(
        `${ws(workspaceId)}${query ? `?${query}` : ''}`,
        NotificationsResponseSchema,
      );
    },
    getNextPageParam: (last) => (last.hasMore ? last.items.at(-1)?.at : undefined),
    refetchInterval: 30_000,
  });

export const notificationPreferencesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: [...root(workspaceId), 'preferences'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/preferences`, NotificationPreferencesSchema),
  });

function useNotificationMutation<T>(fn: (workspaceId: string, input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: root(id) }),
  });
}

export const useMarkRead = () =>
  useNotificationMutation((id, notificationId: string) =>
    apiRequest(`${ws(id)}/${notificationId}/read`, NoContent, { method: 'POST' }),
  );

export const useMarkAllRead = () =>
  useNotificationMutation((id, _input: void) =>
    apiRequest(`${ws(id)}/read-all`, NoContent, { method: 'POST' }),
  );

export const useSetNotificationPreferences = () =>
  useNotificationMutation((id, body: NotificationPreferences) =>
    apiRequest(`${ws(id)}/preferences`, NoContent, { method: 'PUT', body }),
  );
