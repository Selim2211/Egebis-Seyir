import { z } from 'zod';

export const AiStatusSchema = z.object({ enabled: z.boolean() });
export type AiStatus = z.infer<typeof AiStatusSchema>;

/** POST .../items/:itemId/ai/summarize */
export const AiSummarySchema = z.object({ summary: z.string() });
export type AiSummary = z.infer<typeof AiSummarySchema>;

/** POST .../items/:itemId/ai/suggest-story: kullanıcı hikâyesi taslağı ve kabul kriterleri (öneri, otomatik uygulanmaz). */
export const AiStorySuggestionSchema = z.object({
  description: z.string().max(4000),
  acceptanceCriteria: z.array(z.string().max(500)).max(12),
});
export type AiStorySuggestion = z.infer<typeof AiStorySuggestionSchema>;

/** POST .../items/:itemId/ai/split-epic: Epic'i Story'lere bölme önerisi. */
export const AiSplitSuggestionSchema = z.object({
  stories: z
    .array(
      z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000) }),
    )
    .max(12),
});
export type AiSplitSuggestion = z.infer<typeof AiSplitSuggestionSchema>;
