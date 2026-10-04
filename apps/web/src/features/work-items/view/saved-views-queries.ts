import { SavedViewsResponseSchema } from '@scrum/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const savedViewsQuery = (workspaceId: string, listId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'lists', listId, 'views'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/lists/${listId}/views`, SavedViewsResponseSchema),
  });
