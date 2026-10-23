import { z } from 'zod';
import { BUG_SEVERITIES } from '../constants/work-item';

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Yönetici paneli: Bug özeti (ADR-139). "Çözülmüş" = durum kategorisi Tamamlandı. */
export const AdminBugsSchema = z.object({
  total: z.int(),
  open: z.int(),
  resolved: z.int(),
  /** Açık Bug'lar içinde kimseye atanmamış olanlar. */
  openUnassigned: z.int(),
  newToday: z.int(),
  newThisWeek: z.int(),
  resolvedToday: z.int(),
  resolvedThisWeek: z.int(),
  /** Çözülen / toplam, yüzde (toplam 0 ise 0). */
  resolutionRate: z.int(),
  /** Son 30 günde çözülenlerin ortalama çözüm süresi (saat); yoksa null. */
  avgResolutionHours: z.number().nullable(),
  /** Gelen Çağrılar Projesinde, henüz bir Projeye taşınmamış Bug'lar. */
  inboxPending: z.int(),
  openBySeverity: z.array(z.object({ severity: z.enum(BUG_SEVERITIES), count: z.int() })),
  /** Bug'ların kaynağı: e-posta ile gelen / elle açılan. */
  bySource: z.object({ email: z.int(), manual: z.int() }),
  /** Son 14 gün: açılan ve çözülen Bug. */
  daily: z.array(z.object({ date: DateKey, opened: z.int(), resolved: z.int() })),
});

export const AdminSprintSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  startDate: DateKey,
  endDate: DateKey,
  doneItems: z.int(),
  totalItems: z.int(),
  donePoints: z.number(),
  totalPoints: z.number(),
  /** Bitişe kalan gün (bugün dahil); geçmişse 0. */
  daysLeft: z.int(),
  /** Geçen süre yüzdesi (0–100). */
  elapsedPercent: z.int(),
});

export const AdminProjectSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  color: z.string(),
  /** Gelen Çağrılar sistem Projesi. */
  inbox: z.boolean(),
  openItems: z.int(),
  doneItems: z.int(),
  overdueItems: z.int(),
  openBugs: z.int(),
  sprint: AdminSprintSchema.nullable(),
});

export const AdminPersonLoadSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  avatarVersion: z.string().nullable(),
  open: z.int(),
  overdue: z.int(),
});

/** GET /api/workspaces/:wid/admin/overview — yöneticinin tek bakışta gördüğü veriler (ADR-139). */
export const AdminOverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  totals: z.object({
    projects: z.int(),
    members: z.int(),
    openItems: z.int(),
    overdueItems: z.int(),
    completedThisWeek: z.int(),
  }),
  bugs: AdminBugsSchema,
  /** E-postadan gelen çağrılar (ADR-138). */
  tickets: z.object({
    emailsToday: z.int(),
    emailsThisWeek: z.int(),
    repliesThisWeek: z.int(),
  }),
  projects: z.array(AdminProjectSchema),
  /** Son 14 gün: tamamlanan iş (Task/Bug). */
  throughput: z.array(z.object({ date: DateKey, completed: z.int() })),
  workload: z.array(AdminPersonLoadSchema),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;
export type AdminProject = z.infer<typeof AdminProjectSchema>;
