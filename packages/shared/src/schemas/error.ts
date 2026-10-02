import { z } from 'zod';

/** Tüm API hatalarının ortak biçimi (ADR-007). */
export const ApiErrorSchema = z.object({
  code: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
