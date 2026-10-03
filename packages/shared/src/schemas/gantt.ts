import { z } from 'zod';
import { STATUS_CATEGORIES } from '../constants/work-item';
import { DateOnlySchema, WorkItemTypeSchema } from './work-item';

export const GanttItemSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  type: WorkItemTypeSchema,
  title: z.string(),
  parentId: z.uuid().nullable(),
  startDate: DateOnlySchema.nullable(),
  dueDate: DateOnlySchema.nullable(),
  category: z.enum(STATUS_CATEGORIES),
  /** Bar dolgusu (0–100): Epic'te alt öğe ilerlemesi, diğerlerinde Done ise 100. */
  progress: z.int(),
  color: z.string().nullable(),
});
export type GanttItem = z.infer<typeof GanttItemSchema>;

/** GET /api/workspaces/:wid/spaces/:spaceId/gantt */
export const GanttSchema = z.object({
  items: z.array(GanttItemSchema),
  /** `from` bitmeden `to` başlayamaz ("from, to'yu bloklar"). */
  dependencies: z.array(z.object({ from: z.uuid(), to: z.uuid() })),
  /** En uzun bağımlılık zinciri (kritik yol), sırayla. */
  criticalPath: z.array(z.uuid()),
  criticalDays: z.int(),
  hasCycle: z.boolean(),
  /** Öncülü bitmeden başlayan ardıllar. */
  violations: z.array(z.object({ from: z.uuid(), to: z.uuid() })),
  canEdit: z.boolean(),
});
export type Gantt = z.infer<typeof GanttSchema>;
