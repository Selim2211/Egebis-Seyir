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
import { NotificationsService } from '../notifications/notifications.service';
import { archivedParent, forbidden, notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';

const MAX_NAMES_PER_REACTION = 10;
const CANDIDATE_LIMIT = 8;

/** Doküman sayfası yorumları: aynı `comments` tablosu, @mention ve tepkiler (Faz 3.3, ADR-070). */
@Injectable()
export class DocCommentsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  /** Silinmemiş sayfa; yazmada arşivli Space reddedilir. */
  private async liveDoc(docId: string, write: boolean) {
    const doc = await this.tenant.db.doc.findFirst({
      where: { id: docId, deletedAt: null },
      select: { id: true, title: true, spaceId: true, space: { select: { archivedAt: true } } },
    });
    if (!doc) throw notFound();
    if (write && doc.space.archivedAt) throw archivedParent();
    return doc;
  }

  async list(docId: string): Promise<Comment[]> {
    const { actorId } = this.ctx;
    await this.liveDoc(docId, false);
    const rows = await this.tenant.db.comment.findMany({
      where: { docId, deletedAt: null },
      include: {
        author: { select: { id: true, name: true, avatarVersion: true } },
        reactions: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const canModerate = this.can(S.SPACE_SETTINGS);
    return rows.map((row) => ({
      id: row.id,
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

  async candidates(docId: string, q: string): Promise<MentionCandidates> {
    const doc = await this.liveDoc(docId, false);
    const needle = q.trim();
    const members = await this.tenant.db.membership.findMany({
      where: needle ? { user: { name: { contains: needle, mode: 'insensitive' } } } : {},
      select: { user: { select: { id: true, name: true, avatarVersion: true } } },
      orderBy: { user: { name: 'asc' } },
      take: 50,
    });
    const visible = await this.access.viewers(
      doc.spaceId,
      members.map((m) => m.user.id),
    );
    return {
      users: members
        .map((m) => m.user)
        .filter((u) => visible.has(u.id))
        .slice(0, CANDIDATE_LIMIT),
    };
  }

  async create(docId: string, input: CommentRequest): Promise<Created> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.liveDoc(docId, true);
    const { body, mentions } = await this.prepare(doc.spaceId, input.body);
    const created = await this.tenant.db.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          workspaceId,
          docId,
          authorId: actorId,
          body: asJson(body),
          bodyText: richTextToPlain(body),
        },
      });
      if (mentions.length > 0) {
        await tx.commentMention.createMany({
          data: mentions.map((userId) => ({ commentId: comment.id, userId, workspaceId })),
          skipDuplicates: true,
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.commented',
        changes: asJson({ title: doc.title, commentId: comment.id }),
      });
      return { id: comment.id };
    });
    await this.notifyMentions(doc, mentions);
    return created;
  }

  async update(docId: string, commentId: string, input: CommentRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.liveDoc(docId, true);
    const existing = await this.tenant.db.comment.findFirst({
      where: { id: commentId, docId, deletedAt: null },
    });
    if (!existing) throw notFound();
    if (existing.authorId !== actorId) throw forbidden(ERROR_CODES.COMMENT_FORBIDDEN);
    const { body, mentions } = await this.prepare(doc.spaceId, input.body);
    const previous = await this.tenant.db.commentMention.findMany({
      where: { commentId },
      select: { userId: true },
    });
    await this.tenant.db.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { body: asJson(body), bodyText: richTextToPlain(body), editedAt: new Date() },
      });
      await tx.commentMention.deleteMany({ where: { commentId } });
      if (mentions.length > 0) {
        await tx.commentMention.createMany({
          data: mentions.map((userId) => ({ commentId, userId, workspaceId })),
          skipDuplicates: true,
        });
      }
    });
    // Düzenlemede yalnızca yeni etiketlenenler bilgilendirilir.
    const before = new Set(previous.map((m) => m.userId));
    await this.notifyMentions(
      doc,
      mentions.filter((id) => !before.has(id)),
    );
  }

  /** Yazar veya `space.settings` izni olan siler (soft-delete). */
  async remove(docId: string, commentId: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const doc = await this.liveDoc(docId, true);
    await this.tenant.db.$transaction(async (tx) => {
      const existing = await tx.comment.findFirst({
        where: { id: commentId, docId, deletedAt: null },
      });
      if (!existing) throw notFound();
      if (existing.authorId !== actorId && !this.can(S.SPACE_SETTINGS)) {
        throw forbidden(ERROR_CODES.COMMENT_FORBIDDEN);
      }
      await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'doc',
        entityId: docId,
        action: 'doc.comment_deleted',
        changes: asJson({ title: doc.title, commentId }),
      });
    });
  }

  async toggleReaction(docId: string, commentId: string, emoji: string): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      throw fail(ERROR_CODES.REACTION_INVALID, 400);
    }
    await this.liveDoc(docId, true);
    const db = this.tenant.db;
    if (!(await db.comment.findFirst({ where: { id: commentId, docId, deletedAt: null } }))) {
      throw notFound();
    }
    const where = { commentId_userId_emoji: { commentId, userId: actorId, emoji } };
    if (await db.commentReaction.findUnique({ where })) {
      await db.commentReaction.delete({ where });
    } else {
      await db.commentReaction.create({ data: { workspaceId, commentId, userId: actorId, emoji } });
    }
  }

  private notifyMentions(doc: { id: string; title: string; spaceId: string }, userIds: string[]) {
    return this.notifications.dispatch({
      type: 'MENTIONED',
      recipientIds: userIds,
      spaceId: doc.spaceId,
      doc: { id: doc.id, title: doc.title },
    });
  }

  /** Boş belgeyi reddeder, görünmeyen kişilerin mention'larını düz metne indirir. */
  private async prepare(spaceId: string, input: RichTextDoc) {
    if (isRichTextEmpty(input)) throw fail(ERROR_CODES.VALIDATION_FAILED, 400);
    const requested = extractMentionIds(input);
    const known = await this.tenant.db.membership.findMany({
      where: { userId: { in: requested } },
      select: { userId: true },
    });
    const visible = await this.access.viewers(
      spaceId,
      known.map((m) => m.userId),
    );
    const body = stripMentions(input, visible) as RichTextDoc;
    return { body, mentions: extractMentionIds(body) };
  }
}
