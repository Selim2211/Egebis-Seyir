import { z } from 'zod';
import { DateOnlySchema, PrioritySchema } from './work-item';

/** Başlık her formda zorunludur; diğer alanlar isteğe bağlı eklenir (Faz 7.4). */
export const FORM_FIELD_KEYS = ['description', 'priority', 'dueDate', 'assignee'] as const;
export type FormFieldKey = (typeof FORM_FIELD_KEYS)[number];
export const MAX_FORMS_PER_SPACE = 20;
/** Formla açılabilen iş öğesi tipleri. */
export const FORM_ITEM_TYPES = ['TASK', 'STORY', 'BUG'] as const;

export const FormFieldSchema = z.object({
  key: z.enum(FORM_FIELD_KEYS),
  required: z.boolean().default(false),
});
export type FormField = z.infer<typeof FormFieldSchema>;

const fields = z
  .array(FormFieldSchema)
  .max(FORM_FIELD_KEYS.length)
  .refine((list) => new Set(list.map((f) => f.key)).size === list.length, {
    message: 'DUPLICATE_FIELD',
  });

const Name = z.string().trim().min(1).max(100);
const Description = z.string().trim().max(500).nullable();

/** POST /api/workspaces/:wid/spaces/:spaceId/forms */
export const CreateFormRequestSchema = z.object({
  name: Name,
  description: Description.default(null),
  listId: z.uuid(),
  itemType: z.enum(FORM_ITEM_TYPES).default('TASK'),
  fields: fields.default([]),
  enabled: z.boolean().default(true),
});
export type CreateFormRequest = z.input<typeof CreateFormRequestSchema>;
export type CreateFormData = z.output<typeof CreateFormRequestSchema>;

export const UpdateFormRequestSchema = z
  .object({
    name: Name,
    description: Description,
    listId: z.uuid(),
    itemType: z.enum(FORM_ITEM_TYPES),
    fields,
    enabled: z.boolean(),
  })
  .partial();
export type UpdateFormRequest = z.infer<typeof UpdateFormRequestSchema>;

export const FormSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  listId: z.uuid(),
  listName: z.string(),
  itemType: z.enum(FORM_ITEM_TYPES),
  fields: z.array(FormFieldSchema),
  enabled: z.boolean(),
});
export type Form = z.infer<typeof FormSchema>;

export const FormsResponseSchema = z.object({ forms: z.array(FormSchema) });
export type FormsResponse = z.infer<typeof FormsResponseSchema>;

/** POST .../forms/:formId/submissions — yalnızca formda tanımlı alanlar kabul edilir. */
export const SubmitFormRequestSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(5000).nullable().default(null),
  priority: PrioritySchema.nullable().default(null),
  dueDate: DateOnlySchema.nullable().default(null),
  assigneeId: z.uuid().nullable().default(null),
});
export type SubmitFormRequest = z.input<typeof SubmitFormRequestSchema>;
export type SubmitFormData = z.output<typeof SubmitFormRequestSchema>;
