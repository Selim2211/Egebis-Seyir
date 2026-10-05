import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { HttpException, HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  checkWebhookUrl,
  type CreatedWebhook,
  type CreateWebhookRequest,
  ERROR_CODES,
  isPrivateHost,
  MAX_WEBHOOKS_PER_SPACE,
  type UpdateWebhookRequest,
  type Webhook,
  type WebhookDeliveriesResponse,
  WEBHOOK_DELIVERY_KEEP,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  type WebhooksResponse,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Env } from '../../infra/config/env';
import type { AppClsStore } from '../../infra/cls/request-context';
import { AutomationEvents, type DomainEventInput } from '../../infra/events/automation-events';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { generateToken } from '../../infra/security/tokens';
import { notFound } from '../spaces/space-errors';
import { asJson } from '../work-items/item-support';
import { buildWebhookRequest, type WebhookPayload } from './webhook-format';

const JOB = 'webhook.deliver';
const TIMEOUT_MS = 10_000;

const EVENT_NAME: Record<DomainEventInput['type'], WebhookEvent | null> = {
  ITEM_CREATED: 'item.created',
  STATUS_CHANGED: 'item.status_changed',
  PRIORITY_CHANGED: 'item.priority_changed',
  COMMENT_CREATED: 'comment.created',
  SPRINT_STARTED: 'sprint.started',
  SPRINT_COMPLETED: 'sprint.completed',
};

const toWebhook = (row: {
  id: string;
  name: string;
  format: Webhook['format'];
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: Date;
}): Webhook => ({
  id: row.id,
  name: row.name,
  format: row.format,
  url: row.url,
  events: row.events.filter((e): e is WebhookEvent =>
    (WEBHOOK_EVENTS as readonly string[]).includes(e),
  ),
  enabled: row.enabled,
  createdAt: row.createdAt.toISOString(),
});

