import { z } from 'zod';

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Zaman dilimi: sprint, hafta (Pzt başlangıçlı) ya da ay. */
export const ANALYTICS_GRAINS = ['sprint', 'week', 'month'] as const;
export type AnalyticsGrain = (typeof ANALYTICS_GRAINS)[number];

/** Grafikte çizilebilen ölçütler. */
export const ANALYTICS_METRICS = [
  'done',
  'points',
  'hours',
  'avgDays',
  'onTimePct',
  'bugsFixed',
  'reopened',
] as const;
export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];

/** En çok kıyaslanacak kişi sayısı (ADR-143). */
export const ANALYTICS_COMPARE_MAX = 5;

/**
 * Ortak sorgu. `from`/`to` dahil (Europe/Istanbul takvim günü). Boş bırakılırsa son 90 gün.
 * `spaceId`: tek Proje ile sınırla (kişi/karşılaştırma ekranları için).
 */
export const AnalyticsQuerySchema = z.object({
  from: DateKey.optional(),
  to: DateKey.optional(),
  grain: z.enum(ANALYTICS_GRAINS).default('week'),
  spaceId: z.uuid().optional(),
  /** Virgülle ayrılmış kullanıcı kimlikleri (yalnızca karşılaştırma). */
  userIds: z.string().max(400).optional(),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

/** Bir kişi ya da Proje için, bir zaman aralığındaki ölçütler. */
export const AnalyticsMetricsSchema = z.object({
  /** Tamamlanan Task/Sub-Task/Bug sayısı (birden fazla kişiye atanan iş herkese 1 sayılır). */
  done: z.int(),
  /** Story point; birden fazla kişiye atanan işte puan kişiler arasında bölünür. */
  points: z.number(),
  /** Zaman kayıtlarından harcanan saat. */
  hours: z.number(),
  /** Tamamlanan işlerde açılıştan bitişe ortalama gün; iş yoksa null. */
  avgDays: z.number().nullable(),
  /** Termini olan ve tamamlanan işlerde, terminde ya da önce bitenlerin yüzdesi; yoksa null. */
  onTimePct: z.int().nullable(),
  bugsFixed: z.int(),
  /** Tamamlandıktan sonra yeniden açılan iş. */
  reopened: z.int(),
  /** Tamamlanan işlerin tahmini saati (kişi payı); tahmin–gerçekleşen karşılaştırması için. */
  estimateHours: z.number(),
});
export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;

export const AnalyticsPointSchema = AnalyticsMetricsSchema.extend({
  /** Hafta/ay başlangıç günü ya da sprint kimliği (`none` = sprint dışı). */
  key: z.string(),
  label: z.string(),
  from: DateKey.nullable(),
});
export type AnalyticsPoint = z.infer<typeof AnalyticsPointSchema>;

const UserRef = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarVersion: z.string().nullable(),
});
const SpaceRef = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  color: z.string(),
});
const RangeSchema = z.object({
  from: DateKey,
  to: DateKey,
  /** Karşılaştırma dönemi: aynı uzunlukta, hemen öncesi. */
  prevFrom: DateKey,
  prevTo: DateKey,
  grain: z.enum(ANALYTICS_GRAINS),
});

/** Kişinin sprintte tamamladığı iş (satıra tıklayınca açılır). */
export const AnalyticsSprintRowSchema = AnalyticsMetricsSchema.extend({
  /** null = sprint dışı işler. */
  sprint: z
    .object({
      id: z.uuid(),
      name: z.string(),
      project: z.string(),
      startDate: DateKey,
      endDate: DateKey,
    })
    .nullable(),
  items: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      title: z.string(),
      type: z.enum(['TASK', 'SUBTASK', 'BUG']),
      points: z.number(),
      completedAt: DateKey,
    }),
  ),
});

/** GET analytics/people — kişi listesi ve sıralama (Owner/Admin). */
export const AnalyticsPeopleSchema = z.object({
  range: RangeSchema,
  people: z.array(
    z.object({ user: UserRef, totals: AnalyticsMetricsSchema, previous: AnalyticsMetricsSchema }),
  ),
});
export type AnalyticsPeople = z.infer<typeof AnalyticsPeopleSchema>;

/** GET analytics/person/:userId */
export const AnalyticsPersonSchema = z.object({
  range: RangeSchema,
  user: UserRef,
  totals: AnalyticsMetricsSchema,
  previous: AnalyticsMetricsSchema,
  series: z.array(AnalyticsPointSchema),
  byProject: z.array(z.object({ space: SpaceRef }).extend(AnalyticsMetricsSchema.shape)),
  bySprint: z.array(AnalyticsSprintRowSchema),
});
export type AnalyticsPerson = z.infer<typeof AnalyticsPersonSchema>;

