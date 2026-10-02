import { z } from 'zod';
import {
  BUG_SEVERITIES,
  PRIORITIES,
  STATUS_CATEGORIES,
  TSHIRT_SIZES,
  WORK_ITEM_TYPES,
} from '../constants/work-item';
import { isValidRichText, type RichTextDoc } from '../domain/rich-text';
import { ColorSchema } from './space';

const Title = z.string().trim().min(1).max(500);
const LongText = z.string().trim().max(10_000).nullable();
/** Tarihler gün bazlıdır (saat dilimi yok): YYYY-MM-DD. */
export const DateOnlySchema = z.iso.date();

export const WorkItemTypeSchema = z.enum(WORK_ITEM_TYPES);
export const PrioritySchema = z.enum(PRIORITIES);

/** Tiptap belge JSON'u (ADR-048): izinli yapı ve en çok 200 KB. */
export const RichTextSchema = z.custom<RichTextDoc>((value) => isValidRichText(value), {
  message: 'RICH_TEXT_INVALID',
});

// ---------- Etiketler ----------

export const LabelSchema = z.object({ id: z.uuid(), name: z.string(), color: z.string() });
export type Label = z.infer<typeof LabelSchema>;

export const LabelNameSchema = z.string().trim().min(1).max(40);

/** POST /api/workspaces/:wid/spaces/:spaceId/labels */
export const CreateLabelRequestSchema = z.object({
  name: LabelNameSchema,
  color: ColorSchema.default('#64748B'),
});
export type CreateLabelRequest = z.input<typeof CreateLabelRequestSchema>;

/** PATCH /api/workspaces/:wid/labels/:labelId */
export const UpdateLabelRequestSchema = z
  .object({ name: LabelNameSchema, color: ColorSchema })
  .partial();
export type UpdateLabelRequest = z.infer<typeof UpdateLabelRequestSchema>;

export const LabelsResponseSchema = z.object({ labels: z.array(LabelSchema) });
export type LabelsResponse = z.infer<typeof LabelsResponseSchema>;

export const AssigneeSchema = z.object({ id: z.uuid(), name: z.string() });
export type Assignee = z.infer<typeof AssigneeSchema>;

// ---------- Oluşturma ve güncelleme ----------

/** Tipe özel alanlar (ADR-044): Bug ve Epic. Tipe uymayan alan `WORK_ITEM_FIELD_NOT_ALLOWED`. */
const typeFields = {
  severity: z.enum(BUG_SEVERITIES).nullable().optional(),
  stepsToReproduce: LongText.optional(),
  expectedResult: LongText.optional(),
  actualResult: LongText.optional(),
  environment: LongText.optional(),
  foundInVersion: z.string().trim().max(100).nullable().optional(),
  goal: LongText.optional(),
  tshirtSize: z.enum(TSHIRT_SIZES).nullable().optional(),
  color: ColorSchema.nullable().optional(),
};

/** Bug veya Epic'e özel alan adları. */
export const TYPE_FIELD_NAMES = Object.keys(typeFields) as Array<keyof typeof typeFields>;

const points = z.number().min(0).max(1000).nullable();
const hours = z.number().min(0).max(10_000).nullable();
const ids = z.array(z.uuid()).max(50);

/** POST /api/workspaces/:wid/lists/:listId/items */
export const CreateWorkItemRequestSchema = z
  .object({
    type: WorkItemTypeSchema,
    title: Title,
    statusId: z.uuid().optional(),
    priority: PrioritySchema.default('NORMAL'),
    parentId: z.uuid().nullable().default(null),
    assigneeIds: ids.default([]),
    labelIds: ids.default([]),
    startDate: DateOnlySchema.nullable().default(null),
    dueDate: DateOnlySchema.nullable().default(null),
    points: points.default(null),
    estimateHours: hours.default(null),
    ...typeFields,
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
    path: ['dueDate'],
    message: 'DUE_BEFORE_START',
  });
export type CreateWorkItemRequest = z.input<typeof CreateWorkItemRequestSchema>;
export type CreateWorkItemData = z.output<typeof CreateWorkItemRequestSchema>;

/**
 * PATCH /api/workspaces/:wid/items/:itemId — gönderilen alanlar güncellenir.
 * `force`: açık alt öğesi olan öğeyi yine de Done'a çekmek için (ADR-046).
 */
export const UpdateWorkItemRequestSchema = z
  .object({
    title: Title,
    statusId: z.uuid(),
    priority: PrioritySchema,
    parentId: z.uuid().nullable(),
    assigneeIds: ids,
    labelIds: ids,
    startDate: DateOnlySchema.nullable(),
    dueDate: DateOnlySchema.nullable(),
    points,
    estimateHours: hours,
    description: RichTextSchema.nullable(),
    force: z.boolean(),
    ...typeFields,
  })
  .partial()
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
    path: ['dueDate'],
    message: 'DUE_BEFORE_START',
  });