/** Giden webhook'lar (Faz 6.2/6.3, ADR-087/088): olay → teslimat kaydı → imzalı HTTP isteği, yeniden deneme. */
@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly allowPrivate: boolean;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly events: AutomationEvents,
    private readonly queue: QueueService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/$/, '');
    this.allowPrivate =
      config.get('WEBHOOK_ALLOW_PRIVATE_HOSTS', { infer: true }) ??
      config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  async onModuleInit(): Promise<void> {
    this.events.register((event) => this.onEvent(event));
    await this.queue.register<{ deliveryId: string }>(JOB, (data) => this.deliver(data.deliveryId));
  }

  private get workspaceId() {
    return this.cls.get('workspaceId')!;
  }

  // ---------- Yönetim ----------

  private async assertSpace(spaceId: string): Promise<void> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, workspaceId: this.workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }

  private assertUrl(url: string): void {
    if (!checkWebhookUrl(url, this.allowPrivate)) {
      throw new HttpException(
        { code: ERROR_CODES.WEBHOOK_URL_BLOCKED },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async list(spaceId: string): Promise<WebhooksResponse> {
    await this.assertSpace(spaceId);
    const rows = await this.prisma.webhook.findMany({
      where: { spaceId, workspaceId: this.workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return { webhooks: rows.map(toWebhook) };
  }

  async create(
    spaceId: string,
    input: CreateWebhookRequest & { enabled?: boolean },
  ): Promise<CreatedWebhook> {
    await this.assertSpace(spaceId);
    this.assertUrl(input.url);
    const workspaceId = this.workspaceId;
    const count = await this.prisma.webhook.count({ where: { spaceId, workspaceId } });
    if (count >= MAX_WEBHOOKS_PER_SPACE) {
      throw new HttpException({ code: ERROR_CODES.WEBHOOK_LIMIT }, HttpStatus.CONFLICT);
    }
    const format = input.format ?? 'GENERIC';
    const secret = format === 'GENERIC' ? `whsec_${generateToken()}` : null;
    const row = await this.prisma.webhook.create({
      data: {
        workspaceId,
        spaceId,
        name: input.name,
        format,
        url: input.url,
        secret,
        events: input.events,
        enabled: input.enabled ?? true,
        createdById: this.cls.get('userId') ?? null,
      },
    });
    return { webhook: toWebhook(row), secret };
  }

  private async load(spaceId: string, webhookId: string) {
    const row = await this.prisma.webhook.findFirst({
      where: { id: webhookId, spaceId, workspaceId: this.workspaceId },
    });
    if (!row) throw notFound();
    return row;
  }

  async update(spaceId: string, webhookId: string, input: UpdateWebhookRequest): Promise<void> {
    await this.load(spaceId, webhookId);
    if (input.url !== undefined) this.assertUrl(input.url);
    await this.prisma.webhook.update({
      where: { id: webhookId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.url !== undefined && { url: input.url }),
        ...(input.events !== undefined && { events: input.events }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
      },
    });
  }

  async remove(spaceId: string, webhookId: string): Promise<void> {
    await this.load(spaceId, webhookId);
    await this.prisma.webhook.delete({ where: { id: webhookId } });
  }

  async deliveries(spaceId: string, webhookId: string): Promise<WebhookDeliveriesResponse> {
    await this.load(spaceId, webhookId);
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: WEBHOOK_DELIVERY_KEEP,
    });
    return {
      deliveries: rows.map((r) => ({
        id: r.id,
        event: r.event,
        status: r.status,
        attempts: r.attempts,
        responseStatus: r.responseStatus,
        error: r.error,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Bağlantıyı denemek için `ping` olayı gönderir. */
  async test(spaceId: string, webhookId: string): Promise<void> {
    const hook = await this.load(spaceId, webhookId);
    const space = await this.prisma.space.findFirstOrThrow({
      where: { id: spaceId },
      select: { id: true, key: true, name: true },
    });
    await this.enqueue(hook.id, 'ping', {
      event: 'ping',
      workspaceId: hook.workspaceId,
      space,
      actor: null,
      message: 'Egebis Seyir webhook testi',
    });
  }

  // ---------- Olay → teslimat ----------

  private async onEvent(event: DomainEventInput): Promise<void> {
    const name = EVENT_NAME[event.type];
    const workspaceId = this.cls.get('workspaceId');
    if (!name || !workspaceId) return;
    const hooks = await this.prisma.webhook.findMany({
      where: { workspaceId, spaceId: event.spaceId, enabled: true, events: { has: name } },
    });
    if (hooks.length === 0) return;

    const [space, actor] = await Promise.all([
      this.prisma.space.findFirstOrThrow({
        where: { id: event.spaceId },
        select: { id: true, key: true, name: true },
      }),
      this.cls.get('userId')
        ? this.prisma.user.findUnique({
            where: { id: this.cls.get('userId')! },
            select: { id: true, name: true, locale: true },
          })
        : null,
    ]);
    const payload: WebhookPayload = { event: name, workspaceId, space, actor };

    if ('itemId' in event) {
      const item = await this.prisma.workItem.findFirst({
        where: { id: event.itemId, workspaceId },
        include: { status: { select: { name: true } } },
      });
      if (!item) return;
      payload.item = {
        id: item.id,
        key: `${item.keyPrefix}-${item.number}`,
        title: item.title,
        type: item.type,
        status: item.status.name,
        priority: item.priority,
      };
      payload.url = `${this.appUrl}/items/${payload.item.key}`;
      if (event.type === 'COMMENT_CREATED') payload.commentId = event.commentId;
    } else {
      const sprint = await this.prisma.sprint.findFirst({
        where: { id: event.sprintId, workspaceId },
        select: { id: true, name: true, goal: true },
      });
      if (!sprint) return;
      payload.sprint = sprint;
      payload.url = `${this.appUrl}/spaces/${event.spaceId}/review/${sprint.id}`;
    }

    for (const hook of hooks) await this.enqueue(hook.id, name, payload);
  }

  private async enqueue(webhookId: string, event: string, payload: object): Promise<void> {
    const workspaceId = this.workspaceId;
    const delivery = await this.prisma.webhookDelivery.create({
      data: { workspaceId, webhookId, event, payload: asJson(payload) },
      select: { id: true },
    });
    const stale = await this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      skip: WEBHOOK_DELIVERY_KEEP,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.webhookDelivery.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }
    await this.queue.enqueue(JOB, { deliveryId: delivery.id });
  }

  // ---------- Gönderim ----------

  /** Tek teslimat denemesi. Başarısızlıkta hata fırlatır; kuyruk üstel geri çekilmeyle yeniden dener. */
  async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery) return;
    const { webhook } = delivery;
    const fail = async (error: string, responseStatus?: number): Promise<never> => {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          error: error.slice(0, 300),
          ...(responseStatus !== undefined && { responseStatus }),
        },
      });
      throw new Error(error);
    };

    if (!webhook.enabled && delivery.event !== 'ping') {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', error: 'DISABLED' },
      });
      return;
    }

    const request = buildWebhookRequest(
      webhook.format,
      delivery.payload as unknown as WebhookPayload,
    );
    const body = JSON.stringify(request.body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ScrumManager-Webhook/1',
      'X-Scrum-Event': delivery.event,
      'X-Scrum-Delivery': delivery.id,
      'X-Scrum-Timestamp': timestamp,
    };
    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      headers['X-Scrum-Signature'] = `sha256=${signature}`;
    }

    try {
      const host = new URL(webhook.url).hostname;
      if (!this.allowPrivate) {
        // DNS adı özel adrese çözülüyorsa (rebinding) gönderme.
        const addresses = await lookup(host, { all: true });
        if (addresses.some((a) => isPrivateHost(a.address))) {
          return await fail('WEBHOOK_URL_BLOCKED');
        }
      }
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status < 200 || res.status >= 300)
        return await fail(`HTTP_${res.status}`, res.status);
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'OK',
          attempts: { increment: 1 },
          responseStatus: res.status,
          error: null,
          deliveredAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ERROR';
      if (message.startsWith('HTTP_') || message === 'WEBHOOK_URL_BLOCKED') throw error;
      this.logger.warn(`Webhook ${webhook.id} gönderilemedi: ${message}`);
      return await fail(message);
    }
  }
}
