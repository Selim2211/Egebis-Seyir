import {
  CreatedSchema,
  ItemTimeSchema,
  MyTimerSchema,
  TimesheetSchema,
  type LogTimeRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { z } from 'zod';

const ws = (id: string) => `/workspaces/${id}`;

export const itemTimeQuery = (workspaceId: string, itemId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'items', itemId, 'time'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/items/${itemId}/time`, ItemTimeSchema),
  });

/** Çalışan sayaç (üst çubuk göstergesi); sunucu tarafında kullanıcıya özeldir. */
export const myTimerQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'timer'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/timer`, MyTimerSchema),
    refetchOnWindowFocus: true,
  });

export const timesheetQuery = (workspaceId: string, spaceId: string, from?: string, to?: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'timesheet', { from, to }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const query = params.toString();
      return apiRequest(
        `${ws(workspaceId)}/spaces/${spaceId}/timesheet${query ? `?${query}` : ''}`,
        TimesheetSchema,
      );
    },
  });

/** Zaman değişimleri; süre, sayaç ve çizelge sorguları tazelenir. */
function useTimeMutation<T, R>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useLogTime = () =>
  useTimeMutation((id, input: { itemId: string; body: LogTimeRequest }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/time`, CreatedSchema, {
      method: 'POST',
      body: input.body,
    }),
  );

export const useDeleteTime = () =>
  useTimeMutation((id, input: { itemId: string; entryId: string }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/time/${input.entryId}`, NoContent, {
      method: 'DELETE',
    }),
  );

export const useStartTimer = () =>
  useTimeMutation((id, itemId: string) =>
    apiRequest(`${ws(id)}/items/${itemId}/timer/start`, NoContent, { method: 'POST' }),
  );

export const useStopTimer = () =>
  useTimeMutation((id, _input: void) =>
    apiRequest(`${ws(id)}/timer/stop`, z.object({ minutes: z.int() }), { method: 'POST' }),
  );
