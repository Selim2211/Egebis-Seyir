import { z } from 'zod';
import { BUG_SEVERITIES } from '../constants/work-item';

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ADMIN_AGE_BUCKETS = ['D1', 'D3', 'D7', 'D7P'] as const;
export type AdminAgeBucket = (typeof ADMIN_AGE_BUCKETS)[number];

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
  /** E-postadan gelen Bug'larda ilk insan yanıtına (giden kutusundan) kadar geçen ortalama süre (saat); yoksa null. */
  avgFirstResponseHours: z.number().nullable(),
  /** E-postadan gelip henüz insan yanıtı verilmemiş açık Bug'lar. */
  awaitingReply: z.int(),
  /** En eski açık Bug. */
  oldestOpen: z
    .object({ id: z.uuid(), key: z.string(), title: z.string(), ageDays: z.int() })
    .nullable(),
  /** Açık Bug'ların yaşı: ≤1 gün, 1–3 gün, 3–7 gün, 7 günden eski. */
  aging: z.array(z.object({ bucket: z.enum(ADMIN_AGE_BUCKETS), count: z.int() })),
  /** E-postadan gelen Bug'ların atanma yöntemi. */
  routing: z.object({ rule: z.int(), company: z.int(), ai: z.int(), unrouted: z.int() }),
  /** Firma bazlı Bug sayıları (en çok Bug gönderen 8 firma) ve firması bilinmeyenler. */
  byCompany: z.array(
    z.object({ id: z.uuid(), name: z.string(), total: z.int(), open: z.int(), resolved: z.int() }),
  ),
  noCompany: z.int(),
});

/** Yönetici paneli listelerinin süzgeçleri (kutucuğa tıklanınca açılır). */
export const ADMIN_LIST_KINDS = [
  'open-work',
  'overdue',
  'completed-week',
  'unassigned-work',
  'bugs-all',
  'bugs-open',
  'bugs-new-today',
  'bugs-new-week',
  'bugs-resolved-today',
  'bugs-resolved-week',
  'bugs-unassigned',
  'bugs-inbox',
  'bugs-awaiting',
  'bugs-email',
  'bugs-manual',
  /** `value`: önem derecesi. */
  'bugs-severity',
  /** `value`: firma kimliği ya da `none`. */
  'bugs-company',
  /** `value`: yaş kovası. */
  'bugs-age',
  /** `value`: rule | company | ai | none. */
  'bugs-route',
  /** `value`: kullanıcı kimliği (üzerindeki açık işler). */
  'person',
  /** `value`: Proje kimliği (açık işler). */
  'project',
] as const;
export type AdminListKind = (typeof ADMIN_LIST_KINDS)[number];

export const ADMIN_LIST_PAGE_SIZE = 25;

export const AdminListQuerySchema = z.object({
  kind: z.enum(ADMIN_LIST_KINDS),
  value: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AdminListQuery = z.infer<typeof AdminListQuerySchema>;

export const AdminListItemSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  type: z.enum(['TASK', 'BUG']),
  space: z.object({ id: z.uuid(), name: z.string(), color: z.string(), inbox: z.boolean() }),
  status: z.object({ name: z.string(), category: z.string() }),
  severity: z.enum(BUG_SEVERITIES).nullable(),
  dueDate: DateKey.nullable(),
  createdAt: z.iso.datetime(),
  assignees: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** E-postadan geldiyse firma. */
  company: z.string().nullable(),
});
export type AdminListItem = z.infer<typeof AdminListItemSchema>;

/** GET /api/workspaces/:wid/admin/list?kind=&value=&page= */
export const AdminListResponseSchema = z.object({
  items: z.array(AdminListItemSchema),
  total: z.int(),
  page: z.int(),
  pageSize: z.int(),
  pages: z.int(),
  /** Süzgeç değeri bir firma/kişi/Proje ise adı (başlık için). */
  valueLabel: z.string().nullable(),
});
export type AdminListResponse = z.infer<typeof AdminListResponseSchema>;

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
  /** Son 30 günde bitirdiği iş (Task/Bug). */
  completed30: z.int(),
});

/** Son tamamlanan sprintlerin taahhüt edilen ve biten puanı (hız / velocity). */
export const AdminVelocitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  project: z.string(),
  committed: z.number(),
  completed: z.number(),
  completedAt: DateKey,
});

/** GET /api/workspaces/:wid/admin/overview — yöneticinin tek bakışta gördüğü veriler (ADR-139). */
/** Yönetici paneli "Bugün" sütunu (ADR-150): bugün açılan Bug'lar ve biten Task/Bug'lar, yeniden eskiye. */
export const AdminTodayEventSchema = z.object({
  kind: z.enum(['opened', 'completed']),
  at: z.iso.datetime(),
  key: z.string(),
  title: z.string(),
  type: z.enum(['TASK', 'BUG']),
  severity: z.enum(BUG_SEVERITIES).nullable(),
  /** Açılan Bug'da bildiren, bitende ilk atanan kişi. */
  user: z
    .object({ id: z.uuid(), name: z.string(), avatarVersion: z.string().nullable() })
    .nullable(),
});
export type AdminTodayEvent = z.infer<typeof AdminTodayEventSchema>;

export const AdminOverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  totals: z.object({
    projects: z.int(),
    members: z.int(),
    openItems: z.int(),
    overdueItems: z.int(),
    completedThisWeek: z.int(),
    /** Açık Task/Bug'lar içinde kimseye atanmamış olanlar. */
    unassignedOpen: z.int(),
    /** Açık işi olmayan üyeler. */
    idleMembers: z.int(),
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
  /** Son 6 tamamlanan sprint (eskiden yeniye). */
  velocity: z.array(AdminVelocitySchema),
  /** Bugün (Europe/Istanbul) olanlar; en çok 20. */
  today: z.array(AdminTodayEventSchema),
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;
export type AdminProject = z.infer<typeof AdminProjectSchema>;
