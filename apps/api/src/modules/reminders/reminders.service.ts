import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  channelEnabled,
  ERROR_CODES,
  formatItemKey,
  REMINDER_MAX_DAYS_AHEAD,
  REMINDERS_PER_ITEM,
  type CreateReminderRequest,
  type Created,
  type Locale,
  type Reminder,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import type { Env } from '../../infra/config/env';
import { MailService } from '../../infra/mail/mail.service';
import { notificationMail } from '../../infra/mail/notification-mail';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { QueueService } from '../../infra/queue/queue.service';
import { fail } from '../work-items/item-support';

const SEND_JOB = 'reminders.send';
const BATCH = 200;
const DAY_MS = 86_400_000;

/**
 * Kişisel görev hatırlatıcıları (Faz 7.3, ADR-095). Kullanıcı kendi hatırlatıcılarını görür ve
 * yönetir; zamanı gelenler her dakika çalışan işle uygulama içi bildirim ve e-posta olarak gönderilir.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly queue: QueueService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.schedule(SEND_JOB, '* * * * *', () => this.sendDue().then(() => {}));
  }

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private async activeItem(itemId: string) {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      select: { id: true },
    });
    if (!item) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
  }

  async list(itemId: string): Promise<Reminder[]> {
    await this.activeItem(itemId);
    const rows = await this.tenant.db.reminder.findMany({
      where: { workItemId: itemId, userId: this.ctx.actorId },
      orderBy: [{ remindAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      remindAt: r.remindAt.toISOString(),
      note: r.note,
      sent: r.sentAt !== null,
    }));
  }

  async create(itemId: string, input: CreateReminderRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeItem(itemId);
    const remindAt = new Date(input.remindAt);
    const now = Date.now();
    if (remindAt.getTime() <= now || remindAt.getTime() > now + REMINDER_MAX_DAYS_AHEAD * DAY_MS) {
      throw fail(ERROR_CODES.REMINDER_IN_PAST);
    }
    const db = this.tenant.db;
    const pending = await db.reminder.count({
      where: { workItemId: itemId, userId: actorId, sentAt: null },
    });
    if (pending >= REMINDERS_PER_ITEM) throw fail(ERROR_CODES.REMINDER_LIMIT);
    const row = await db.reminder.create({
      data: {
        workspaceId,
        userId: actorId,
        workItemId: itemId,
        remindAt,
        note: input.note?.trim() || null,
      },
    });
    return { id: row.id };
  }

  async remove(itemId: string, reminderId: string): Promise<void> {
    await this.activeItem(itemId);
    const result = await this.tenant.db.reminder.deleteMany({
      where: { id: reminderId, workItemId: itemId, userId: this.ctx.actorId },
    });
    if (result.count === 0) throw new NotFoundException({ code: ERROR_CODES.NOT_FOUND });
  }

  /**
   * Zamanı gelen hatırlatıcıları gönderir (sistem işi, tüm workspace'ler). Her kayıt önce
   * `sentAt` ile sahiplenilir; aynı anda çalışan iki işlemden yalnızca biri gönderir.
   */
  async sendDue(now = new Date()): Promise<number> {
    const due = await this.prisma.reminder.findMany({
      where: { sentAt: null, remindAt: { lte: now } },
      orderBy: { remindAt: 'asc' },
      take: BATCH,
      include: {
        workItem: {
          select: {
            id: true,
            keyPrefix: true,
            number: true,
            title: true,
            spaceId: true,
            deletedAt: true,
          },
        },
        user: { select: { id: true, email: true, locale: true } },
      },
    });
    let sent = 0;
    for (const reminder of due) {
      const claimed = await this.prisma.reminder.updateMany({
        where: { id: reminder.id, sentAt: null },
        data: { sentAt: now },
      });
      if (claimed.count === 0 || reminder.workItem.deletedAt) continue;
      try {
        await this.deliver(reminder);
        sent += 1;
      } catch (error) {
        this.logger.error(`Hatırlatıcı gönderilemedi (${reminder.id}): ${String(error)}`);
      }
    }
    return sent;
  }

  private async deliver(r: {
    workspaceId: string;
    note: string | null;
    workItem: { id: string; keyPrefix: string; number: number; title: string; spaceId: string };
    user: { id: string; email: string; locale: string };
  }): Promise<void> {
    const key = formatItemKey(r.workItem.keyPrefix, r.workItem.number);
    const detail = r.note ?? r.workItem.title;
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId: r.user.id, type: 'REMINDER' },
    });
    if (channelEnabled(preferences, 'REMINDER', 'inApp')) {
      await this.prisma.notification.create({
        data: {
          workspaceId: r.workspaceId,
          userId: r.user.id,
          actorId: null,
          type: 'REMINDER',
          spaceId: r.workItem.spaceId,
          workItemId: r.workItem.id,
          data: { actorName: '', itemKey: key, itemTitle: r.workItem.title, detail },
        },
      });
    }
    if (channelEnabled(preferences, 'REMINDER', 'email')) {
      await this.mail.send(
        notificationMail({
          to: r.user.email,
          locale: r.user.locale as Locale,
          type: 'REMINDER',
          actorName: '',
          item: { key, title: r.workItem.title },
          detail,
          url: `${this.appUrl}/items/${encodeURIComponent(key)}`,
        }),
      );
    }
  }
}
