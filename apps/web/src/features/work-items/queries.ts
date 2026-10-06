import {
  ActivityResponseSchema,
  CommentsResponseSchema,
  MentionCandidatesSchema,
  type ReactionEmoji,
  type RichTextDoc,
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
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
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

// ---------- Yorumlar, ekler, aktivite (Faz 1.6) ----------

/** Yorum hedefi: görev (`items`) ya da doküman sayfası (`docs`, ADR-070). */
export type CommentScope = 'items' | 'docs';

export const commentsQuery = (workspaceId: string, itemId: string, scope: CommentScope = 'items') =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, scope, itemId, 'comments'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/${scope}/${itemId}/comments`, CommentsResponseSchema),
  });

/** @mention önerisi (yazarken çağrılır; önbelleğe alınmaz). */
export const fetchMentionCandidates = (
  workspaceId: string,
  itemId: string,
  q: string,
  scope: CommentScope = 'items',
) =>
  apiRequest(
    `${ws(workspaceId)}/${scope}/${itemId}/mention-candidates?q=${encodeURIComponent(q)}`,
    MentionCandidatesSchema,
  );

export type CommentOp =
  | { op: 'create'; body: RichTextDoc }
  | { op: 'edit'; commentId: string; body: RichTextDoc }
  | { op: 'delete'; commentId: string }
  | { op: 'react'; commentId: string; emoji: ReactionEmoji };

export const useComment = () =>
  useWorkspaceMutation((id, input: { itemId: string; scope?: CommentScope } & CommentOp) => {
    const base = `${ws(id)}/${input.scope ?? 'items'}/${input.itemId}/comments`;
    switch (input.op) {
      case 'create':
        return apiRequest(base, CreatedSchema, { method: 'POST', body: { body: input.body } });
      case 'edit':
        return apiRequest(`${base}/${input.commentId}`, NoContent, {
          method: 'PATCH',
          body: { body: input.body },
        });
      case 'delete':
        return apiRequest(`${base}/${input.commentId}`, NoContent, { method: 'DELETE' });
      case 'react':
        return apiRequest(`${base}/${input.commentId}/reactions`, NoContent, {
          method: 'PUT',
          body: { emoji: input.emoji },
        });
    }
  });

/** Ekin sahibi: `items` (görev, varsayılan) ya da `docs` (doküman sayfası). */
export type AttachmentScope = 'items' | 'docs';

export const useUploadAttachment = () =>
  useWorkspaceMutation((id, input: { itemId: string; file: File; scope?: AttachmentScope }) => {
    const form = new FormData();
    form.append('file', input.file);
    return apiRequest(
      `${ws(id)}/${input.scope ?? 'items'}/${input.itemId}/attachments`,
      CreatedSchema,
      {
        method: 'POST',
        body: form,
      },
    );
  });

export const useDeleteAttachment = () =>
  useWorkspaceMutation(
    (id, input: { itemId: string; attachmentId: string; scope?: AttachmentScope }) =>
      apiRequest(
        `${ws(id)}/${input.scope ?? 'items'}/${input.itemId}/attachments/${input.attachmentId}`,
        NoContent,
        { method: 'DELETE' },
      ),
  );

/** Ek adresi: `preview` satır içi önizleme (yalnızca resim/PDF), aksi halde indirme. */
export const attachmentUrl = (
  workspaceId: string,
  itemId: string,
  attachmentId: string,
  preview = false,
  scope: AttachmentScope = 'items',
) =>
  `/api${ws(workspaceId)}/${scope}/${itemId}/attachments/${attachmentId}${preview ? '?preview=1' : ''}`;

export const itemActivityQuery = (workspaceId: string, itemId: string) =>
  infiniteQueryOptions({
    queryKey: ['workspaces', workspaceId, 'items', itemId, 'activity'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiRequest(
        `${ws(workspaceId)}/items/${itemId}/activity${pageParam ? `?before=${pageParam}` : ''}`,
        ActivityResponseSchema,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });

export const recentActivityQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'activity'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/activity?limit=15`, ActivityResponseSchema),
  });

/** DoD/DoR işaretleri (ADR-065): işaretli madde metinlerinin tamamı gönderilir. */
export const useSetReadiness = () =>
  useWorkspaceMutation((id, input: { itemId: string; kind: 'dor' | 'dod'; checked: string[] }) =>
    apiRequest(`${ws(id)}/items/${input.itemId}/${input.kind}`, NoContent, {
      method: 'PUT',
      body: { checked: input.checked },
    }),
  );
