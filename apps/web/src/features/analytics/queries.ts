import {
  AnalyticsCapacitySchema,
  AnalyticsCompareSchema,
  AnalyticsFlowSchema,
  AnalyticsPeopleSchema,
  AnalyticsPersonSchema,
  AnalyticsProjectSchema,
  AnalyticsSprintsSchema,
  SprintBurndownSchema,
  type AnalyticsGrain,
} from '@scrum/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

/** Ortak süzgeçler: tarih aralığı, zaman dilimi ve (isteğe bağlı) tek Proje. */
export interface AnalyticsFilters {
  from: string;
  to: string;
  grain: AnalyticsGrain;
  spaceId?: string | undefined;
}

const params = (f: AnalyticsFilters, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams({ from: f.from, to: f.to, grain: f.grain, ...extra });
  if (f.spaceId) p.set('spaceId', f.spaceId);
  return p.toString();
};
const key = (ws: string, ...rest: unknown[]) => ['workspaces', ws, 'analytics', ...rest];

export const peopleQuery = (ws: string, f: AnalyticsFilters) =>
  queryOptions({
    queryKey: key(ws, 'people', f),
    queryFn: () =>
      apiRequest(`/workspaces/${ws}/analytics/people?${params(f)}`, AnalyticsPeopleSchema),
    placeholderData: keepPreviousData,
  });

export const personQuery = (ws: string, userId: string, f: AnalyticsFilters) =>
  queryOptions({
    queryKey: key(ws, 'person', userId, f),
    queryFn: () =>
      apiRequest(
        `/workspaces/${ws}/analytics/person/${userId}?${params(f)}`,
        AnalyticsPersonSchema,
      ),
    placeholderData: keepPreviousData,
  });

export const projectQuery = (ws: string, spaceId: string, f: AnalyticsFilters) =>
  queryOptions({
    queryKey: key(ws, 'project', spaceId, { ...f, spaceId: undefined }),
    queryFn: () =>
      apiRequest(
        `/workspaces/${ws}/analytics/project/${spaceId}?${params({ ...f, spaceId: undefined })}`,
        AnalyticsProjectSchema,
      ),
    placeholderData: keepPreviousData,
  });

export const compareQuery = (ws: string, userIds: string[], f: AnalyticsFilters) =>
  queryOptions({
    queryKey: key(ws, 'compare', userIds, f),
    queryFn: () =>
      apiRequest(
        `/workspaces/${ws}/analytics/compare?${params(f, { userIds: userIds.join(',') })}`,
        AnalyticsCompareSchema,
      ),
    enabled: userIds.length > 0,
    placeholderData: keepPreviousData,
  });

export const flowQuery = (ws: string, f: AnalyticsFilters) =>
  queryOptions({
    queryKey: key(ws, 'flow', f),
    queryFn: () => apiRequest(`/workspaces/${ws}/analytics/flow?${params(f)}`, AnalyticsFlowSchema),
    placeholderData: keepPreviousData,
  });

export const sprintsQuery = (ws: string, f: AnalyticsFilters) =>
  queryOptions({
    queryKey: key(ws, 'sprints', f),
    queryFn: () =>
      apiRequest(`/workspaces/${ws}/analytics/sprints?${params(f)}`, AnalyticsSprintsSchema),
    placeholderData: keepPreviousData,
  });

/** Mevcut sprint raporu: günlük kalan puan, ideal çizgi, burn-up ve kapsam değişimi. */
export const sprintBurndownQuery = (ws: string, sprintId: string) =>
  queryOptions({
    queryKey: key(ws, 'burndown', sprintId),
    queryFn: () =>
      apiRequest(`/workspaces/${ws}/sprints/${sprintId}/burndown`, SprintBurndownSchema),
    enabled: sprintId !== '',
  });

export const capacityQuery = (ws: string, f: AnalyticsFilters, weeklyHours: number) =>
  queryOptions({
    queryKey: key(ws, 'capacity', f, weeklyHours),
    queryFn: () =>
      apiRequest(
        `/workspaces/${ws}/analytics/capacity?${params(f, { weeklyHours: String(weeklyHours) })}`,
        AnalyticsCapacitySchema,
      ),
    placeholderData: keepPreviousData,
  });
