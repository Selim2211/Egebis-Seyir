import { z } from 'zod';

export const AiStatusSchema = z.object({
  enabled: z.boolean(),
  /** Story Point önerisi (ADR-155): Ayarlar'da açık mı ve gereken en az cümle. */
  estimate: z.object({ enabled: z.boolean(), minSentences: z.number().int() }),
});
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

/** POST .../items/:itemId/ai/estimate: açıklamadan Fibonacci Story Point önerisi (ADR-155). */
export const AiEstimateSchema = z.object({
  points: z.union(
    [1, 2, 3, 5, 8, 13, 21].map((n) => z.literal(n)) as [
      z.ZodLiteral<number>,
      z.ZodLiteral<number>,
      ...z.ZodLiteral<number>[],
    ],
  ),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  reason: z.string().max(1000),
});
export type AiEstimate = z.infer<typeof AiEstimateSchema>;

/** POST .../items/:itemId/ai/split-epic: Epic'i Task'lara bölme önerisi. */
export const AiSplitSuggestionSchema = z.object({
  stories: z
    .array(
      z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000) }),
    )
    .max(12),
});
export type AiSplitSuggestion = z.infer<typeof AiSplitSuggestionSchema>;
