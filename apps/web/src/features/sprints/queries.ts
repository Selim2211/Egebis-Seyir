import {
  BacklogResponseSchema,
  CreatedSchema,
  EpicsResponseSchema,
  RetroResponseSchema,
  RetroTaskCreatedSchema,
  SprintBurndownSchema,
  SprintDetailSchema,
  SprintReviewSchema,
  SprintsResponseSchema,
  VelocityResponseSchema,
  type BacklogResponse,
  type CompleteSprintRequest,
  type CreateRetroItemRequest,
  type CreateSprintRequest,
  type MoveBacklogItemsRequest,
  type UpdateSprintRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const backlogQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'backlog'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/backlog`, BacklogResponseSchema),
  });

export const sprintsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'sprints'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/sprints`, SprintsResponseSchema),
  });

export const sprintQuery = (workspaceId: string, sprintId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'sprints', sprintId],
    queryFn: () => apiRequest(`${ws(workspaceId)}/sprints/${sprintId}`, SprintDetailSchema),
  });

export const epicsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'epics'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/epics`, EpicsResponseSchema),
  });

export const burndownQuery = (workspaceId: string, sprintId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'sprints', sprintId, 'burndown'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/sprints/${sprintId}/burndown`, SprintBurndownSchema),
  });

export const velocityQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'velocity'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/velocity`, VelocityResponseSchema),
  });

export const sprintReviewQuery = (workspaceId: string, sprintId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'sprints', sprintId, 'review'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/sprints/${sprintId}/review`, SprintReviewSchema),
  });

/** Workspace kapsamlı değişiklik; bitince workspace'e ait tüm sorgular tazelenir. */
function useWorkspaceMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateSprint = (spaceId: string) =>
  useWorkspaceMutation((id, body: CreateSprintRequest) =>
    apiRequest(`${ws(id)}/spaces/${spaceId}/sprints`, CreatedSchema, { method: 'POST', body }),
  );

export const useUpdateSprint = () =>
  useWorkspaceMutation((id, input: { sprintId: string; body: UpdateSprintRequest }) =>
    apiRequest(`${ws(id)}/sprints/${input.sprintId}`, NoContent, {
      method: 'PATCH',
      body: input.body,
    }),
  );

export const useDeleteSprint = () =>
  useWorkspaceMutation((id, sprintId: string) =>
    apiRequest(`${ws(id)}/sprints/${sprintId}`, NoContent, { method: 'DELETE' }),
  );

/**
 * Backlog'a/sprint'e taşıma ve yeniden sıralama. Yalnızca Backlog içi sıralama anında
 * önbelleğe yansır (sürükleme sonrası sıçrama olmasın); hata olursa geri alınır.
 */
export function useMoveBacklogItems(spaceId: string) {
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const key = backlogQuery(workspaceId, spaceId).queryKey;
  return useMutation({
    mutationFn: (body: MoveBacklogItemsRequest) =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/backlog/move`, NoContent, {
        method: 'POST',
        body,
      }),
    onMutate: async (body) => {
      if (body.sprintId !== null || body.afterId === undefined) return {};
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BacklogResponse>(key);
      qc.setQueryData<BacklogResponse>(key, (data) => {
        if (!data) return data;
        const moving = body.itemIds
          .map((id) => data.items.find((i) => i.id === id))
          .filter((i) => i !== undefined);
        const rest = data.items.filter((i) => !body.itemIds.includes(i.id));
        const at = body.afterId === null ? 0 : rest.findIndex((i) => i.id === body.afterId) + 1;
        return { ...data, items: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId] }),
  });
}

// ---------- Yaşam döngüsü (Faz 2.3) ----------

export const useStartSprint = () =>
  useWorkspaceMutation((id, sprintId: string) =>
    apiRequest(`${ws(id)}/sprints/${sprintId}/start`, NoContent, { method: 'POST' }),
  );

export const useCompleteSprint = () =>
  useWorkspaceMutation((id, input: { sprintId: string; body: CompleteSprintRequest }) =>
    apiRequest(`${ws(id)}/sprints/${input.sprintId}/complete`, NoContent, {
      method: 'POST',
      body: input.body,
    }),
  );

export const useCancelSprint = () =>
  useWorkspaceMutation((id, sprintId: string) =>
    apiRequest(`${ws(id)}/sprints/${sprintId}/cancel`, NoContent, { method: 'POST' }),
  );

export const useSetReviewNotes = () =>
  useWorkspaceMutation((id, input: { sprintId: string; notes: string | null }) =>
    apiRequest(`${ws(id)}/sprints/${input.sprintId}/review-notes`, NoContent, {
      method: 'PUT',
      body: { notes: input.notes },
    }),
  );

// ---------- Retrospektif (Faz 3.4) ----------

export const retroQuery = (workspaceId: string, sprintId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'sprints', sprintId, 'retro'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/sprints/${sprintId}/retro`, RetroResponseSchema),
  });

/** Retro değişimleri (madde ekle/sil, oy, göreve çevir); sayfa listesi tazelenir. */
export function useRetro(sprintId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  const base = `${ws(id)}/sprints/${sprintId}/retro`;
  const settle = {
    onSettled: () => qc.invalidateQueries({ queryKey: retroQuery(id, sprintId).queryKey }),
  };
  return {
    add: useMutation({
      mutationFn: (body: CreateRetroItemRequest) =>
        apiRequest(`${base}/items`, CreatedSchema, { method: 'POST', body }),
      ...settle,
    }),
    remove: useMutation({
      mutationFn: (retroItemId: string) =>
        apiRequest(`${base}/items/${retroItemId}`, NoContent, { method: 'DELETE' }),
      ...settle,
    }),
    vote: useMutation({
      mutationFn: (retroItemId: string) =>
        apiRequest(`${base}/items/${retroItemId}/vote`, NoContent, { method: 'PUT' }),
      ...settle,
    }),
    toTask: useMutation({
      mutationFn: (retroItemId: string) =>
        apiRequest(`${base}/items/${retroItemId}/task`, RetroTaskCreatedSchema, {
          method: 'POST',
        }),
      onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
    }),
  };
}

/** Öğeyi başka öğenin alt öğesi yapar (sürükle-bırak ya da "Üst öğe seç", ADR-102). */
export const useNestItem = () =>
  useWorkspaceMutation((id, input: { itemId: string; parentId: string }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/nest`, NoContent, {
      method: 'POST',
      body: { parentId: input.parentId },
    }),
  );
