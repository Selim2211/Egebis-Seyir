import { z } from 'zod';

/** Kullanıcı başına en çok bu kadar etkin token (ADR-086). */
export const MAX_API_TOKENS = 20;
export const API_TOKEN_PREFIX = 'smt_';
/** Geçerlilik seçenekleri (gün); null = süresiz. */
export const API_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;

/** POST /api/tokens */
export const CreateApiTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  readOnly: z.boolean().default(false),
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(null),
});
export type CreateApiTokenRequest = z.input<typeof CreateApiTokenRequestSchema>;

export const ApiTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  readOnly: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const ApiTokensResponseSchema = z.object({ tokens: z.array(ApiTokenSchema) });
export type ApiTokensResponse = z.infer<typeof ApiTokensResponseSchema>;

/** Oluşturma yanıtı: düz token yalnızca burada, bir kez görünür. */
export const CreatedApiTokenSchema = z.object({ token: z.string(), info: ApiTokenSchema });
export type CreatedApiToken = z.infer<typeof CreatedApiTokenSchema>;
