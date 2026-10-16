import { z } from 'zod';
import { RoleKeySchema } from './role';

/** Öğe erişim listesindeki bir kişi ya da takım (ADR-113). */
export const ItemAccessEntrySchema = z.object({
  userId: z.uuid().nullable(),
  teamId: z.uuid().nullable(),
  /** Görünen ad: kişi adı ya da takım adı. */
  name: z.string(),
  roleKey: RoleKeySchema,
});
export type ItemAccessEntry = z.infer<typeof ItemAccessEntrySchema>;

/**
 * GET /api/workspaces/:workspaceId/items/:itemId/access
 * - `own`: öğenin kendi erişim kaydı var.
 * - `root`: etkin kaydın sahibi öğe (kendisi ya da en yakın üst); kayıt yoksa null = Space erişimi.
 */
export const ItemAccessSchema = z.object({
  own: z.boolean(),
  root: z.object({ id: z.uuid(), key: z.string(), title: z.string() }).nullable(),
  isPrivate: z.boolean(),
  entries: z.array(ItemAccessEntrySchema),
});
export type ItemAccess = z.infer<typeof ItemAccessSchema>;

export const PutItemAccessEntrySchema = z
  .object({
    userId: z.uuid().nullish(),
    teamId: z.uuid().nullish(),
    roleKey: RoleKeySchema,
  })
  .refine((e) => (e.userId ? 1 : 0) + (e.teamId ? 1 : 0) === 1, {
    message: 'userId veya teamId (yalnızca biri)',
  });

/** PUT /api/workspaces/:workspaceId/items/:itemId/access — özel erişimi kurar/günceller. */
export const PutItemAccessRequestSchema = z.object({
  isPrivate: z.boolean(),
  entries: z.array(PutItemAccessEntrySchema).max(100),
});
export type PutItemAccessRequest = z.infer<typeof PutItemAccessRequestSchema>;
