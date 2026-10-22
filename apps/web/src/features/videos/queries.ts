import {
  CreatedSchema,
  VideosResponseSchema,
  type CreateVideoFolderRequest,
  type CreateVideoRequest,
  type UpdateVideoRequest,
} from '@scrum/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const ws = (id: string) => `/workspaces/${id}`;

export const videosKey = (workspaceId: string, spaceId: string) =>
  ['workspaces', workspaceId, 'spaces', spaceId, 'videos'] as const;

export const videosQuery = (workspaceId: string, spaceId: string) =>
  queryOptions({
    queryKey: videosKey(workspaceId, spaceId),
    queryFn: () => apiRequest(`${ws(workspaceId)}/spaces/${spaceId}/videos`, VideosResponseSchema),
  });

/** Oynatıcı ve küçük resim kaynağı (Range destekli). */
export const videoStreamUrl = (workspaceId: string, videoId: string) =>
  `/api${ws(workspaceId)}/videos/${videoId}/stream`;

/** Yalnızca bu Proje'nin video listesini tazeleyen değişiklik. */
function useVideoMutation<T, R = unknown>(
  spaceId: string,
  fn: (workspaceId: string, input: T) => Promise<R>,
) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: videosKey(id, spaceId) }),
  });
}

export const useStartVideo = (spaceId: string) =>
  useVideoMutation(spaceId, (id, body: CreateVideoRequest) =>
    apiRequest(`${ws(id)}/spaces/${spaceId}/videos`, CreatedSchema, { method: 'POST', body }),
  );

export const useUpdateVideo = (spaceId: string) =>
  useVideoMutation(spaceId, (id, input: { videoId: string; body: UpdateVideoRequest }) =>
    apiRequest(`${ws(id)}/videos/${input.videoId}`, NoContent, {
      method: 'PATCH',
      body: input.body,
    }),
  );

export const useDeleteVideo = (spaceId: string) =>
  useVideoMutation(spaceId, (id, videoId: string) =>
    apiRequest(`${ws(id)}/videos/${videoId}`, NoContent, { method: 'DELETE' }),
  );

export const useCreateVideoFolder = (spaceId: string) =>
  useVideoMutation(spaceId, (id, body: CreateVideoFolderRequest) =>
    apiRequest(`${ws(id)}/spaces/${spaceId}/video-folders`, CreatedSchema, {
      method: 'POST',
      body,
    }),
  );

export const useRenameVideoFolder = (spaceId: string) =>
  useVideoMutation(spaceId, (id, input: { folderId: string; name: string }) =>
    apiRequest(`${ws(id)}/video-folders/${input.folderId}`, NoContent, {
      method: 'PATCH',
      body: { name: input.name },
    }),
  );

export const useDeleteVideoFolder = (spaceId: string) =>
  useVideoMutation(spaceId, (id, folderId: string) =>
    apiRequest(`${ws(id)}/video-folders/${folderId}`, NoContent, { method: 'DELETE' }),
  );
