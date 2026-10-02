import { z } from 'zod';

/** Ortam değişkenleri şeması. Uygulama açılışta doğrular; eksik/hatalı değerde başlamaz. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url(),

  /** Web uygulamasının adresi; e-postadaki bağlantılar bununla kurulur. */
  APP_URL: z.url().default('http://localhost:5173'),
  /** Cookie'ler yalnızca HTTPS'te gönderilsin mi? Boşsa production'da açık. */
  COOKIE_SECURE: z.stringbool().optional(),
  /** Reverse proxy (Caddy) arkasında gerçek istemci IP'si için. */
  TRUST_PROXY: z.stringbool().default(false),

  /** İlk kurulum anahtarı (ADR-034). Boşsa açılışta üretilip loglanır. */
  SETUP_TOKEN: z.string().min(8).optional(),
  /** Giriş/kurulum/sıfırlama uçlarında dakika başına istek sınırı (IP başına). */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),

  /** smtp: gerçek gönderim · memory: testlerde bellekte tutulur. */
  MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Scrum Manager <no-reply@localhost>'),

  /** Arka plan kuyruğu (pg-boss). Kapalıysa işler istek içinde çalışır (testler). */
  QUEUE_ENABLED: z.stringbool().default(true),
});
export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Geçersiz ortam değişkenleri:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const cookieSecure = (env: Pick<Env, 'COOKIE_SECURE' | 'NODE_ENV'>): boolean =>
  env.COOKIE_SECURE ?? env.NODE_ENV === 'production';
