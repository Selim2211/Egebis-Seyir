import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  channelEnabled,
  completePreferences,
  NOTIFICATIONS_PAGE_SIZE,
  notificationRecipients,
  type Locale,
  type Notification,
  type NotificationPreferences,
  type NotificationsResponse,
  type NotificationType,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Env } from '../../infra/config/env';
import type { AppClsStore } from '../../infra/cls/request-context';
import { MailService } from '../../infra/mail/mail.service';
import { notificationMail } from '../../infra/mail/notification-mail';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import type { Prisma } from '../../generated/prisma/client';
import { asJson } from '../work-items/item-support';

type NotificationRow = Prisma.NotificationGetPayload<{
  include: { actor: { select: { id: true; name: true; avatarVersion: true } } };
}>;

/** Bir olayın bildirim girdisi. Alıcılar süzülür: eylemi yapan ve Space'i göremeyenler çıkar. */
export interface DispatchInput {
  type: NotificationType;
  recipientIds: readonly string[];
  spaceId: string;
  item?: { id: string; key: string; title: string };
  sprint?: { id: string; name: string };
  /** Doküman sayfasıyla ilgili olay (yorumda etiketlenme). */
  doc?: { id: string; title: string };
  /** Ek bilgi (durum değişikliğinde yeni durum adı). */
  detail?: string;
}

interface StoredData {
  actorName: string;
  itemKey?: string;
  itemTitle?: string;
  sprintName?: string;
  docId?: string;
  docTitle?: string;
  detail?: string;
}

/**
 * Bildirim üretimi ve kutu (ADR-066). `dispatch` ana işlemin **dışında** (işlem tamamlandıktan sonra)
 * çağrılır ve hiçbir zaman fırlatmaz: bildirim hatası asıl eylemi bozmamalıdır.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  // ---------- Üretim ----------

  async dispatch(input: DispatchInput): Promise<void> {
    try {
      await this.deliver(input);
    } catch (error) {
      this.logger.error(`Bildirim gönderilemedi (${input.type}): ${String(error)}`);
    }
  }

  private async deliver(input: DispatchInput): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const visible = await this.access.viewers(input.spaceId, [...new Set(input.recipientIds)]);
    const recipients = notificationRecipients(input.recipientIds, actorId, visible);
    if (recipients.length === 0) return;

    const [preferences, users, actor] = await Promise.all([
      db.notificationPreference.findMany({
        where: { userId: { in: recipients }, type: input.type },
      }),
      db.user.findMany({
        where: { id: { in: recipients } },
        select: { id: true, email: true, locale: true },
      }),
      db.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } }),
    ]);
    const prefsOf = (userId: string) => preferences.filter((p) => p.userId === userId);

    const data: StoredData = {
      actorName: actor.name,
      ...(input.item && { itemKey: input.item.key, itemTitle: input.item.title }),
      ...(input.sprint && { sprintName: input.sprint.name }),
      ...(input.doc && { docId: input.doc.id, docTitle: input.doc.title }),
      ...(input.detail && { detail: input.detail }),
    };

    const inApp = recipients.filter((id) => channelEnabled(prefsOf(id), input.type, 'inApp'));
    if (inApp.length > 0) {
      await db.notification.createMany({
        data: inApp.map((userId) => ({
          workspaceId,
          userId,
          actorId,
          type: input.type,
          spaceId: input.spaceId,
          workItemId: input.item?.id ?? null,
          sprintId: input.sprint?.id ?? null,
          data: asJson(data),
        })),
      });
    }

    const url = input.doc
      ? `${this.appUrl}/spaces/${input.spaceId}/docs?doc=${input.doc.id}`
      : input.item
        ? `${this.appUrl}/items/${encodeURIComponent(input.item.key)}`
        : `${this.appUrl}/spaces/${input.spaceId}/review/${input.sprint?.id ?? ''}`;
    const emailing = users.filter((u) => channelEnabled(prefsOf(u.id), input.type, 'email'));
    await Promise.allSettled(
      emailing.map((user) =>
        this.mail.send(
          notificationMail({
            to: user.email,
            locale: user.locale as Locale,
            type: input.type,
            actorName: actor.name,
            item: input.item,
            sprintName: input.sprint?.name,
            docTitle: input.doc?.title,
            detail: input.detail,
            url,
          }),
        ),
      ),
    );
  }

  // ---------- Kutu ----------

  async list(options: { unreadOnly: boolean; before?: Date }): Promise<NotificationsResponse> {
    const { actorId } = this.ctx;
    const db = this.tenant.db;
    const [rows, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: {
          userId: actorId,
          ...(options.unreadOnly && { readAt: null }),
          ...(options.before && { createdAt: { lt: options.before } }),
        },
        include: { actor: { select: { id: true, name: true, avatarVersion: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATIONS_PAGE_SIZE + 1,
      }),
      db.notification.count({ where: { userId: actorId, readAt: null } }),
    ]);
    const page = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
    return {
      items: page.map((row) => this.toDto(row)),
      unreadCount,
      hasMore: rows.length > NOTIFICATIONS_PAGE_SIZE,
    };
  }

  async unreadCount(): Promise<number> {
    return this.tenant.db.notification.count({
      where: { userId: this.ctx.actorId, readAt: null },
    });
  }

  async markRead(id: string): Promise<void> {
    await this.tenant.db.notification.updateMany({
      where: { id, userId: this.ctx.actorId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(): Promise<void> {
    await this.tenant.db.notification.updateMany({
      where: { userId: this.ctx.actorId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private toDto(row: NotificationRow): Notification {
    const data = row.data as unknown as StoredData;
    return {
      id: row.id,
      type: row.type,
      at: row.createdAt.toISOString(),
      read: row.readAt !== null,
      actor: row.actor,
      item: data.itemKey ? { key: data.itemKey, title: data.itemTitle ?? '' } : null,
      detail: data.detail ?? null,
      doc: data.docId ? { id: data.docId, title: data.docTitle ?? '', spaceId: row.spaceId } : null,
      sprint: row.sprintId
        ? { id: row.sprintId, name: data.sprintName ?? '', spaceId: row.spaceId }
        : null,
    };
  }

  // ---------- Tercihler ----------

  async preferences(): Promise<NotificationPreferences> {
    const stored = await this.tenant.db.notificationPreference.findMany({
      where: { userId: this.ctx.actorId },
    });
    return { preferences: completePreferences(stored) };
  }

  /** Gönderilen türlerin tercihini yazar; gönderilmeyenler olduğu gibi kalır. */
  async setPreferences(input: NotificationPreferences): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    await db.$transaction(async (tx) => {
      for (const { type, inApp, email } of input.preferences) {
        await tx.notificationPreference.upsert({
          where: { userId_type: { userId: actorId, type } },
          create: { workspaceId, userId: actorId, type, inApp, email },
          update: { inApp, email },
        });
      }
    });
  }
}
