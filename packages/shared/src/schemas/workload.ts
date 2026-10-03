import { z } from 'zod';

/** GET /api/workspaces/:wid/spaces/:spaceId/workload?sprintId= */
export const WorkloadSchema = z.object({
  /** Süzgeç: belirli sprint ya da tüm açık işler (null). */
  sprint: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  rows: z.array(
    z.object({
      user: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      itemCount: z.int(),
      points: z.number(),
      remainingMinutes: z.int(),
      overdue: z.int(),
      dueSoon: z.int(),
      /** Bu hafta (Pazartesi–Pazar) girilen süre. */
      loggedThisWeekMinutes: z.int(),
    }),
  ),
});
export type Workload = z.infer<typeof WorkloadSchema>;
