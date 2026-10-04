import { z } from 'zod';
import { CUSTOM_FIELD_LIMITS, CUSTOM_FIELD_TYPES } from '../constants/custom-field';

const FieldNameSchema = z.string().trim().min(1).max(CUSTOM_FIELD_LIMITS.nameMax);

/** Değer biçimi türe göre `checkFieldValue` ile doğrulanır; burada yalnızca olası şekiller. */
export const CustomFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

/** İş öğesindeki özel alan değerleri: alan kimliği → değer. */
export const CustomFieldValuesSchema = z.record(z.string(), CustomFieldValueSchema);
export type CustomFieldValues = z.infer<typeof CustomFieldValuesSchema>;

/** PATCH iş öğesi: alan kimliği → yeni değer; `null` değeri temizler. Yalnızca verilen alanlar değişir. */
export const CustomFieldPatchSchema = z.record(z.uuid(), CustomFieldValueSchema.nullable());

export const CustomFieldOptionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  color: z.string().nullable(),
});

export const CustomFieldSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(CustomFieldOptionSchema),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;

/** GET /api/workspaces/:workspaceId/spaces/:spaceId/custom-fields */
export const CustomFieldsResponseSchema = z.object({ fields: z.array(CustomFieldSchema) });
export type CustomFieldsResponse = z.infer<typeof CustomFieldsResponseSchema>;

/** Yeni seçenekte `id` yok (sunucu üretir); mevcut seçenekte `id` gönderilir. */
const OptionInputSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(CUSTOM_FIELD_LIMITS.optionLabelMax),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
});
export type CustomFieldOptionInput = z.infer<typeof OptionInputSchema>;

/** POST .../spaces/:spaceId/custom-fields (`afterId` yoksa en sona). */
export const CreateCustomFieldRequestSchema = z.object({
  name: FieldNameSchema,
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(OptionInputSchema).max(CUSTOM_FIELD_LIMITS.optionsPerField).optional(),
});
export type CreateCustomFieldRequest = z.infer<typeof CreateCustomFieldRequestSchema>;

/** PATCH .../custom-fields/:fieldId — tür değişmez. */
export const UpdateCustomFieldRequestSchema = z.object({
  name: FieldNameSchema.optional(),
  options: z.array(OptionInputSchema).max(CUSTOM_FIELD_LIMITS.optionsPerField).optional(),
});
export type UpdateCustomFieldRequest = z.infer<typeof UpdateCustomFieldRequestSchema>;
