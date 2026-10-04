import { z } from 'zod';
import { CHECKLIST_KINDS } from './work-item';
import { CustomFieldValueSchema } from './custom-field';
import { CreateSpaceRequestSchema } from './space';
import { RichTextSchema } from './rich-text';
import { ESTIMATION_SCALES } from '../constants/estimation';
import { SPACE_COLORS } from '../constants/space';
import { PRIORITIES, STATUS_CATEGORIES, WORK_ITEM_TYPES } from '../constants/work-item';
import { CUSTOM_FIELD_TYPES } from '../constants/custom-field';

export const TEMPLATE_KINDS = ['ITEM', 'LIST', 'SPRINT', 'DOC', 'SPACE'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Bir Space'te veya workspace'te en çok bu kadar şablon (tür başına). */
export const MAX_TEMPLATES_PER_KIND = 50;

const TemplateName = z.string().trim().min(1).max(80);
const ItemTitle = z.string().trim().min(1).max(200);

// ---------- Yükler (sunucuda üretilir, saklanır ve uygulanırken yeniden doğrulanır) ----------

export const ItemTemplatePayloadSchema = z.object({
  type: z.enum(WORK_ITEM_TYPES),
  title: ItemTitle,
  description: RichTextSchema.nullable(),
  priority: z.enum(PRIORITIES),
  points: z.number().nullable(),
  estimateHours: z.number().nullable(),
  /** Etiketler ada göre; hedefte yoksa düşer. */
  labels: z.array(z.string()).max(20),
  customFields: z.record(z.uuid(), CustomFieldValueSchema),
  checklists: z
    .array(
      z.object({
        kind: z.enum(CHECKLIST_KINDS),
        title: z.string(),
        items: z.array(z.string()).max(100),
      }),
    )
    .max(20),
  /** Bir seviye alt öğe. */
  subItems: z.array(z.object({ type: z.enum(WORK_ITEM_TYPES), title: ItemTitle })).max(50),
});
export type ItemTemplatePayload = z.infer<typeof ItemTemplatePayloadSchema>;

export const ListTemplatePayloadSchema = z.object({
  items: z.array(ItemTemplatePayloadSchema).max(100),
});
export type ListTemplatePayload = z.infer<typeof ListTemplatePayloadSchema>;

export const SprintTemplatePayloadSchema = z.object({
  goal: z.string().nullable(),
  capacityNote: z.string().nullable(),
  lengthDays: z.int().min(1).max(60),
});
export type SprintTemplatePayload = z.infer<typeof SprintTemplatePayloadSchema>;

export const DocTemplatePayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: RichTextSchema.nullable(),
});
export type DocTemplatePayload = z.infer<typeof DocTemplatePayloadSchema>;

export const SpaceTemplatePayloadSchema = z.object({
  scrumEnabled: z.boolean(),
  sprintLengthWeeks: z.int(),
  sprintGoalRequired: z.boolean(),
  dodItems: z.array(z.string()),
  dorItems: z.array(z.string()),
  dodEnforced: z.boolean(),
  estimationScale: z.enum(ESTIMATION_SCALES),
  color: z.enum(SPACE_COLORS).nullable(),
  statuses: z.array(
    z.object({
      name: z.string(),
      color: z.string(),
      category: z.enum(STATUS_CATEGORIES),
      wipLimit: z.int().nullable(),
    }),
  ),
  customFields: z.array(
    z.object({
      name: z.string(),
      type: z.enum(CUSTOM_FIELD_TYPES),
      options: z.array(z.object({ label: z.string(), color: z.string().nullable() })),
    }),
  ),
  lists: z.array(z.string()),
});
export type SpaceTemplatePayload = z.infer<typeof SpaceTemplatePayloadSchema>;

// ---------- API ----------

export const TemplateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(TEMPLATE_KINDS),
  name: z.string(),
  createdAt: z.iso.datetime(),
  createdByName: z.string().nullable(),
  /** Önizleme için kısa özet (öğe sayısı gibi). */
  summary: z.string(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplatesResponseSchema = z.object({ templates: z.array(TemplateSchema) });
export type TemplatesResponse = z.infer<typeof TemplatesResponseSchema>;

/** POST .../spaces/:spaceId/templates — var olan bir öğe/List/sprint/doküman sayfasından şablon. */
export const CreateTemplateRequestSchema = z.object({
  kind: z.enum(['ITEM', 'LIST', 'SPRINT', 'DOC']),
  name: TemplateName,
  sourceId: z.uuid(),
});
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;

/** POST .../workspaces/:workspaceId/space-templates — bir Space'ten Space şablonu. */
export const CreateSpaceTemplateRequestSchema = z.object({
  name: TemplateName,
  sourceSpaceId: z.uuid(),
});
export type CreateSpaceTemplateRequest = z.infer<typeof CreateSpaceTemplateRequestSchema>;

/** POST .../spaces/:spaceId/templates/:templateId/apply — şablon türüne göre ilgili alanlar. */
export const ApplyTemplateRequestSchema = z.object({
  /** ITEM: öğenin ekleneceği List. */
  listId: z.uuid().optional(),
  /** ITEM/DOC: üst öğe/sayfa. */
  parentId: z.uuid().nullable().optional(),
  /** ITEM/DOC: başlık; LIST/SPRINT: ad. */
  title: z.string().trim().min(1).max(200).optional(),
  /** LIST: Folder. */
  folderId: z.uuid().nullable().optional(),
  /** SPRINT: başlangıç günü. */
  startDate: z.iso.date().optional(),
});
export type ApplyTemplateRequest = z.infer<typeof ApplyTemplateRequestSchema>;

/** POST .../workspaces/:workspaceId/spaces/from-template */
export const CreateSpaceFromTemplateRequestSchema = CreateSpaceRequestSchema.extend({
  templateId: z.uuid(),
});
export type CreateSpaceFromTemplateRequest = z.input<typeof CreateSpaceFromTemplateRequestSchema>;
