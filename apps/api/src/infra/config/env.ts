import { z } from 'zod';

/** Ortam değişkenleri şeması. Uygulama açılışta doğrular; eksik/hatalı değerde başlamaz. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),
});
export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Geçersiz ortam değişkenleri:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