export type UpdateWorkItemRequest = z.infer<typeof UpdateWorkItemRequestSchema>;

// ---------- Okuma ----------

export const WorkItemSummarySchema = z.object({
  id: z.uuid(),
  /** Okunabilir ID, ör. MOB-142 (ADR-033). */
  key: z.string(),
  type: WorkItemTypeSchema,
  title: z.string(),
  listId: z.uuid(),
  parentId: z.uuid().nullable(),
  statusId: z.uuid(),
  priority: PrioritySchema,
  assignees: z.array(AssigneeSchema),
  labelIds: z.array(z.uuid()),
  points: z.number().nullable(),
  estimateHours: z.number().nullable(),
  startDate: DateOnlySchema.nullable(),
  dueDate: DateOnlySchema.nullable(),
  completedAt: z.iso.datetime().nullable(),
  childCount: z.int(),
  createdAt: z.iso.datetime(),
});
export type WorkItemSummary = z.infer<typeof WorkItemSummarySchema>;

/** GET /api/workspaces/:wid/lists/:listId/items — liste sırasıyla, alt öğeler dahil. */
export const WorkItemsResponseSchema = z.object({
  items: z.array(WorkItemSummarySchema),
  labels: z.array(LabelSchema),
});
export type WorkItemsResponse = z.infer<typeof WorkItemsResponseSchema>;

const crumb = z.object({
  id: z.uuid(),
  key: z.string(),
  type: WorkItemTypeSchema,
  title: z.string(),
});

export const ChecklistItemSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const CHECKLIST_KINDS = ['ACCEPTANCE', 'CHECKLIST'] as const;
export const ChecklistSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CHECKLIST_KINDS),
  title: z.string(),
  items: z.array(ChecklistItemSchema),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

/** Bir öğe başına en çok bu kadar adlı checklist (ADR-049). */
export const MAX_CHECKLISTS_PER_ITEM = 20;

export const LinkRelationSchema = z.enum([
  'BLOCKS',
  'BLOCKED_BY',
  'RELATES_TO',
  'DUPLICATES',
  'DUPLICATED_BY',
]);

export const LinkSchema = z.object({
  id: z.uuid(),
  relation: LinkRelationSchema,
  item: z.object({
    id: z.uuid(),
    key: z.string(),
    type: WorkItemTypeSchema,
    title: z.string(),
    category: z.enum(STATUS_CATEGORIES),
  }),
});
export type ItemLink = z.infer<typeof LinkSchema>;

