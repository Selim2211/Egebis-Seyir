import {
  ArchiveResponseSchema,
  CreatedSchema,
  type CreateListRequest,
  type CreateSpaceRequest,
  type FavoriteType,
  FolderDetailSchema,
  HierarchyResponseSchema,
  ListDetailSchema,
  type SpaceRole,
  SpaceDetailSchema,
  SpaceMembersResponseSchema,
  type TreeSpace,
  type UpdateSpaceRequest,
  type UpdateWorkspaceSettingsRequest,
  WorkspaceSettingsSchema,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meQuery } from '@/features/auth/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;
const key = (workspaceId: string, ...rest: unknown[]) => ['workspaces', workspaceId, ...rest];

// ---------- Sorgular ----------

export const hierarchyQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'hierarchy'),
    queryFn: () => apiRequest(`${ws(workspaceId)}/hierarchy`, HierarchyResponseSchema),
  });

export const spaceQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'spaces', spaceId),
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}`, SpaceDetailSchema),
  });

export const spaceMembersQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'spaces', spaceId, 'members'),
    queryFn: () =>
      apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/members`, SpaceMembersResponseSchema),
  });

export const folderQuery = (workspaceId: string, folderId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'folders', folderId),
    queryFn: () => apiRequest(`${ws(workspaceId)}/folders/${folderId}`, FolderDetailSchema),
  });

export const listQuery = (workspaceId: string, listId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'lists', listId),
    queryFn: () => apiRequest(`${ws(workspaceId)}/lists/${listId}`, ListDetailSchema),
  });

export const archiveQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'archive'),
    queryFn: () => apiRequest(`${ws(workspaceId)}/archive`, ArchiveResponseSchema),
  });

export const workspaceSettingsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: key(workspaceId, 'settings'),
    queryFn: () => apiRequest(`${ws(workspaceId)}/settings`, WorkspaceSettingsSchema),
  });

export function useHierarchy() {
  const { id } = useCurrentWorkspace();
  return useQuery(hierarchyQuery(id));
}

/** Ağaçtaki Space (izinleriyle); yoksa undefined. */
export function useTreeSpace(spaceId: string | undefined): TreeSpace | undefined {
  const { data } = useHierarchy();
  return data?.spaces.find((s) => s.id === spaceId);
}

export function useSpaceMembers(spaceId: string) {
  const { id } = useCurrentWorkspace();
  return useQuery(spaceMembersQuery(id, spaceId));
}

// ---------- Değişiklikler ----------

/** Workspace kapsamlı değişiklik; bitince workspace'e ait tüm sorgular tazelenir. */
function useWorkspaceMutation<T, R = unknown>(fn: (workspaceId: string, input: T) => Promise<R>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

export const useCreateSpace = () =>
  useWorkspaceMutation((id, body: CreateSpaceRequest) =>
    apiRequest(`${ws(id)}/spaces`, CreatedSchema, { method: 'POST', body }),
  );

export const useUpdateSpace = () =>
  useWorkspaceMutation((id, input: { spaceId: string; body: UpdateSpaceRequest }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}`, NoContent, {
      method: 'PATCH',
      body: input.body,
    }),
  );

export const useCreateFolder = () =>
  useWorkspaceMutation((id, input: { spaceId: string; name: string }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/folders`, CreatedSchema, {
      method: 'POST',
      body: { name: input.name },
    }),
  );

export const useCreateList = () =>
  useWorkspaceMutation((id, input: { spaceId: string } & CreateListRequest) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/lists`, CreatedSchema, {
      method: 'POST',
      body: { name: input.name, folderId: input.folderId ?? null },
    }),
  );

/** Arşiv ve çöp kutusunda işlem gören türler; ITEM iş öğesidir (Faz 1.3). */
export type ContainerType = 'SPACE' | 'FOLDER' | 'LIST' | 'ITEM';
const PATH_SEGMENT = { SPACE: 'spaces', FOLDER: 'folders', LIST: 'lists', ITEM: 'items' } as const;
const containerPath = (type: ContainerType, id: string) => `${PATH_SEGMENT[type]}/${id}`;

export const useRename = () =>
  useWorkspaceMutation((id, input: { type: 'FOLDER' | 'LIST'; id: string; name: string }) =>
    apiRequest(`${ws(id)}/${containerPath(input.type, input.id)}`, NoContent, {
      method: 'PATCH',
      body: { name: input.name },
    }),
  );

/** Aynı ebeveyn içinde sıralama veya (List için) Folder değiştirme. */
export const useMove = () =>
  useWorkspaceMutation(
    (
      id,
      input:
        | { type: 'SPACE' | 'FOLDER'; id: string; afterId: string | null }
        | { type: 'LIST'; id: string; folderId: string | null; afterId: string | null },
    ) => {
      const { type, id: entityId, ...body } = input;
      return apiRequest(`${ws(id)}/${containerPath(type, entityId)}/move`, NoContent, {
        method: 'POST',
        body,
      });
    },
  );

export type LifecycleAction = 'archive' | 'unarchive' | 'delete' | 'restore';

export const useLifecycle = () =>
  useWorkspaceMutation((id, input: { type: ContainerType; id: string; action: LifecycleAction }) =>
    apiRequest(
      `${ws(id)}/${containerPath(input.type, input.id)}${input.action === 'delete' ? '' : `/${input.action}`}`,
      NoContent,
      { method: input.action === 'delete' ? 'DELETE' : 'POST' },
    ),
  );

export const useFavorite = () =>
  useWorkspaceMutation((id, input: { type: FavoriteType; id: string; favorite: boolean }) =>
    apiRequest(`${ws(id)}/favorites/${input.type}/${input.id}`, NoContent, {
      method: input.favorite ? 'PUT' : 'DELETE',
    }),
  );

export const usePutSpaceMember = () =>
  useWorkspaceMutation((id, input: { spaceId: string; userId: string; role: SpaceRole }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/members/${input.userId}`, NoContent, {
      method: 'PUT',
      body: { role: input.role },
    }),
  );

export const useRemoveSpaceMember = () =>
  useWorkspaceMutation((id, input: { spaceId: string; userId: string }) =>
    apiRequest(`${ws(id)}/spaces/${input.spaceId}/members/${input.userId}`, NoContent, {
      method: 'DELETE',
    }),
  );

/** Ayar MEMBER izinlerini değiştirdiği için oturum bilgisi (me) de tazelenir (ADR-042). */
export function useUpdateWorkspaceSettings() {
  const qc = useQueryClient();
  const mutation = useWorkspaceMutation((id, body: UpdateWorkspaceSettingsRequest) =>
    apiRequest(`${ws(id)}/settings`, NoContent, { method: 'PATCH', body }),
  );
  return {
    ...mutation,
    mutate: (body: UpdateWorkspaceSettingsRequest, options?: { onSuccess?: () => void }) =>
      mutation.mutate(body, {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: meQuery.queryKey });
          options?.onSuccess?.();
        },
      }),
  };
}
