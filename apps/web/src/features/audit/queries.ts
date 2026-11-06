import { AuditResponseSchema, type AuditQuery, type AuditResponse } from '@scrum/shared';
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

const EXPORT_MAX_PAGES = 400;

/** Dışa aktarma için süzgece uyan tüm kayıtları sayfa sayfa çeker. */
export async function fetchAllAudit(workspaceId: string, filter: AuditFilter) {
  const events: AuditResponse['events'] = [];
  let before: string | undefined;
  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries({ ...filter, before })) {
      if (value) params.set(name, value);
    }
    const qs = params.toString();
    const res = await apiRequest(
      `/workspaces/${workspaceId}/audit${qs ? `?${qs}` : ''}`,
      AuditResponseSchema,
    );
    events.push(...res.events);
    if (!res.next) break;
    before = res.next;
  }
  return events;
}
