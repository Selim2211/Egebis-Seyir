import { z } from 'zod';
import { RichTextSchema } from './rich-text';

/** Yorum tepkileri için sabit emoji kümesi (ADR-055). */
export const REACTION_EMOJIS = ['👍', '❤️', '🎉', '👀', '😄', '✅'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

const person = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarVersion: z.string().nullable(),
});

export const ReactionSummarySchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
  count: z.int(),
  /** Görüntüleyen bu tepkiyi vermiş mi. */
  mine: z.boolean(),
  /** Tepki verenlerin adları (ipucu için; en çok 10). */
  names: z.array(z.string()),
});

export const CommentSchema = z.object({
  id: z.uuid(),
  author: person,
  body: RichTextSchema,
  createdAt: z.iso.datetime(),
  /** Düzenlendiyse son düzenleme zamanı. */
  editedAt: z.iso.datetime().nullable(),
  reactions: z.array(ReactionSummarySchema),
  /** Görüntüleyen düzenleyebilir mi (yalnızca yazar). */
  canEdit: z.boolean(),
  /** Görüntüleyen silebilir mi (yazar veya Space ayarı yetkisi). */
  canDelete: z.boolean(),
});
export type Comment = z.infer<typeof CommentSchema>;

/** GET /api/workspaces/:wid/items/:itemId/comments — eskiden yeniye. */
export const CommentsResponseSchema = z.object({ comments: z.array(CommentSchema) });
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;

/** POST|PATCH .../comments[/:commentId] */
export const CommentRequestSchema = z.object({ body: RichTextSchema });
export type CommentRequest = z.infer<typeof CommentRequestSchema>;

/** PUT .../comments/:commentId/reactions — açık tepkiyi kapatır, kapalıyı açar. */
export const ToggleReactionRequestSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });
export type ToggleReactionRequest = z.infer<typeof ToggleReactionRequestSchema>;

/** @mention önerisi: öğeyi görebilen workspace üyeleri. */
export const MentionCandidatesSchema = z.object({
  users: z.array(person),
});
export type MentionCandidates = z.infer<typeof MentionCandidatesSchema>;

// ---------- Ekler ----------

export const AttachmentSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.int(),
  createdAt: z.iso.datetime(),
  uploader: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Satır içi önizlenebilir (resim/PDF; ADR-056). */
  previewable: z.boolean(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

// ---------- Aktivite ----------

export const ACTIVITY_PAGE_SIZE = 30;

/** Okunur hale getirilmiş tek alan değişikliği (kimlikler adlara çevrilmiş). */
export const ActivityChangeSchema = z.object({
  field: z.string(),
  from: z.union([z.string(), z.array(z.string()), z.null()]),
  to: z.union([z.string(), z.array(z.string()), z.null()]),
});
export type ActivityChange = z.infer<typeof ActivityChangeSchema>;

export const ActivityEventSchema = z.object({
  id: z.uuid(),
  /** Örn. `item.created`, `item.updated`, `item.commented` (ADR-015). */
  action: z.string(),
  actor: z
    .object({ id: z.uuid(), name: z.string(), avatarVersion: z.string().nullable() })
    .nullable(),
  at: z.iso.datetime(),
  item: z.object({ id: z.uuid(), key: z.string(), title: z.string() }).nullable(),
  changes: z.array(ActivityChangeSchema),
  /** Olaya özel ek bilgi (ör. `title` veya hedef anahtar). */
  detail: z.string().nullable(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/** GET .../items/:itemId/activity ve .../activity — `next` bir sonraki sayfa imleci. */
export const ActivityResponseSchema = z.object({
  events: z.array(ActivityEventSchema),
  next: z.string().nullable(),
});
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;

// ---------- Denetim günlüğü (Faz 8.3, ADR-103) ----------

export const AUDIT_ENTITY_TYPES = [
  'workspace',
  'member',
  'invitation',
  'space',
  'folder',
  'list',
  'item',
  'label',
  'sprint',
  'doc',
  'team',
] as const;
export const AuditEntityTypeSchema = z.enum(AUDIT_ENTITY_TYPES);
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>;

export const AUDIT_PAGE_SIZE = 50;

export const AuditEventSchema = ActivityEventSchema.extend({
  entityType: z.string(),
  entityId: z.uuid(),
  /** Nesnenin okunur adı (öğe: "MOB-12 Başlık"); silinmişse null. */
  entityLabel: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** GET /api/workspaces/:wid/audit?actorId&entityType&action&from&to&before */
export const AuditQuerySchema = z.object({
  actorId: z.uuid().optional(),
  entityType: AuditEntityTypeSchema.optional(),
  /** `sprint.` gibi önek ya da tam eylem adı. */
  action: z.string().max(60).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  before: z.string().max(200).optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditResponseSchema = z.object({
  events: z.array(AuditEventSchema),
  next: z.string().nullable(),
  /** Süzgeç seçenekleri: günlükte görünen kişiler. */
  actors: z.array(person),
});
export type AuditResponse = z.infer<typeof AuditResponseSchema>;
