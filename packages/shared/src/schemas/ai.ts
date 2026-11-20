import { z } from 'zod';
import { SPRINT_GOAL_MIN_LENGTH } from '../constants/sprint';

/** AI'ın önerebileceği Story Point değerleri (ADR-155; 34 ADR-175 ile eklendi). */
export const AI_ESTIMATE_POINTS = [1, 2, 3, 5, 8, 13, 21, 34, 55] as const;

export const AiStatusSchema = z.object({
  /** Sunucuda anahtar tanımlı ve Super Admin ana anahtarı açık (ADR-175). */
  enabled: z.boolean(),
  /** Story Point önerisi (ADR-155): Ayarlar'da açık mı ve gereken en az cümle. */
  estimate: z.object({ enabled: z.boolean(), minSentences: z.number().int() }),
  /** Sprint hedefi öner / kontrol et (ADR-175). */
  sprintGoal: z.object({ enabled: z.boolean() }),
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

/** POST .../items/:itemId/ai/estimate: Fibonacci Story Point önerisi; proje ve sprint bağlamıyla (ADR-155, ADR-175). */
export const AiEstimateSchema = z.object({
  points: z.union(
    AI_ESTIMATE_POINTS.map((n) => z.literal(n)) as [
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

// ---------- Sprint hedefi (ADR-175) ----------

export const AI_SPRINT_GOAL_MODES = ['SUGGEST', 'CHECK'] as const;

/**
 * POST .../spaces/:spaceId/ai/sprint-goal. `sprintId` verilirse o sprint'in işleri, verilmezse
 * (yeni sprint) Backlog'un üstündeki işler esas alınır. CHECK için `goal` zorunludur.
 */
export const AiSprintGoalRequestSchema = z
  .object({
    mode: z.enum(AI_SPRINT_GOAL_MODES),
    sprintId: z.uuid().optional(),
    /** Henüz kaydedilmemiş sprint adı (bağlam için). */
    name: z.string().trim().max(80).optional(),
    goal: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.mode !== 'CHECK' || (v.goal?.length ?? 0) > 0, {
    path: ['goal'],
    message: 'GOAL_REQUIRED',
  });
export type AiSprintGoalRequest = z.infer<typeof AiSprintGoalRequestSchema>;

/** Uyum derecesi: hedef projeye ve sprint'in işlerine ne kadar oturuyor. */
export const AI_GOAL_VERDICTS = ['FITS', 'PARTIAL', 'OFF_TRACK'] as const;

export const AiSprintGoalSchema = z.object({
  /** SUGGEST: önerilen hedef; CHECK: iyileştirilmiş hedef. */
  goal: z.string().trim().min(1).max(500),
  /** Yalnızca CHECK: 0–100 uyum puanı. */
  score: z.number().int().min(0).max(100).nullable(),
  verdict: z.enum(AI_GOAL_VERDICTS).nullable(),
  /** Gerekçe / eksikler (kısa maddeler). */
  feedback: z.array(z.string().max(400)).max(8),
  /** Önerilen ya da iyileştirilmiş hedef en az 64 karakter mi (değilse kullanıcı tamamlamalı). */
  meetsMinLength: z.boolean(),
});
export type AiSprintGoal = z.infer<typeof AiSprintGoalSchema>;

/** Modelden beklenen ham yanıt (meetsMinLength sunucuda hesaplanır). */
export const AiSprintGoalModelSchema = AiSprintGoalSchema.omit({ meetsMinLength: true }).extend({
  score: z.number().int().min(0).max(100).nullable().optional().default(null),
  verdict: z.enum(AI_GOAL_VERDICTS).nullable().optional().default(null),
  feedback: z.array(z.string().max(400)).max(8).optional().default([]),
});

export const sprintGoalLongEnough = (goal: string) => goal.trim().length >= SPRINT_GOAL_MIN_LENGTH;
