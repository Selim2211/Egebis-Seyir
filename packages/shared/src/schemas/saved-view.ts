import { z } from 'zod';
import {
  MAX_SAVED_VIEW_CONFIG_BYTES,
  MAX_SAVED_VIEW_NAME,
  SAVED_VIEW_KEYS,
} from '../constants/saved-view';

/** Süzgeç ve görünüm ayarları; yalnızca bilinen anahtarlar, en çok 4 KB. İçerik web'de uygulanırken doğrulanır. */
export const SavedViewConfigSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (config) =>
      Object.keys(config).every((k) => (SAVED_VIEW_KEYS as readonly string[]).includes(k)),
    {
      message: 'SAVED_VIEW_CONFIG_INVALID',
    },
  )
  .refine((config) => JSON.stringify(config).length <= MAX_SAVED_VIEW_CONFIG_BYTES, {
    message: 'SAVED_VIEW_CONFIG_INVALID',
  });

const Name = z.string().trim().min(1).max(MAX_SAVED_VIEW_NAME);

export const SavedViewSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Paylaşımlı görünümü List'i gören herkes görür. */
  shared: z.boolean(),
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  mine: z.boolean(),
  config: SavedViewConfigSchema,
  /** Görüntüleyen güncelleyebilir/silebilir mi (sahip ya da Space yöneticisi). */
  canEdit: z.boolean(),
});
export type SavedView = z.infer<typeof SavedViewSchema>;

/** GET /api/workspaces/:wid/lists/:listId/views — kişisel ve paylaşımlılar, ada göre. */
export const SavedViewsResponseSchema = z.object({ views: z.array(SavedViewSchema) });
export type SavedViewsResponse = z.infer<typeof SavedViewsResponseSchema>;

/** POST /api/workspaces/:wid/lists/:listId/views */
export const CreateSavedViewRequestSchema = z.object({
  name: Name,
  shared: z.boolean().default(false),
  config: SavedViewConfigSchema,
});
export type CreateSavedViewRequest = z.input<typeof CreateSavedViewRequestSchema>;

/** PATCH /api/workspaces/:wid/lists/:listId/views/:viewId */
export const UpdateSavedViewRequestSchema = z
  .object({ name: Name, shared: z.boolean(), config: SavedViewConfigSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'EMPTY_UPDATE' });
export type UpdateSavedViewRequest = z.infer<typeof UpdateSavedViewRequestSchema>;
