import { z } from 'zod';
import { VIDEO_FOLDER_NAME_MAX, VIDEO_TITLE_MAX } from '../domain/videos';

/** Video arşivi API sözleşmeleri (Faz 15, ADR-129). */
export const VideoFolderSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
});
export type VideoFolder = z.infer<typeof VideoFolderSchema>;

export const VideoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  fileName: z.string(),
  mime: z.string(),
  size: z.number(),
  received: z.number(),
  status: z.enum(['UPLOADING', 'READY']),
  folderId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  uploadedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type Video = z.infer<typeof VideoSchema>;

/** GET /spaces/:spaceId/videos */
export const VideosResponseSchema = z.object({
  folders: z.array(VideoFolderSchema),
  videos: z.array(VideoSchema),
  /** Sunucunun kabul ettiği en büyük video (bayt). */
  maxBytes: z.number(),
  chunkBytes: z.number(),
});
export type VideosResponse = z.infer<typeof VideosResponseSchema>;

const title = z.string().trim().min(1).max(VIDEO_TITLE_MAX);

/** POST /spaces/:spaceId/videos — yükleme başlatır (parçalar ayrıca gönderilir). */
export const CreateVideoRequestSchema = z.object({
  title,
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  folderId: z.uuid().nullable().default(null),
});
export type CreateVideoRequest = z.infer<typeof CreateVideoRequestSchema>;

/** PUT /videos/:videoId/content?offset= yanıtı: şu ana kadar alınan bayt. */
export const VideoProgressSchema = z.object({ received: z.number() });
export type VideoProgress = z.infer<typeof VideoProgressSchema>;

export const UpdateVideoRequestSchema = z
  .object({
    title,
    description: z.string().max(5000),
    folderId: z.uuid().nullable(),
  })
  .partial();
export type UpdateVideoRequest = z.infer<typeof UpdateVideoRequestSchema>;

export const CreateVideoFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(VIDEO_FOLDER_NAME_MAX),
  parentId: z.uuid().nullable().default(null),
});
export type CreateVideoFolderRequest = z.infer<typeof CreateVideoFolderRequestSchema>;

export const UpdateVideoFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(VIDEO_FOLDER_NAME_MAX),
});
export type UpdateVideoFolderRequest = z.infer<typeof UpdateVideoFolderRequestSchema>;
