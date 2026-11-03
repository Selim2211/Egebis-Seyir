import { z } from 'zod';

/**
 * Doküman/video yükleme sınırları (ADR-154). Dosya = iş öğesi veya doküman eki ya da video.
 * Bir sınır null ise o boyutta sınır yoktur.
 */
export const QuotaUsageSchema = z.object({
  files: z.number().int(),
  bytes: z.number(),
});
export type QuotaUsage = z.infer<typeof QuotaUsageSchema>;

export const QuotaSchema = z.object({
  id: z.uuid(),
  target: z.enum(['USER', 'TEAM']),
  targetId: z.uuid(),
  name: z.string(),
  maxFiles: z.number().int().nullable(),
  maxMb: z.number().int().nullable(),
  usage: QuotaUsageSchema,
});
export type Quota = z.infer<typeof QuotaSchema>;

/** GET /quotas — Super Admin. */
export const QuotasResponseSchema = z.object({ quotas: z.array(QuotaSchema) });
export type QuotasResponse = z.infer<typeof QuotasResponseSchema>;

/** PUT /quotas — kişi ya da ekip için sınırı yazar (varsa günceller). İki sınır da boşsa silinir. */
export const PutQuotaRequestSchema = z
  .object({
    userId: z.uuid().optional(),
    teamId: z.uuid().optional(),
    maxFiles: z.number().int().min(0).max(1_000_000).nullable(),
    maxMb: z.number().int().min(0).max(10_000_000).nullable(),
  })
  .refine((v) => !!v.userId !== !!v.teamId, { path: ['userId'] });
export type PutQuotaRequest = z.infer<typeof PutQuotaRequestSchema>;
