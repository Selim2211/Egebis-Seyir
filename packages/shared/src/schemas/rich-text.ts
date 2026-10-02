import { z } from 'zod';
import { isValidRichText, type RichTextDoc } from '../domain/rich-text';

/** Tiptap belge JSON'u (ADR-048): izinli yapı ve en çok 200 KB. */
export const RichTextSchema = z.custom<RichTextDoc>((value) => isValidRichText(value), {
  message: 'RICH_TEXT_INVALID',
});
