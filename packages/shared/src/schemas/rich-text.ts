import { z } from 'zod';
import { isValidRichText, type RichTextDoc } from '../domain/rich-text';

/**
 * Tiptap belge JSON'u (ADR-048): izinli yapı ve en çok 200 KB.
 * `z.custom` yerine `z.unknown().refine` kullanılır: OpenAPI şeması üretilebilsin diye
 * (özel tipler JSON Schema'ya çevrilemez ve uygulama açılışta düşer).
 */
export const RichTextSchema = z
  .unknown()
  .refine((value): value is RichTextDoc => isValidRichText(value), {
    message: 'RICH_TEXT_INVALID',
  })
  .meta({ type: 'object', description: "Tiptap belge JSON'u" });
