import {
  CreatedItemSchema,
  CreatedSchema,
  ItemSearchResponseSchema,
  LabelsResponseSchema,
  SplitItemResponseSchema,
  MyWorkResponseSchema,
  SearchResponseSchema,
  type BulkUpdateRequest,
  type CopyItemRequest,
  type MyWorkScope,
  type CreateLabelRequest,
  type CreateLinkRequest,
  type CreateWorkItemRequest,
  type MoveItemRequest,
  type UpdateWorkItemRequest,
  WorkItemDetailSchema,
  WorkItemsResponseSchema,
  type WorkItemsResponse,
} from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const itemsQuery = (workspaceId: string, listId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'lists', listId, 'items'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/lists/${listId}/items`, WorkItemsResponseSchema),
  });

export const itemQuery = (workspaceId: string, itemId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'items', itemId],
    queryFn: () => apiRequest(`${ws(workspaceId)}/items/${itemId}`, WorkItemDetailSchema),
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

export const useCreateItem = () =>
  useWorkspaceMutation((id, input: { listId: string; body: CreateWorkItemRequest }) =>
    apiRequest(`${ws(id)}/lists/${input.listId}/items`, CreatedItemSchema, {
      method: 'POST',
      body: input.body,
    }),
  );

/**
 * Alan güncelleme. Durum ve öncelik değişiklikleri liste önbelleğine anında yansır;
 * hata olursa geri alınır (optimistic update).
 */
export function useUpdateItem(listId: string) {
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const key = itemsQuery(workspaceId, listId).queryKey;
  return useMutation({
    mutationFn: (input: { itemId: string; body: UpdateWorkItemRequest }) =>
      apiRequest(`${ws(workspaceId)}/items/${input.itemId}`, NoContent, {
        method: 'PATCH',
        body: input.body,
      }),
    onMutate: async ({ itemId, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<WorkItemsResponse>(key);
      qc.setQueryData<WorkItemsResponse>(key, (data) =>
        data
          ? {
              ...data,
              items: data.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      ...(body.statusId && { statusId: body.statusId }),
                      ...(body.priority && { priority: body.priority }),
                      ...(body.startDate !== undefined && { startDate: body.startDate }),
                      ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
                      ...(body.points !== undefined && { points: body.points }),
                      ...(body.estimateHours !== undefined && {
                        estimateHours: body.estimateHours,
                      }),
                    }
                  : item,
              ),
            }
          : data,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId] }),
  });
}

export const useCopyItem = () =>
  useWorkspaceMutation((id, input: { itemId: string; body: CopyItemRequest }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/copy`, CreatedItemSchema, {
      method: 'POST',
      body: input.body,
    }),
  );

export const useMoveItem = () =>
  useWorkspaceMutation((id, input: { itemId: string; body: MoveItemRequest }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/move`, NoContent, {
      method: 'POST',
      body: input.body,
    }),
  );

export type ItemAction = 'archive' | 'unarchive' | 'delete' | 'restore';

export const useItemLifecycle = () =>
  useWorkspaceMutation((id, input: { itemId: string; action: ItemAction }) =>
    apiRequest(
      `${ws(id)}/items/${input.itemId}${input.action === 'delete' ? '' : `/${input.action}`}`,
      NoContent,
      { method: input.action === 'delete' ? 'DELETE' : 'POST' },
    ),
  );

// ---------- Görev detayı (Faz 1.4) ----------

export const itemByKeyQuery = (workspaceId: string, key: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'items', 'key', key.toUpperCase()],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/items/key/${encodeURIComponent(key)}`, WorkItemDetailSchema),
    retry: false,
  });

export const labelsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'labels'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/labels`, LabelsResponseSchema),
  });

export const itemSearchQuery = (workspaceId: string, q: string, excludeId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'items', 'search', q, excludeId],
    queryFn: () =>
      apiRequest(
        `${ws(workspaceId)}/items/search?q=${encodeURIComponent(q)}&exclude=${excludeId}`,
        ItemSearchResponseSchema,
      ),
    enabled: q.trim().length > 0,
  });

/** Detay sayfasındaki alan düzenlemeleri (başlık, tarih, açıklama, etiket…). */
export const useUpdateItemFields = () =>
  useWorkspaceMutation((id, input: { itemId: string; body: UpdateWorkItemRequest }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}`, NoContent, {
      method: 'PATCH',
      body: input.body,
    }),
  );

