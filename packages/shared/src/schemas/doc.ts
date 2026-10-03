import { z } from 'zod';
import { DOC_TITLE_MAX } from '../constants/doc';
import { STATUS_CATEGORIES } from '../constants/work-item';
import { RichTextSchema } from './rich-text';
import { WorkItemTypeSchema } from './work-item';

const DocTitle = z.string().trim().min(1).max(DOC_TITLE_MAX);

/** Ağaçta görünen hafif sayfa kaydı (içerik yok). */
export const DocNodeSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  title: z.string(),
  rank: z.string(),
  updatedAt: z.iso.datetime(),
  /** Çöp kutusunda mı (yalnızca çöp listesinde true). */
  deleted: z.boolean(),
});
export type DocNodeDto = z.infer<typeof DocNodeSchema>;

/** GET /api/workspaces/:wid/spaces/:spaceId/docs */
export const DocsResponseSchema = z.object({ docs: z.array(DocNodeSchema) });
export type DocsResponse = z.infer<typeof DocsResponseSchema>;

/** GET /api/workspaces/:wid/spaces/:spaceId/docs/trash */
export const DocsTrashResponseSchema = DocsResponseSchema;

/** POST /api/workspaces/:wid/spaces/:spaceId/docs */
export const CreateDocRequestSchema = z.object({
  title: DocTitle,
  parentId: z.uuid().nullable().default(null),
  content: RichTextSchema.nullable().default(null),
});
export type CreateDocRequest = z.input<typeof CreateDocRequestSchema>;

/** Dokümana bağlı iş öğesi (görüntüleyenin göremediği Space'tekiler listelenmez). */
export const DocLinkedItemSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  type: WorkItemTypeSchema,
  title: z.string(),
  category: z.enum(STATUS_CATEGORIES),
});
export type DocLinkedItem = z.infer<typeof DocLinkedItemSchema>;

const docCrumb = z.object({ id: z.uuid(), title: z.string() });

/** GET /api/workspaces/:wid/docs/:docId */
export const DocDetailSchema = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  parentId: z.uuid().nullable(),
  title: z.string(),
  content: RichTextSchema.nullable(),
  /** Eşzamanlılık denetimi: kaydederken aynen geri gönderilir. */
  revision: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Kökten ebeveyne kadar üst sayfalar. */
  ancestors: z.array(docCrumb),
  /** Bağlı görevler ve Epic'ler. */
  links: z.array(DocLinkedItemSchema),
  deleted: z.boolean(),
});
export type DocDetail = z.infer<typeof DocDetailSchema>;

/**
 * PATCH /api/workspaces/:wid/docs/:docId — başlık ve/veya içerik; `revision` zorunlu (ADR-069).
 * İçerik `null` = boş belge.
 */
export const UpdateDocRequestSchema = z
  .object({
    revision: z.int().min(1),
    title: DocTitle,
    content: RichTextSchema.nullable(),
  })
  .partial({ title: true, content: true })
  .refine((v) => v.title !== undefined || v.content !== undefined, { message: 'EMPTY_UPDATE' });
export type UpdateDocRequest = z.infer<typeof UpdateDocRequestSchema>;

export const UpdateDocResponseSchema = z.object({
  revision: z.int(),
  updatedAt: z.iso.datetime(),
});
export type UpdateDocResponse = z.infer<typeof UpdateDocResponseSchema>;

/** POST /api/workspaces/:wid/docs/:docId/move — `afterId` yoksa kardeşlerin en başına. */
export const MoveDocRequestSchema = z.object({
  parentId: z.uuid().nullable(),
  afterId: z.uuid().nullable().default(null),
});
export type MoveDocRequest = z.input<typeof MoveDocRequestSchema>;

export const DocVersionSchema = z.object({
  version: z.int(),
  title: z.string(),
  author: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  /** Bu sürüm şu anki içerikle aynı mı. */
  current: z.boolean(),
});

/** GET /api/workspaces/:wid/docs/:docId/versions — yeniden eskiye. */
export const DocVersionsResponseSchema = z.object({ versions: z.array(DocVersionSchema) });
export type DocVersionsResponse = z.infer<typeof DocVersionsResponseSchema>;

/** GET /api/workspaces/:wid/docs/:docId/versions/:version */
export const DocVersionDetailSchema = DocVersionSchema.extend({
  content: RichTextSchema.nullable(),
});
export type DocVersionDetail = z.infer<typeof DocVersionDetailSchema>;
