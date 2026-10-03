import { z } from 'zod';
import { DateOnlySchema } from './work-item';

const WeeklySchema = z.array(z.object({ weekStart: DateOnlySchema, count: z.int() }));

/** GET /api/workspaces/:wid/spaces/:spaceId/flow?days=30 (ADR-078) */
export const FlowSchema = z.object({
  from: DateOnlySchema,
  to: DateOnlySchema,
  cfd: z.object({
    days: z.array(DateOnlySchema),
    notStarted: z.array(z.int()),
    active: z.array(z.int()),
    done: z.array(z.int()),
  }),
  /** Haftada tamamlanan iş sayısı. */
  throughput: WeeklySchema,
  /** Bug'lar: haftada açılan ve kapanan. */
  bugs: z.object({ opened: WeeklySchema, closed: WeeklySchema }),
  cycle: z.object({
    sample: z.int(),
    leadAvg: z.number().nullable(),
    leadMedian: z.number().nullable(),
    cycleAvg: z.number().nullable(),
    cycleMedian: z.number().nullable(),
    cycleP85: z.number().nullable(),
  }),
});
export type Flow = z.infer<typeof FlowSchema>;

export const FLOW_DEFAULT_DAYS = 30;
export const FLOW_MIN_DAYS = 7;
export const FLOW_MAX_DAYS = 180;