export const useCreateLabel = () =>
  useWorkspaceMutation((id, input: { spaceId: string; body: CreateLabelRequest }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/labels`, CreatedSchema, {
      method: 'POST',
      body: input.body,
    }),
  );

export const useWatchItem = () =>
  useWorkspaceMutation((id, input: { itemId: string; watching: boolean }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/watch`, NoContent, {
      method: input.watching ? 'PUT' : 'DELETE',
    }),
  );

export const useSplitItem = () =>
  useWorkspaceMutation((id, input: { itemId: string; titles: string[] }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/split`, SplitItemResponseSchema, {
      method: 'POST',
      body: { titles: input.titles },
    }),
  );

export const useAddLink = () =>
  useWorkspaceMutation(
    (id, input: { itemId: string; targetId: string; relation: CreateLinkRequest['relation'] }) =>
      apiRequest(`${ws(id)}/items/${input.itemId}/links`, CreatedSchema, {
        method: 'POST',
        body: { targetId: input.targetId, relation: input.relation },
      }),
  );

export const useRemoveLink = () =>
  useWorkspaceMutation((id, input: { itemId: string; linkId: string }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/links/${input.linkId}`, NoContent, {
      method: 'DELETE',
    }),
  );

/** Checklist ve kabul kriteri işlemleri; `checklistId = 'acceptance'` kabul kriterlerine yazar. */
export type ChecklistOp =
  | { op: 'createList'; title: string }
  | { op: 'renameList'; checklistId: string; title: string }
  | { op: 'deleteList'; checklistId: string }
  | { op: 'addEntry'; checklistId: string; text: string }
  | {
      op: 'updateEntry';
      checklistId: string;
      entryId: string;
      body: { text?: string; done?: boolean };
    }
  | { op: 'deleteEntry'; checklistId: string; entryId: string };

export const useChecklist = () =>
  useWorkspaceMutation((id, input: { itemId: string } & ChecklistOp) => {
    const base = `${ws(id)}/items/${input.itemId}/checklists`;
    switch (input.op) {
      case 'createList':
        return apiRequest(base, CreatedSchema, { method: 'POST', body: { title: input.title } });
      case 'renameList':
        return apiRequest(`${base}/${input.checklistId}`, NoContent, {
          method: 'PATCH',
          body: { title: input.title },
        });
      case 'deleteList':
        return apiRequest(`${base}/${input.checklistId}`, NoContent, { method: 'DELETE' });
      case 'addEntry':
        return apiRequest(`${base}/${input.checklistId}/entries`, CreatedSchema, {
          method: 'POST',
          body: { text: input.text },
        });
      case 'updateEntry':
        return apiRequest(`${base}/${input.checklistId}/entries/${input.entryId}`, NoContent, {
          method: 'PATCH',
          body: input.body,
        });
      case 'deleteEntry':
        return apiRequest(`${base}/${input.checklistId}/entries/${input.entryId}`, NoContent, {
          method: 'DELETE',
        });
    }
  });

// ---------- Görünümler, arama, benim işlerim (Faz 1.5) ----------

export const myWorkQuery = (workspaceId: string, scope: MyWorkScope, includeDone: boolean) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'my-work', scope, includeDone],
    queryFn: () =>
      apiRequest(
        `${ws(workspaceId)}/my-work?scope=${scope}&includeDone=${includeDone}`,
        MyWorkResponseSchema,
      ),
  });

export const globalSearchQuery = (workspaceId: string, q: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'search', q],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/search?q=${encodeURIComponent(q)}`, SearchResponseSchema),
    enabled: q.trim().length > 0,
    staleTime: 15_000,
  });

/** Toplu düzenleme (durum, öncelik, atanan, etiket); en çok 200 öğe. */
export const useBulkUpdate = () =>
  useWorkspaceMutation((id, input: { spaceId: string; body: BulkUpdateRequest }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/items/bulk`, NoContent, {
      method: 'POST',
      body: input.body,
    }),
  );
