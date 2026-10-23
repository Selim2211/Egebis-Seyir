import { z } from 'zod';
import { BUG_SEVERITIES, BUG_STATUSES, PRIORITIES } from '../constants/work-item';

const Person = z.object({ id: z.uuid(), name: z.string(), avatarVersion: z.string().nullable() });

/** Bug ekranı satırı (ADR-117). */
export const BugSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  listId: z.uuid(),
  bugStatus: z.enum(BUG_STATUSES),
  severity: z.enum(BUG_SEVERITIES).nullable(),
  priority: z.enum(PRIORITIES),
  reporter: Person.nullable(),
  assignee: Person.nullable(),
  environment: z.string().nullable(),
  /** E-postadan açıldıysa gönderen (ADR-138). */
  fromEmail: z.object({ name: z.string(), email: z.string() }).nullable(),
  /** Task'a çevrildiyse çevrilen Task anahtarları. */
  convertedTo: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Bug = z.infer<typeof BugSchema>;

/** GET /api/workspaces/:wid/spaces/:spaceId/bugs */
export const BugsResponseSchema = z.object({ bugs: z.array(BugSchema) });
export type BugsResponse = z.infer<typeof BugsResponseSchema>;

const Text = z.string().trim().max(5000).nullable().optional();

/** POST /api/workspaces/:wid/spaces/:spaceId/bugs — Bug açar; açan kişi Bug sahibidir. */
export const CreateBugRequestSchema = z.object({
  title: z.string().trim().min(1).max(500),
  listId: z.uuid().optional(),
  severity: z.enum(BUG_SEVERITIES).default('MAJOR'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  stepsToReproduce: Text,
  expectedResult: Text,
  actualResult: Text,
  environment: z.string().trim().max(500).nullable().optional(),
});
export type CreateBugRequest = z.input<typeof CreateBugRequestSchema>;

/** PUT .../items/:itemId/bug-assignee — Bug'ı birine atar (null = atamayı kaldır). */
export const SetBugAssigneeRequestSchema = z.object({ userId: z.uuid().nullable() });
export type SetBugAssigneeRequest = z.infer<typeof SetBugAssigneeRequestSchema>;

/** PUT .../items/:itemId/bug-status */
export const SetBugStatusRequestSchema = z.object({ status: z.enum(BUG_STATUSES) });
export type SetBugStatusRequest = z.infer<typeof SetBugStatusRequestSchema>;
