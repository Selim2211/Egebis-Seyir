import { z } from 'zod';
import { SprintStatusSchema } from './sprint';
import { DateOnlySchema } from './work-item';

// ---------- Raporlar (Faz 2.6, ADR-067) ----------

export const BurndownPointSchema = z.object({
  date: DateOnlySchema,
  ideal: z.number(),
  remaining: z.number().nullable(),
  scopeChange: z.number(),
  /** Burn-up serileri: toplam kapsam ve biten puan. */
  total: z.number().nullable(),
  done: z.number().nullable(),
});

/** GET /api/workspaces/:wid/sprints/:sprintId/burndown */
export const SprintBurndownSchema = z.object({
  sprint: z.object({
    id: z.uuid(),
    name: z.string(),
    status: SprintStatusSchema,
    startDate: DateOnlySchema,
    endDate: DateOnlySchema,
  }),
  baseline: z.number(),
  /** Şu anki kalan puan (canlı hesap); planlı sprint'te null. */
  currentRemaining: z.number().nullable(),
  /** Planlı sprint'in burndown'ı yoktur: boş gelir. */
  points: z.array(BurndownPointSchema),
});
export type SprintBurndown = z.infer<typeof SprintBurndownSchema>;

export const VelocitySprintSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  endDate: DateOnlySchema,
  committedPoints: z.number().nullable(),
  completedPoints: z.number(),
});

/** GET /api/workspaces/:wid/spaces/:spaceId/velocity */
export const VelocityResponseSchema = z.object({
  sprints: z.array(VelocitySprintSchema),
  /** Son 3 tamamlanmış sprint'in ortalaması (planlama referansı); veri yoksa null. */
  average: z.number().nullable(),
});
export type VelocityResponse = z.infer<typeof VelocityResponseSchema>;
