import { z } from 'zod';

/** Webhook olayları (ADR-087). */
export const WEBHOOK_EVENTS = [
  'item.created',
  'item.status_changed',
  'item.priority_changed',
  'comment.created',
  'sprint.started',
  'sprint.completed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_FORMATS = ['GENERIC', 'SLACK', 'TEAMS'] as const;
export type WebhookFormat = (typeof WEBHOOK_FORMATS)[number];

/** Space başına en çok bu kadar webhook. */
export const MAX_WEBHOOKS_PER_SPACE = 10;
/** Webhook başına saklanan teslimat kaydı. */
export const WEBHOOK_DELIVERY_KEEP = 50;

const Url = z
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'WEBHOOK_URL_INVALID' });
const Events = z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length);

/** POST .../spaces/:spaceId/webhooks */
export const CreateWebhookRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  format: z.enum(WEBHOOK_FORMATS).default('GENERIC'),
  url: Url,
  events: Events,
  enabled: z.boolean().default(true),
});
export type CreateWebhookRequest = z.input<typeof CreateWebhookRequestSchema>;

/** PATCH .../webhooks/:webhookId */
export const UpdateWebhookRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: Url,
    events: Events,
    enabled: z.boolean(),
  })
  .partial();
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequestSchema>;

export const WebhookSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  format: z.enum(WEBHOOK_FORMATS),
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Webhook = z.infer<typeof WebhookSchema>;

export const WebhooksResponseSchema = z.object({ webhooks: z.array(WebhookSchema) });
export type WebhooksResponse = z.infer<typeof WebhooksResponseSchema>;

/** Oluşturma yanıtı: imza anahtarı (GENERIC) yalnızca burada görünür. */
export const CreatedWebhookSchema = z.object({
  webhook: WebhookSchema,
  secret: z.string().nullable(),
});
export type CreatedWebhook = z.infer<typeof CreatedWebhookSchema>;

export const WebhookDeliverySchema = z.object({
  id: z.uuid(),
  event: z.string(),
  status: z.enum(['PENDING', 'OK', 'FAILED']),
  attempts: z.int(),
  responseStatus: z.int().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

export const WebhookDeliveriesResponseSchema = z.object({
  deliveries: z.array(WebhookDeliverySchema),
});
export type WebhookDeliveriesResponse = z.infer<typeof WebhookDeliveriesResponseSchema>;
