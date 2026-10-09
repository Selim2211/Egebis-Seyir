import { z } from 'zod';
import { MAX_SPRINT_MOVE_ITEMS, SPRINT_STATUSES } from '../constants/sprint';
import { checkSprintDates } from '../domain/sprint';
import { DateOnlySchema, LabelSchema, WorkItemRowSchema } from './work-item';

const SprintName = z.string().trim().min(1).max(80);
const SprintGoal = z.string().trim().max(500);
const CapacityNote = z.string().trim().max(500);

export const SprintStatusSchema = z.enum(SPRINT_STATUSES);

// ---------- Sprint CRUD ----------

/** POST /api/workspaces/:wid/spaces/:spaceId/sprints */
export const CreateSprintRequestSchema = z
  .object({
    name: SprintName,
    goal: SprintGoal.nullish(),
    startDate: DateOnlySchema,
    endDate: DateOnlySchema,
    capacityNote: CapacityNote.nullish(),
  })
  .superRefine((value, ctx) => {
    const error = checkSprintDates(value.startDate, value.endDate);
    if (error) ctx.addIssue({ code: 'custom', path: ['endDate'], message: error });
  });
export type CreateSprintRequest = z.infer<typeof CreateSprintRequestSchema>;

/** PATCH /api/workspaces/:wid/sprints/:sprintId — planlı sprint'te hepsi, aktifte tarihler hariç. */
export const UpdateSprintRequestSchema = z
  .object({
    name: SprintName,
    goal: SprintGoal.nullable(),
    startDate: DateOnlySchema,
    endDate: DateOnlySchema,
    capacityNote: CapacityNote.nullable(),
  })
  .partial()
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate) {
      const error = checkSprintDates(value.startDate, value.endDate);
      if (error) ctx.addIssue({ code: 'custom', path: ['endDate'], message: error });
    }
  });
export type UpdateSprintRequest = z.infer<typeof UpdateSprintRequestSchema>;

// ---------- Yaşam döngüsü ----------

/** POST /api/workspaces/:wid/sprints/:sprintId/complete — bitmeyen işlerin akıbeti zorunlu seçimdir. */
export const CompleteSprintRequestSchema = z
  .object({
    unfinished: z.enum(['BACKLOG', 'NEXT_SPRINT']),
    nextSprintId: z.uuid().optional(),
  })
  .refine((v) => v.unfinished !== 'NEXT_SPRINT' || v.nextSprintId !== undefined, {
    path: ['nextSprintId'],
    message: 'NEXT_SPRINT_REQUIRED',
  });
export type CompleteSprintRequest = z.infer<typeof CompleteSprintRequestSchema>;

// ---------- Okuma ----------

export const SprintSummarySchema = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  name: z.string(),
  goal: z.string().nullable(),
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  capacityNote: z.string().nullable(),
  status: SprintStatusSchema,
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  itemCount: z.int(),
  points: z.number(),
  doneItemCount: z.int(),
  donePoints: z.number(),
  unestimatedCount: z.int(),
  /** Definition of Ready'ye uymayan Story/Bug sayısı (Space'te DoR maddesi varsa), ADR-065. */
  notReadyCount: z.int(),
  /** Tamamlanırken donmuş velocity (Done puanı); tamamlanmamış sprint'te null. */
  completedPoints: z.number().nullable(),
});
export type SprintSummary = z.infer<typeof SprintSummarySchema>;

/** GET /api/workspaces/:wid/spaces/:spaceId/sprints — en yeni önce. */
export const SprintsResponseSchema = z.object({ sprints: z.array(SprintSummarySchema) });
export type SprintsResponse = z.infer<typeof SprintsResponseSchema>;

/** GET /api/workspaces/:wid/sprints/:sprintId — sprint ve öğeleri (öncelik sırasıyla). */
export const SprintDetailSchema = z.object({
  sprint: SprintSummarySchema,
  items: z.array(WorkItemRowSchema),
});
export type SprintDetail = z.infer<typeof SprintDetailSchema>;

export const BacklogEpicSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  color: z.string().nullable(),
});
export type BacklogEpic = z.infer<typeof BacklogEpicSchema>;

/**
 * GET /api/workspaces/:wid/spaces/:spaceId/backlog — sprint'e atanmamış açık öğeler
 * öncelik sırasıyla (ADR-062), Epic'ler ve açık (planlı/aktif) sprint'ler.
 */
export const BacklogResponseSchema = z.object({
  items: z.array(WorkItemRowSchema),
  epics: z.array(BacklogEpicSchema),
  labels: z.array(LabelSchema),
  sprints: z.array(SprintSummarySchema),
});
export type BacklogResponse = z.infer<typeof BacklogResponseSchema>;

// ---------- Taşıma / sıralama ----------

/**
 * POST /api/workspaces/:wid/spaces/:spaceId/backlog/move
 * `sprintId` hedef kapsayıcıdır (null = Backlog). `afterId` hedefte hangi öğenin arkasına
 * konacağıdır (null = en başa); verilmezse öğeler mevcut öncelik sırasını korur.
 */
export const MoveBacklogItemsRequestSchema = z.object({
  itemIds: z.array(z.uuid()).min(1).max(MAX_SPRINT_MOVE_ITEMS),
  sprintId: z.uuid().nullable(),
  afterId: z.uuid().nullable().optional(),
});
export type MoveBacklogItemsRequest = z.infer<typeof MoveBacklogItemsRequestSchema>;

/**
 * POST /api/workspaces/:wid/items/:itemId/nest — öğeyi başka bir öğenin alt öğesi yapar (ADR-102).
 * Tip kuralı izin vermezse alt öğesiz Task, Sub-task olur; Epic dışı üste geçen öğe sprint/backlog dışına çıkar.
 */
export const NestItemRequestSchema = z.object({ parentId: z.uuid() });
export type NestItemRequest = z.infer<typeof NestItemRequestSchema>;

// ---------- Sprint Review (Faz 2.4, ADR-065) ----------

export const SprintScopeChangeSchema = z.object({
  action: z.enum(['ADDED', 'REMOVED']),
  at: z.iso.datetime(),
  points: z.number().nullable(),
  item: z.object({ id: z.uuid(), key: z.string(), title: z.string() }),
});
export type SprintScopeChange = z.infer<typeof SprintScopeChangeSchema>;

/** GET /api/workspaces/:wid/sprints/:sprintId/review */
export const SprintReviewSchema = z.object({
  sprint: SprintSummarySchema,
  /** Done kategorisindeki öğeler. */
  completed: z.array(WorkItemRowSchema),
  /** Bitmeyenler; kapanmış sprint'te çıkış olaylarından, aktifte güncel durumdan. */
  unfinished: z.array(WorkItemRowSchema),
  /** Sprint başladıktan sonra eklenen/çıkarılan öğeler. */
  scopeChanges: z.array(SprintScopeChangeSchema),
  notes: z.string().nullable(),
});
export type SprintReview = z.infer<typeof SprintReviewSchema>;

/** PUT /api/workspaces/:wid/sprints/:sprintId/review-notes */
export const SetReviewNotesRequestSchema = z.object({
  notes: z.string().trim().max(5000).nullable(),
});
export type SetReviewNotesRequest = z.infer<typeof SetReviewNotesRequestSchema>;
