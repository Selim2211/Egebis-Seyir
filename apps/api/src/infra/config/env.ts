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

  /** Webhook adresi dahili/özel ağda olabilir mi (ADR-087)? Verilmezse yalnızca production dışında. */
  WEBHOOK_ALLOW_PRIVATE_HOSTS: z.stringbool().optional(),

  /** Yapay zekâ destekli özellikler (ADR-090): anahtar yoksa özellik kapalı; metin Anthropic API'sine gider. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),
  AI_BASE_URL: z.url().default('https://api.anthropic.com'),
  /** Kullanıcı başına dakikada en çok istek. */
  AI_RATE_LIMIT: z.coerce.number().int().positive().default(10),

  /** Dosya ekleri ve profil fotoğrafları (ADR-056); Docker'da kalıcı volume olmalı. */
  UPLOAD_DIR: z.string().default('./data/uploads'),
  /** Dosya başına en çok MB (ADR-056). */
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
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
