import {
  CreatedSchema,
  DocDetailSchema,
  DocsResponseSchema,
  DocVersionDetailSchema,
  DocVersionsResponseSchema,
  UpdateDocResponseSchema,
  type CreateDocRequest,
  type MoveDocRequest,
  type UpdateDocRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const docsQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'docs'],
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/docs`, DocsResponseSchema),
  });

export const docsTrashQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'spaces', spaceId, 'docs', 'trash'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/docs/trash`, DocsResponseSchema),
  });

export const docQuery = (workspaceId: string, docId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'docs', docId],
    queryFn: () => apiRequest(`${ws(workspaceId)}/docs/${docId}`, DocDetailSchema),
    // Editör yerel durumu tutar: önbellekten eski sayfa gelmesin, odakta yeniden çekilmesin.
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

export const docVersionsQuery = (workspaceId: string, docId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'docs', docId, 'versions'],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/docs/${docId}/versions`, DocVersionsResponseSchema),
  });

export const docVersionQuery = (workspaceId: string, docId: string, version: number) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'docs', docId, 'versions', version],
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/docs/${docId}/versions/${version}`, DocVersionDetailSchema),
  });

/** Ağaç ve çöp kutusu listeleri; açık sayfanın yerel durumuna dokunmaz. */
function useInvalidateTree(spaceId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'spaces', spaceId, 'docs'] });
}

export function useCreateDoc(spaceId: string) {
  const { id } = useCurrentWorkspace();
  const invalidate = useInvalidateTree(spaceId);
  return useMutation({
    mutationFn: (body: CreateDocRequest) =>
      apiRequest(`${ws(id)}/spaces/${spaceId}/docs`, CreatedSchema, { method: 'POST', body }),
    onSettled: invalidate,
  });
}

export function useMoveDoc(spaceId: string) {
  const { id } = useCurrentWorkspace();
  const invalidate = useInvalidateTree(spaceId);
  return useMutation({
    mutationFn: ({ docId, ...body }: MoveDocRequest & { docId: string }) =>
      apiRequest(`${ws(id)}/docs/${docId}/move`, NoContent, { method: 'POST', body }),
    onSettled: invalidate,
  });
}

export function useDeleteDoc(spaceId: string) {
  const { id } = useCurrentWorkspace();
  const invalidate = useInvalidateTree(spaceId);
  return useMutation({
    mutationFn: (docId: string) =>
      apiRequest(`${ws(id)}/docs/${docId}`, NoContent, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}

export function useRestoreDoc(spaceId: string) {
  const { id } = useCurrentWorkspace();
  const invalidate = useInvalidateTree(spaceId);
  return useMutation({
    mutationFn: (docId: string) =>
      apiRequest(`${ws(id)}/docs/${docId}/restore`, NoContent, { method: 'POST' }),
    onSettled: invalidate,
  });
}

/** Sürüme dönünce açık sayfa yeniden yüklenir (içerik ve revision değişti). */
export function useRestoreVersion(spaceId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  const invalidateTree = useInvalidateTree(spaceId);
  return useMutation({
    mutationFn: ({ docId, version }: { docId: string; version: number }) =>
      apiRequest(`${ws(id)}/docs/${docId}/versions/${version}/restore`, UpdateDocResponseSchema, {
        method: 'POST',
      }),
    onSettled: (_data, _error, { docId }) => {
      void invalidateTree();
      return qc.invalidateQueries({ queryKey: ['workspaces', id, 'docs', docId] });
    },
  });
}

/** Tek kayıt isteği; çağıran taraf (kaydedici) sıralamayı ve revision'ı yönetir. */
export function useSaveDocRequest() {
  const { id } = useCurrentWorkspace();
  return (docId: string, body: UpdateDocRequest) =>
    apiRequest(`${ws(id)}/docs/${docId}`, UpdateDocResponseSchema, { method: 'PATCH', body });
}

/** Sayfa ↔ görev bağlantısı: ekler ya da kaldırır; açık sayfanın bağlantı listesi tazelenir. */
export function useDocItemLink() {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: ({ docId, itemId, on }: { docId: string; itemId: string; on: boolean }) =>
      apiRequest(`${ws(id)}/docs/${docId}/links/${itemId}`, NoContent, {
        method: on ? 'PUT' : 'DELETE',
      }),
    onSettled: (_data, _error, { docId, itemId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['workspaces', id, 'docs', docId] }),
        qc.invalidateQueries({ queryKey: ['workspaces', id, 'items', itemId] }),
      ]),
  });
}
