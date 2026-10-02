import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  extractMentionIds,
  isRichTextEmpty,
  REACTION_EMOJIS,
  richTextToPlain,
  SPACE_PERMISSIONS as S,
  stripMentions,
  type Comment,
  type CommentRequest,
  type Created,
  type MentionCandidates,
  type RichTextDoc,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { forbidden, notFound } from '../spaces/space-errors';
import { asJson, fail, type TenantTx } from '../work-items/item-support';

const MAX_NAMES_PER_REACTION = 10;
const CANDIDATE_LIMIT = 8;

/** Görev yorumları: zengin metin, @mention kaydı, tepkiler (ADR-055). */
@Injectable()
export class CommentsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  private async activeItem(itemId: string) {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      select: { id: true, spaceId: true },
    });
    if (!item) throw notFound();
    return item;
  }

  // ---------- Okuma ----------

  async list(itemId: string): Promise<Comment[]> {
    const { actorId } = this.ctx;
    await this.activeItem(itemId);
    const rows = await this.tenant.db.comment.findMany({
      where: { workItemId: itemId, deletedAt: null },
      include: {
        author: { select: { id: true, name: true, avatarVersion: true } },
        reactions: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const canModerate = this.can(S.SPACE_SETTINGS);
    return rows.map((row) => ({
      id: row.id,
      // Silinmiş kullanıcının yorumu "bilinmeyen" yazarla kalır.
      author: row.author ?? { id: row.id, name: '—', avatarVersion: null },
      body: row.body as unknown as RichTextDoc,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      reactions: REACTION_EMOJIS.flatMap((emoji) => {
        const mine = row.reactions.filter((r) => r.emoji === emoji);
        return mine.length === 0
          ? []
          : {
              emoji,
              count: mine.length,
              mine: mine.some((r) => r.userId === actorId),
              names: mine.slice(0, MAX_NAMES_PER_REACTION).map((r) => r.user.name),
            };
      }),
      canEdit: row.authorId === actorId,
      canDelete: row.authorId === actorId || canModerate,
    }));
  }

  /** @mention önerisi: öğeyi görebilen workspace üyeleri, ada göre süzülür. */
  async candidates(itemId: string, q: string): Promise<MentionCandidates> {
    const item = await this.activeItem(itemId);
    const needle = q.trim();
    const members = await this.tenant.db.membership.findMany({
      where: needle ? { user: { name: { contains: needle, mode: 'insensitive' } } } : {},
      select: { user: { select: { id: true, name: true, avatarVersion: true } } },
      orderBy: { user: { name: 'asc' } },
      take: 50,
    });
    const visible = await this.access.viewers(
      item.spaceId,
      members.map((m) => m.user.id),
    );
    return {
      users: members
        .map((m) => m.user)
        .filter((u) => visible.has(u.id))
        .slice(0, CANDIDATE_LIMIT),
    };
  }

  // ---------- Yazma ----------

  async create(itemId: string, input: CommentRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    const item = await this.activeItem(itemId);
    const { doc, mentions } = await this.prepare(item.spaceId, input.body);
    return this.tenant.db.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          workspaceId,
          workItemId: itemId,
          authorId: actorId,
          body: asJson(doc),
          bodyText: richTextToPlain(doc),
        },
      });
      await this.syncMentions(tx, comment.id, itemId, mentions);
      // Yorum yazan izleyici olur (ADR-051).
      await tx.workItemWatcher.createMany({
        data: [{ workItemId: itemId, userId: actorId, workspaceId }],
        skipDuplicates: true,
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.commented',
        changes: { commentId: comment.id, mentions },
      });
      return { id: comment.id };
    });
  }

  async update(itemId: string, commentId: string, input: CommentRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const item = await this.activeItem(itemId);
    const existing = await this.tenant.db.comment.findFirst({
      where: { id: commentId, workItemId: itemId, deletedAt: null },
    });
    if (!existing) throw notFound();
    if (existing.authorId !== actorId) throw forbidden(ERROR_CODES.COMMENT_FORBIDDEN);
    const { doc, mentions } = await this.prepare(item.spaceId, input.body);
    await this.tenant.db.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { body: asJson(doc), bodyText: richTextToPlain(doc), editedAt: new Date() },
      });
      await tx.commentMention.deleteMany({ where: { commentId } });
      await this.syncMentions(tx, commentId, itemId, mentions);
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.comment_edited',
        changes: { commentId },
      });
    });
  }

  /** Yazar veya `space.settings` izni olan siler (soft-delete). */
  async remove(itemId: string, commentId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    await this.activeItem(itemId);
    await this.tenant.db.$transaction(async (tx) => {
      const existing = await tx.comment.findFirst({
        where: { id: commentId, workItemId: itemId, deletedAt: null },
      });
      if (!existing) throw notFound();
      if (existing.authorId !== actorId && !this.can(S.SPACE_SETTINGS)) {
        throw forbidden(ERROR_CODES.COMMENT_FORBIDDEN);
      }
      await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.comment_deleted',
        changes: { commentId },
      });
    });
  }

  /** Tepkiyi açar veya kapatır. */
  async toggleReaction(itemId: string, commentId: string, emoji: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      throw fail(ERROR_CODES.REACTION_INVALID, 400);
    }
    await this.activeItem(itemId);
    const db = this.tenant.db;
    if (
      !(await db.comment.findFirst({
        where: { id: commentId, workItemId: itemId, deletedAt: null },
      }))
    ) {
      throw notFound();
    }
    const where = { commentId_userId_emoji: { commentId, userId: actorId, emoji } };
    if (await db.commentReaction.findUnique({ where })) {
      await db.commentReaction.delete({ where });
    } else {
      await db.commentReaction.create({ data: { workspaceId, commentId, userId: actorId, emoji } });
    }
  }

  // ---------- Yardımcılar ----------

  /** Boş belgeyi reddeder, görünmeyen kişilerin mention'larını düz metne indirir. */
  private async prepare(spaceId: string, body: RichTextDoc) {
    if (isRichTextEmpty(body)) throw fail(ERROR_CODES.VALIDATION_FAILED, 400);
    const requested = extractMentionIds(body);
    const known = await this.tenant.db.membership.findMany({
      where: { userId: { in: requested } },
      select: { userId: true },
    });
    const visible = await this.access.viewers(
      spaceId,
      known.map((m) => m.userId),
    );
    const doc = stripMentions(body, visible) as RichTextDoc;
    return { doc, mentions: extractMentionIds(doc) };
  }

  /** Mention kayıtlarını yazar; mention edilenler izleyici olur (ADR-051, ADR-055). */
  private async syncMentions(tx: TenantTx, commentId: string, itemId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    const { workspaceId } = this.ctx;
    await tx.commentMention.createMany({
      data: userIds.map((userId) => ({ commentId, userId, workspaceId })),
      skipDuplicates: true,
    });
    await tx.workItemWatcher.createMany({
      data: userIds.map((userId) => ({ workItemId: itemId, userId, workspaceId })),
      skipDuplicates: true,
    });
  }
}
