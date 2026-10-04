import { z } from 'zod';
import { WIP_LIMIT } from '../constants/space';
import { STATUS_CATEGORIES } from '../constants/work-item';

const StatusNameSchema = z.string().trim().min(1).max(40);
const StatusColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const WipLimitSchema = z.int().min(WIP_LIMIT.min).max(WIP_LIMIT.max);

/** POST /api/workspaces/:workspaceId/spaces/:spaceId/statuses (`afterId` yoksa en sona). */
export const CreateStatusRequestSchema = z.object({
  name: StatusNameSchema,
  color: StatusColorSchema,
  category: z.enum(STATUS_CATEGORIES),
  afterId: z.uuid().nullable().optional(),
});
export type CreateStatusRequest = z.infer<typeof CreateStatusRequestSchema>;

/** PATCH /api/workspaces/:workspaceId/spaces/:spaceId/statuses/:statusId */
export const UpdateStatusRequestSchema = z.object({
  name: StatusNameSchema.optional(),
  color: StatusColorSchema.optional(),
  category: z.enum(STATUS_CATEGORIES).optional(),
  /** `null` limiti kaldırır. */
  wipLimit: WipLimitSchema.nullable().optional(),
});
export type UpdateStatusRequest = z.infer<typeof UpdateStatusRequestSchema>;
