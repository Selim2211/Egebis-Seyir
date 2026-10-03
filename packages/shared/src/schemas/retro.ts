import { z } from 'zod';
import { RETRO_COLUMNS, RETRO_TEXT_MAX } from '../constants/retro';

export const RetroColumnSchema = z.enum(RETRO_COLUMNS);

export const RetroItemSchema = z.object({
  id: z.uuid(),
  column: RetroColumnSchema,
  text: z.string(),
  author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  votes: z.int(),
  /** Görüntüleyen bu maddeye oy verdi mi. */
  voted: z.boolean(),
  /** Aksiyondan oluşturulan görev (varsa). */
  task: z.object({ id: z.uuid(), key: z.string(), title: z.string() }).nullable(),
  canDelete: z.boolean(),
});
export type RetroItem = z.infer<typeof RetroItemSchema>;

/** GET /api/workspaces/:wid/sprints/:sprintId/retro */
export const RetroResponseSchema = z.object({
  sprint: z.object({ id: z.uuid(), name: z.string(), spaceId: z.uuid() }),
  items: z.array(RetroItemSchema),
  /** Madde ekleme/oy/aksiyon yetkisi (Developer ve üstü). */
  canParticipate: z.boolean(),
});
export type RetroResponse = z.infer<typeof RetroResponseSchema>;

/** POST /api/workspaces/:wid/sprints/:sprintId/retro/items */
export const CreateRetroItemRequestSchema = z.object({
  column: RetroColumnSchema,
  text: z.string().trim().min(1).max(RETRO_TEXT_MAX),
});
export type CreateRetroItemRequest = z.infer<typeof CreateRetroItemRequestSchema>;

/** POST .../retro/items/:retroItemId/task yanıtı. */
export const RetroTaskCreatedSchema = z.object({ id: z.uuid(), key: z.string() });
export type RetroTaskCreated = z.infer<typeof RetroTaskCreatedSchema>;
