import { z } from 'zod';
import { MAX_ENTRY_MINUTES, MAX_TIME_NOTE, TIME_SOURCES } from '../constants/time';
import { DateOnlySchema } from './work-item';

export const TimeSourceSchema = z.enum(TIME_SOURCES);

export const TimeEntrySchema = z.object({
  id: z.uuid(),
  user: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  day: DateOnlySchema,
  minutes: z.int(),
  note: z.string().nullable(),
  source: TimeSourceSchema,
  canDelete: z.boolean(),
});
export type TimeEntry = z.infer<typeof TimeEntrySchema>;

/** Çalışan sayaç (kullanıcı başına en çok bir tane). */
export const RunningTimerSchema = z.object({
  itemId: z.uuid(),
  itemKey: z.string(),
  itemTitle: z.string(),
  startedAt: z.iso.datetime(),
});
export type RunningTimer = z.infer<typeof RunningTimerSchema>;

/** GET /api/workspaces/:wid/items/:itemId/time */
export const ItemTimeSchema = z.object({
  entries: z.array(TimeEntrySchema),
  /** Bu öğeye girilen toplam dakika. */
  ownMinutes: z.int(),
  /** Bu öğe ve tüm alt öğelerine girilen toplam dakika. */
  totalMinutes: z.int(),
  /** Öğenin saat tahmini (Task/Sub-task); yoksa null. */
  estimateHours: z.number().nullable(),
  /** Sayaç bu öğede çalışıyorsa başlangıcı. */
  myTimerStartedAt: z.iso.datetime().nullable(),
  canLog: z.boolean(),
});
export type ItemTime = z.infer<typeof ItemTimeSchema>;

/** POST /api/workspaces/:wid/items/:itemId/time */
export const LogTimeRequestSchema = z.object({
  day: DateOnlySchema,
  minutes: z.int().min(1).max(MAX_ENTRY_MINUTES),
  note: z.string().trim().max(MAX_TIME_NOTE).nullish(),
});
export type LogTimeRequest = z.infer<typeof LogTimeRequestSchema>;

/** GET /api/workspaces/:wid/timer */
export const MyTimerSchema = z.object({ timer: RunningTimerSchema.nullable() });
export type MyTimer = z.infer<typeof MyTimerSchema>;

/** GET /api/workspaces/:wid/spaces/:spaceId/timesheet?from=&to= */
export const TimesheetSchema = z.object({
  from: DateOnlySchema,
  to: DateOnlySchema,
  days: z.array(DateOnlySchema),
  rows: z.array(
    z.object({
      user: z.object({ id: z.uuid(), name: z.string() }),
      perDay: z.array(z.int()),
      total: z.int(),
    }),
  ),
  dayTotals: z.array(z.int()),
  total: z.int(),
  /** En çok süre harcanan öğeler. */
  topItems: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      minutes: z.int(),
      estimateHours: z.number().nullable(),
    }),
  ),
});
export type Timesheet = z.infer<typeof TimesheetSchema>;
