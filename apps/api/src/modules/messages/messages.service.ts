import { ForbiddenException, Injectable, StreamableFile } from '@nestjs/common';
import {
  checkUpload,
  ERROR_CODES,
  isPreviewable,
  MESSAGE_MAX,
  MESSAGE_MAX_ATTACHMENT_BYTES,
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGES_PAGE_SIZE,
  safeDownloadName,
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
import { StorageService } from '../../infra/storage/storage.service';
import { contentDisposition } from '../collab/attachments.service';
import { QuotasService } from '../quotas/quotas.service';
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
    private readonly storage: StorageService,
    private readonly quotas: QuotasService,
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

  async list(): Promise<ConversationsResponse> {
    this.assertMember();
    const { me } = this.ctx;
    const rows = await this.tenant.db.conversation.findMany({
      where: { OR: [{ userLowId: me }, { userHighId: me }], lastMessageAt: { not: null } },
      include: { userLow: { select: personSelect }, userHigh: { select: personSelect } },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: CONVERSATION_LIMIT,
    });
    // Konuşma başına iki sorgu yerine (N+1; liste 15 sn'de bir yoklanır) son mesaj ve okunmamış sayısı
    // tek seferde gelir (ADR-174). Ham SQL tenant kapsamına girmez: workspaceId açıkça süzülür.
    const { workspaceId } = this.ctx;
    const ids = rows.map((r) => r.id);
    const [lastRows, unreadRows] = ids.length
      ? await Promise.all([
          this.tenant.db.$queryRaw<
            { id: string; body: string; createdAt: Date; senderId: string }[]
          >`
            SELECT c.id, l.body, l."createdAt", l."senderId"
            FROM unnest(${ids}::uuid[]) AS c(id)
            CROSS JOIN LATERAL (
              SELECT m.body, m."createdAt", m."senderId" FROM messages m
              WHERE m."conversationId" = c.id AND m."workspaceId" = ${workspaceId}::uuid AND m."deletedAt" IS NULL
              ORDER BY m."createdAt" DESC, m.id DESC LIMIT 1
            ) l`,
          this.tenant.db.$queryRaw<{ id: string; n: number }[]>`
            SELECT c.id, count(m.id)::int AS n
            FROM conversations c
            JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
              AND m."deletedAt" IS NULL AND m."senderId" <> ${me}::uuid
              AND m."createdAt" > COALESCE(
                CASE WHEN c."userLowId" = ${me}::uuid THEN c."lastReadLowAt" ELSE c."lastReadHighAt" END,
                '-infinity'::timestamptz)
            WHERE c.id = ANY(${ids}::uuid[]) AND c."workspaceId" = ${workspaceId}::uuid
            GROUP BY c.id`,
        ])
      : [[], []];
    const lastOf = new Map(lastRows.map((r) => [r.id, r]));
    const unreadOf = new Map(unreadRows.map((r) => [r.id, r.n]));
    const conversations: Conversation[] = rows.map((row) => {
      const last = lastOf.get(row.id);
      return {
        id: row.id,
        with: this.other(row),
        lastMessage: last
          ? {
              body: last.body,
              at: new Date(last.createdAt).toISOString(),
              mine: last.senderId === me,
            }
          : null,
        unreadCount: unreadOf.get(row.id) ?? 0,
      };
    });
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
      include: { attachments: { orderBy: { createdAt: 'asc' } } },
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
        attachments: m.deletedAt
          ? []
          : m.attachments.map((a) => ({
              id: a.id,
              fileName: a.fileName,
              mimeType: a.mimeType,
              size: a.size,
              previewable: isPreviewable(a.mimeType),
            })),
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

  /**
   * Dosya ekli mesaj (multipart): en çok 5 dosya, toplam 16 MB; metin boş olabilir ama mesaj boş olamaz.
   */
  async sendWithFiles(
    conversationId: string,
    text: string,
    files: Express.Multer.File[],
  ): Promise<Created> {
    this.assertMember();
    const { workspaceId, me } = this.ctx;
    const row = await this.mine(conversationId);
    const body = text.trim();
    if (body.length > MESSAGE_MAX || (body.length === 0 && files.length === 0)) {
      throw fail(ERROR_CODES.VALIDATION_FAILED, 400);
    }
    if (files.length > MESSAGE_MAX_ATTACHMENTS) throw fail(ERROR_CODES.MESSAGE_ATTACHMENTS_LIMIT);
    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > MESSAGE_MAX_ATTACHMENT_BYTES) {
      throw fail(ERROR_CODES.MESSAGE_ATTACHMENTS_TOO_BIG, 413);
    }
    const checked = files.map((file) => {
      const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').trim();
      const check = checkUpload({
        fileName,
        size: file.size,
        maxBytes: MESSAGE_MAX_ATTACHMENT_BYTES,
        header: file.buffer.subarray(0, 16),
      });
      if (!check.ok) throw fail(check.code, check.code === 'ATTACHMENT_TOO_LARGE' ? 413 : 422);
      return { file, fileName, mime: check.mime };
    });
    await this.quotas.assertCanUpload(me, total);

    const keys: string[] = [];
    try {
      for (const c of checked) keys.push(await this.storage.put(workspaceId, c.file.buffer));
      const created = await this.tenant.db.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: { workspaceId, conversationId, senderId: me, body },
          select: { id: true, createdAt: true },
        });
        for (const [i, c] of checked.entries()) {
          await tx.messageAttachment.create({
            data: {
              workspaceId,
              messageId: message.id,
              fileName: c.fileName,
              mimeType: c.mime,
              size: c.file.size,
              storageKey: keys[i]!,
            },
          });
        }
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
    } catch (error) {
      await Promise.all(keys.map((k) => this.storage.remove(k)));
      throw error;
    }
  }

  /** Ek indirme/önizleme: yalnızca konuşmanın tarafları, silinmemiş mesajdan. */
  async openAttachment(
    conversationId: string,
    messageId: string,
    attachmentId: string,
    preview: boolean,
  ): Promise<{ file: StreamableFile; csp: string | null }> {
    this.assertMember();
    await this.mine(conversationId);
    const row = await this.tenant.db.messageAttachment.findFirst({
      where: { id: attachmentId, messageId, message: { conversationId, deletedAt: null } },
    });
    if (!row || !(await this.storage.exists(row.storageKey))) throw notFound();
    const inline = preview && isPreviewable(row.mimeType);
    const file = new StreamableFile(this.storage.open(row.storageKey), {
      type: row.mimeType,
      length: row.size,
      disposition: contentDisposition(inline, safeDownloadName(row.fileName)),
    });
    return { file, csp: row.mimeType === 'application/pdf' ? null : "default-src 'none'; sandbox" };
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
