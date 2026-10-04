import { z } from 'zod';
import { WIP_LIMIT } from '../constants/space';

/** PATCH /api/workspaces/:workspaceId/spaces/:spaceId/statuses/:statusId */
export const UpdateStatusRequestSchema = z.object({
  /** `null` limiti kaldırır. */
  wipLimit: z.int().min(WIP_LIMIT.min).max(WIP_LIMIT.max).nullable().optional(),
});
export type UpdateStatusRequest = z.infer<typeof UpdateStatusRequestSchema>;
