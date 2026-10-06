import { z } from 'zod';
import { DateOnlySchema, WorkItemTypeSchema } from './work-item';

export const GOAL_KINDS = ['TASKS', 'NUMBER'] as const;
export const MAX_GOALS_PER_WORKSPACE = 200;
export const MAX_ITEMS_PER_GOAL = 200;

const Name = z.string().trim().min(1).max(120);
const Description = z.string().trim().max(1000).nullable();
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const num = z.number().finite().min(-1e12).max(1e12);

/** POST /api/workspaces/:wid/goals */
export const CreateGoalRequestSchema = z
  .object({
    name: Name,
    description: Description.default(null),
    color: Color.default('#7C3AED'),
    kind: z.enum(GOAL_KINDS),
    dueDate: DateOnlySchema.nullable().default(null),
    ownerId: z.uuid().nullable().default(null),
    startValue: num.nullable().default(null),
    targetValue: num.nullable().default(null),
    unit: z.string().trim().max(20).nullable().default(null),
  })
  .refine((v) => v.kind === 'TASKS' || (v.startValue !== null && v.targetValue !== null), {
    path: ['targetValue'],
    message: 'NUMBER_GOAL_NEEDS_VALUES',
  });
export type CreateGoalRequest = z.input<typeof CreateGoalRequestSchema>;
export type CreateGoalData = z.output<typeof CreateGoalRequestSchema>;

export const UpdateGoalRequestSchema = z
  .object({
    name: Name,
    description: Description,
    color: Color,
    dueDate: DateOnlySchema.nullable(),
    ownerId: z.uuid().nullable(),
    startValue: num,
    currentValue: num,
    targetValue: num,
    unit: z.string().trim().max(20).nullable(),
  })
  .partial();
export type UpdateGoalRequest = z.infer<typeof UpdateGoalRequestSchema>;

export const GoalItemSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  type: WorkItemTypeSchema,
  title: z.string(),
  done: z.boolean(),
});
export type GoalItem = z.infer<typeof GoalItemSchema>;

export const GoalSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string(),
  kind: z.enum(GOAL_KINDS),
  dueDate: DateOnlySchema.nullable(),
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  startValue: z.number().nullable(),
  currentValue: z.number().nullable(),
  targetValue: z.number().nullable(),
  unit: z.string().nullable(),
  /** 0–100; görev bazlı hedefte yalnızca görülebilen görevler sayılır. */
  percent: z.int(),
  /** Görev bazlı hedefte bağlı (görülebilen) görevler. */
  items: z.array(GoalItemSchema),
  /** Görülemeyen Space'lerdeki bağlı görev sayısı (ilerlemeye girmez). */
  hiddenItemCount: z.int(),
});
export type Goal = z.infer<typeof GoalSchema>;

export const GoalsResponseSchema = z.object({ goals: z.array(GoalSchema) });
export type GoalsResponse = z.infer<typeof GoalsResponseSchema>;
