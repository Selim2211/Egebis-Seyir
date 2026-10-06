import { z } from 'zod';

export const REMINDER_NOTE_MAX = 200;
/** Bir görevde kişi başına bekleyen (gönderilmemiş) en çok hatırlatıcı. */
export const REMINDERS_PER_ITEM = 10;
/** Hatırlatıcı en çok bu kadar ileriye kurulabilir. */
export const REMINDER_MAX_DAYS_AHEAD = 366;

/** POST /api/workspaces/:wid/items/:itemId/reminders */
export const CreateReminderRequestSchema = z.object({
  remindAt: z.iso.datetime(),
  note: z.string().trim().max(REMINDER_NOTE_MAX).nullable().default(null),
});
export type CreateReminderRequest = z.input<typeof CreateReminderRequestSchema>;

export const ReminderSchema = z.object({
  id: z.uuid(),
  remindAt: z.iso.datetime(),
  note: z.string().nullable(),
  sent: z.boolean(),
});
export type Reminder = z.infer<typeof ReminderSchema>;

/** Yalnızca isteği yapan kullanıcının bu görevdeki hatırlatıcıları. */
export const RemindersResponseSchema = z.object({ reminders: z.array(ReminderSchema) });
export type RemindersResponse = z.infer<typeof RemindersResponseSchema>;