/** GET analytics/project/:spaceId (Owner/Admin) */
export const AnalyticsProjectSchema = z.object({
  range: RangeSchema,
  space: SpaceRef,
  totals: AnalyticsMetricsSchema,
  previous: AnalyticsMetricsSchema,
  series: z.array(AnalyticsPointSchema.extend({ bugsOpened: z.int() })),
  byPerson: z.array(z.object({ user: UserRef }).extend(AnalyticsMetricsSchema.shape)),
  /** Son 6 tamamlanan sprintin taahhüt ve biten puanı. */
  velocity: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      committed: z.number(),
      completed: z.number(),
      completedAt: DateKey,
    }),
  ),
  byType: z.object({ task: z.int(), subtask: z.int(), bug: z.int() }),
});
export type AnalyticsProject = z.infer<typeof AnalyticsProjectSchema>;

/** GET analytics/compare?userIds=a,b,c (Owner/Admin) */
export const AnalyticsCompareSchema = z.object({
  range: RangeSchema,
  users: z.array(
    z.object({
      user: UserRef,
      totals: AnalyticsMetricsSchema,
      series: z.array(AnalyticsPointSchema),
    }),
  ),
  /** Tüm kişiler için ortak zaman noktaları (grafikte aynı X ekseni). */
  buckets: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type AnalyticsCompare = z.infer<typeof AnalyticsCompareSchema>;

// ---------- Akış ve darboğaz (ADR-144) ----------

/** Açık işin son hareketten beri yaşı: ≤7, 8–14, 15–30, 30 günden eski. */
export const ANALYTICS_FLOW_AGES = ['D7', 'D14', 'D30', 'D30P'] as const;
export type AnalyticsFlowAge = (typeof ANALYTICS_FLOW_AGES)[number];

const DurationStats = z.object({
  avg: z.number(),
  median: z.number(),
  p85: z.number(),
});
const FlowSummary = z.object({
  /** Tamamlanan iş sayısı. */
  done: z.int(),
  /** Bunların kaçının gerçek durum geçişi kaydı var (bitirme süresi yalnızca bunlardan). */
  withHistory: z.int(),
  /** "Üzerinde çalışılmaya başlandı"dan bitişe gün; geçmişi olan iş yoksa null. */
  cycleDays: DurationStats.nullable(),
  /** Açılıştan bitişe gün (tüm tamamlanan işler). */
  leadDays: DurationStats.nullable(),
});

/** GET analytics/flow (Owner/Admin) */
export const AnalyticsFlowSchema = z.object({
  range: RangeSchema,
  totals: FlowSummary,
  previous: FlowSummary,
  /** Tamamlanma zamanına göre noktalar. */
  series: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      from: DateKey.nullable(),
      done: z.int(),
      cycleDays: z.number().nullable(),
      leadDays: z.number().nullable(),
    }),
  ),
  /** Durumlarda ortalama bekleme (gün), en uzundan kısaya; geçmişi kayıtlı tamamlanan işlerden. */
  dwell: z.array(
    z.object({ status: z.string(), category: z.string(), avgDays: z.number(), items: z.int() }),
  ),
  wip: z.object({
    /** Şu an "Yapılıyor" kategorisindeki açık iş (kesin). */
    current: z.int(),
    /** Seçili aralıkta günlük ortalama (yalnızca durum geçişi kayıtlı işlerden). */
    average: z.number().nullable(),
    series: z.array(z.object({ day: DateKey, count: z.int() })),
    /** Geçmiş serisi kaç işe dayanıyor / toplam açık+tamamlanan iş. */
    trackedItems: z.int(),
    totalItems: z.int(),
  }),
  aging: z.object({
    buckets: z.array(z.object({ bucket: z.enum(ANALYTICS_FLOW_AGES), count: z.int() })),
    /** Son hareketi en eski, "Yapılıyor"daki açık işler (en çok 10). */
    stale: z.array(
      z.object({
        id: z.uuid(),
        key: z.string(),
        title: z.string(),
        space: SpaceRef,
        status: z.string(),
        days: z.int(),
        assignee: z.string().nullable(),
      }),
    ),
  }),
});
export type AnalyticsFlow = z.infer<typeof AnalyticsFlowSchema>;
