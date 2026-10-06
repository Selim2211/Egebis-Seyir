import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  MESSAGES_PAGE_SIZE,
  type Conversation,
  type ConversationsResponse,
  type Created,
  type MessagesResponse,
  type SendMessageRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { notFound } from '../spaces/space-errors';
import { fail } from '../work-items/item-support';

const CONVERSATION_LIMIT = 100;

const personSelect = { id: true, name: true, avatarVersion: true } as const;

type ConversationRow = Prisma.ConversationGetPayload<{
  include: {
    userLow: { select: typeof personSelect };
    userHigh: { select: typeof personSelect };
  };
}>;

/**
 * Birebir mesajlaşma (Faz 7.8, ADR-098). Konuşma iki üye arasındadır; yalnızca taraflar okuyabilir.
 * Gerçek zamanlı kanal yoktur: arayüz kısa aralıkla yoklar. İçerik düz metindir.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, me: this.cls.get('userId')! };
  }

  private assertMember(): void {
    if (this.cls.get('workspaceRole') === 'GUEST') {
      throw new ForbiddenException({ code: ERROR_CODES.FORBIDDEN });
    }
  }

  /** Konuşmayı yalnızca taraflar görür; diğerleri için yokmuş gibi davranılır. */
  private async mine(conversationId: string): Promise<ConversationRow> {
    const { me } = this.ctx;
    const row = await this.tenant.db.conversation.findFirst({
      where: { id: conversationId, OR: [{ userLowId: me }, { userHighId: me }] },
      include: { userLow: { select: personSelect }, userHigh: { select: personSelect } },
    });
    if (!row) throw notFound();
    return row;
  }

  private other(row: ConversationRow) {
    return row.userLowId === this.ctx.me ? row.userHigh : row.userLow;
  }

  private lastReadOf(row: ConversationRow): Date | null {
    return row.userLowId === this.ctx.me ? row.lastReadLowAt : row.lastReadHighAt;
  }

  private unreadOf(row: ConversationRow): Promise<number> {
    const lastRead = this.lastReadOf(row);
    return this.tenant.db.message.count({
      where: {
        conversationId: row.id,
        senderId: { not: this.ctx.me },
        deletedAt: null,
        ...(lastRead && { createdAt: { gt: lastRead } }),
      },
    });
  }

  async list(): Promise<ConversationsResponse> {
    this.assertMember();
    const { me } = this.ctx;
    const rows = await this.tenant.db.conversation.findMany({
      where: { OR: [{ userLowId: me }, { userHighId: me }], lastMessageAt: { not: null } },
      include: { userLow: { select: personSelect }, userHigh: { select: personSelect } },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: CONVERSATION_LIMIT,
    });
    const conversations: Conversation[] = await Promise.all(
      rows.map(async (row) => {
        const [last, unreadCount] = await Promise.all([
          this.tenant.db.message.findFirst({
            where: { conversationId: row.id, deletedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
          this.unreadOf(row),
        ]);
        return {
          id: row.id,
          with: this.other(row),
          lastMessage: last
            ? { body: last.body, at: last.createdAt.toISOString(), mine: last.senderId === me }
            : null,
          unreadCount,
        };
      }),
    );
    return {
      conversations,
      unreadCount: conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    };
  }

  /** Karşı tarafla konuşmayı açar; yoksa oluşturur (ilk mesaj gelene kadar listede görünmez). */
  async open(userId: string): Promise<Created> {
    this.assertMember();
    const { workspaceId, me } = this.ctx;
    if (userId === me) throw fail(ERROR_CODES.MESSAGE_SELF);
    const member = await this.tenant.db.membership.findFirst({
      where: { userId, role: { key: { not: 'GUEST' } } },
      select: { id: true },
    });
    if (!member) throw notFound();
    const [userLowId, userHighId] = me < userId ? [me, userId] : [userId, me];
    const row = await this.tenant.db.conversation.upsert({
      where: { workspaceId_userLowId_userHighId: { workspaceId, userLowId, userHighId } },
      update: {},
      create: { workspaceId, userLowId, userHighId },
      select: { id: true },
    });
    return { id: row.id };
  }

  async messages(conversationId: string, before?: string): Promise<MessagesResponse> {
    this.assertMember();
    const row = await this.mine(conversationId);
    const cursor = before ? new Date(before) : null;
    const page = await this.tenant.db.message.findMany({
      where: {
        conversationId,
        ...(cursor && !Number.isNaN(cursor.getTime()) && { createdAt: { lt: cursor } }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGES_PAGE_SIZE + 1,
    });
    const shown = page.slice(0, MESSAGES_PAGE_SIZE).reverse();
    return {
      with: this.other(row),
      hasMore: page.length > MESSAGES_PAGE_SIZE,
      messages: shown.map((m) => ({
        id: m.id,
        mine: m.senderId === this.ctx.me,
        body: m.deletedAt ? '' : m.body,
        at: m.createdAt.toISOString(),
        deleted: m.deletedAt !== null,
      })),
    };
  }

  async send(conversationId: string, input: SendMessageRequest): Promise<Created> {
    this.assertMember();
    const { workspaceId, me } = this.ctx;
    const row = await this.mine(conversationId);
    const created = await this.tenant.db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { workspaceId, conversationId, senderId: me, body: input.body },
        select: { id: true, createdAt: true },
      });
      await tx.conversation.update({
        where: { id: row.id },
        data: {
          lastMessageAt: message.createdAt,
          ...(row.userLowId === me
            ? { lastReadLowAt: message.createdAt }
            : { lastReadHighAt: message.createdAt }),
        },
      });
      return message;
    });
    return { id: created.id };
  }

  async markRead(conversationId: string): Promise<void> {
    this.assertMember();
    const row = await this.mine(conversationId);
    const now = new Date();
    await this.tenant.db.conversation.update({
      where: { id: row.id },
      data: row.userLowId === this.ctx.me ? { lastReadLowAt: now } : { lastReadHighAt: now },
    });
  }

  async remove(conversationId: string, messageId: string): Promise<void> {
    this.assertMember();
    await this.mine(conversationId);
    const result = await this.tenant.db.message.updateMany({
      where: { id: messageId, conversationId, senderId: this.ctx.me, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw notFound();
  }
}