/** GET /api/workspaces/:wid/items/:itemId ve /items/key/:key */
export const WorkItemDetailSchema = WorkItemSummarySchema.extend({
  spaceId: z.uuid(),
  reporter: AssigneeSchema.nullable(),
  description: RichTextSchema.nullable(),
  /** Kabul kriterleri (varsa) ilk, sonra adlı checklist'ler. */
  checklists: z.array(ChecklistSchema),
  /** Görüntüleyenin göremediği Space'lerdeki öğeler listelenmez (ADR-050). */
  links: z.array(LinkSchema),
  watching: z.boolean(),
  watcherCount: z.int(),
  /** Kökten ebeveyne kadar üst öğeler. */
  ancestors: z.array(crumb),
  children: z.array(WorkItemSummarySchema),
  labels: z.array(LabelSchema),
  /** Epic: point ağırlıklı ilerleme (0–100); diğer tipler null (ADR-045). */
  progress: z.int().nullable(),
  /** Alt öğelerin saat toplamı (rollup); alt öğede saat yoksa null. */
  rolledUpHours: z.number().nullable(),
  archived: z.boolean(),
  severity: z.enum(BUG_SEVERITIES).nullable(),
  stepsToReproduce: z.string().nullable(),
  expectedResult: z.string().nullable(),
  actualResult: z.string().nullable(),
  environment: z.string().nullable(),
  foundInVersion: z.string().nullable(),
  goal: z.string().nullable(),
  tshirtSize: z.enum(TSHIRT_SIZES).nullable(),
  color: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type WorkItemDetail = z.infer<typeof WorkItemDetailSchema>;

/** Oluşturma ve kopyalama yanıtı. */
export const CreatedItemSchema = z.object({ id: z.uuid(), key: z.string() });
export type CreatedItem = z.infer<typeof CreatedItemSchema>;

// ---------- Taşıma, kopyalama, toplu işlem ----------

/** POST .../items/:itemId/move — aynı veya başka Space'teki List; `afterId: null` = en başa. */
export const MoveItemRequestSchema = z.object({
  listId: z.uuid(),
  afterId: z.uuid().nullable().default(null),
});
export type MoveItemRequest = z.input<typeof MoveItemRequestSchema>;

/** POST .../items/:itemId/copy */
export const CopyItemRequestSchema = z.object({
  listId: z.uuid().optional(),
  includeChildren: z.boolean().default(false),
});
export type CopyItemRequest = z.input<typeof CopyItemRequestSchema>;

export const BULK_MAX_ITEMS = 200;

/** POST /api/workspaces/:wid/spaces/:spaceId/items/bulk (ADR-047). */
export const BulkUpdateRequestSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(BULK_MAX_ITEMS),
  patch: z
    .object({
      statusId: z.uuid(),
      priority: PrioritySchema,
      addAssigneeIds: ids,
      removeAssigneeIds: ids,
      addLabelIds: ids,
      removeLabelIds: ids,
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0),
  force: z.boolean().default(false),
});
export type BulkUpdateRequest = z.input<typeof BulkUpdateRequestSchema>;

// ---------- Checklist, bağlantı, izleyici, bölme (Faz 1.4) ----------

const ChecklistText = z.string().trim().min(1).max(500);

/** POST .../items/:itemId/checklists */
export const CreateChecklistRequestSchema = z.object({
  title: z.string().trim().min(1).max(100),
});
export type CreateChecklistRequest = z.infer<typeof CreateChecklistRequestSchema>;

/** PATCH .../items/:itemId/checklists/:checklistId */
export const RenameChecklistRequestSchema = CreateChecklistRequestSchema;

/** POST .../items/:itemId/checklists/:checklistId/entries — kabul kriteri için checklistId yerine `acceptance`. */
export const CreateChecklistEntryRequestSchema = z.object({ text: ChecklistText });
export type CreateChecklistEntryRequest = z.infer<typeof CreateChecklistEntryRequestSchema>;

/** PATCH .../checklists/:checklistId/entries/:entryId */
export const UpdateChecklistEntryRequestSchema = z
  .object({ text: ChecklistText, done: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type UpdateChecklistEntryRequest = z.infer<typeof UpdateChecklistEntryRequestSchema>;

export const ACCEPTANCE_CHECKLIST = 'acceptance';

/** POST .../items/:itemId/links — `type` bu öğenin gözünden: "bu öğe hedefi engeller" vb. */
export const CreateLinkRequestSchema = z.object({
  targetId: z.uuid(),
  relation: LinkRelationSchema,
});
export type CreateLinkRequest = z.infer<typeof CreateLinkRequestSchema>;

export const SPLIT_MAX_TASKS = 30;

/** POST .../items/:itemId/split — Story'yi Task'lara böler (ADR-051). */
export const SplitItemRequestSchema = z.object({
  titles: z.array(Title).min(1).max(SPLIT_MAX_TASKS),
});
export type SplitItemRequest = z.infer<typeof SplitItemRequestSchema>;

export const SplitItemResponseSchema = z.object({ items: z.array(CreatedItemSchema) });
export type SplitItemResponse = z.infer<typeof SplitItemResponseSchema>;

/** GET /api/workspaces/:wid/items/search?q= — bağlantı eklerken öğe arama. */
export const ItemSearchResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      type: WorkItemTypeSchema,
      title: z.string(),
    }),
  ),
});
export type ItemSearchResponse = z.infer<typeof ItemSearchResponseSchema>;

// ---------- Görünümler, arama, "Benim işlerim" (Faz 1.5) ----------

const rowContext = {
  space: z.object({
    id: z.uuid(),
    name: z.string(),
    key: z.string(),
    color: z.string(),
    icon: z.string().nullable(),
  }),
  list: z.object({ id: z.uuid(), name: z.string() }),
  status: z.object({
    id: z.uuid(),
    name: z.string(),
    color: z.string(),
    category: z.enum(STATUS_CATEGORIES),
  }),
};

/** Birden çok List'ten gelen öğe satırı: özet + bulunduğu yer ve durum bilgisi. */
export const WorkItemRowSchema = WorkItemSummarySchema.extend(rowContext);
export type WorkItemRow = z.infer<typeof WorkItemRowSchema>;

export const MY_WORK_SCOPES = ['assigned', 'created', 'watching'] as const;
export type MyWorkScope = (typeof MY_WORK_SCOPES)[number];

/** GET /api/workspaces/:wid/my-work?scope=&includeDone= */
export const MyWorkResponseSchema = z.object({ items: z.array(WorkItemRowSchema) });
export type MyWorkResponse = z.infer<typeof MyWorkResponseSchema>;

export const SEARCH_LIMIT = 20;

/** GET /api/workspaces/:wid/search?q= — görülebilen Space'lerde başlık, açıklama ve kimlik araması. */
export const SearchResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      type: WorkItemTypeSchema,
      title: z.string(),
      ...rowContext,
    }),
  ),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
