import { AuditResponseSchema, type AuditQuery } from '@scrum/shared';
import { infiniteQueryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

export type AuditFilter = Omit<AuditQuery, 'before'>;

/** Denetim günlüğü (Faz 8.3): imleçle sayfalanan, süzgeçli akış. */
export const auditQuery = (workspaceId: string, filter: AuditFilter) =>
  infiniteQueryOptions({
    queryKey: ['workspaces', workspaceId, 'audit', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      for (const [name, value] of Object.entries({ ...filter, before: pageParam })) {
        if (value) params.set(name, value);
      }
      const qs = params.toString();
      return apiRequest(
        `/workspaces/${workspaceId}/audit${qs ? `?${qs}` : ''}`,
        AuditResponseSchema,
      );
    },
    getNextPageParam: (last) => last.next ?? undefined,
  });
