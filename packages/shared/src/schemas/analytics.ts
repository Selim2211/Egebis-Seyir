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

// ---------- Sprint derinliği (ADR-145) ----------

const SprintStatus = z.enum(['ACTIVE', 'COMPLETED']);

/** Bir sprintin taahhüt, biten, kapsam değişimi ve devir ölçütleri. */
export const AnalyticsSprintSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  project: SpaceRef.pick({ id: true, name: true, color: true }),
  status: SprintStatus,
  startDate: DateKey,
  endDate: DateKey,
  /** Başlatılırken taahhüt edilen puan. */
  committed: z.number(),
  /** Tamamlanan sprintte donmuş değer; aktifte şu ana kadar biten puan. */
  completed: z.number(),
  doneItems: z.int(),
  /** Başlangıçtan sonra eklenen / çıkarılan puan (kapsam değişimi). */
  scopeAdded: z.number(),
  scopeRemoved: z.number(),
  /** Sprint kapanırken bitmediği için çıkan iş (sonraki sprinte ya da Backlog'a devredilen). */
  carryOverItems: z.int(),
  carryOverPoints: z.number(),
  /** Önceki sprintten devralınan iş. */
  carriedInItems: z.int(),
  carriedInPoints: z.number(),
  /** Biten / taahhüt (%); taahhüt yoksa null. */
  commitmentPct: z.int().nullable(),
  /** (eklenen + çıkarılan) / taahhüt (%). */
  scopeChangePct: z.int().nullable(),
  /** Devir / (biten + devir) puan (%). */
  carryOverPct: z.int().nullable(),
});
export type AnalyticsSprintSummary = z.infer<typeof AnalyticsSprintSummarySchema>;

/** GET analytics/sprints (Owner/Admin): aralıkla kesişen aktif ve tamamlanmış sprintler. */
export const AnalyticsSprintsSchema = z.object({
  range: RangeSchema,
  /** Tamamlanan sprintlerin ortalamaları; hiç yoksa null. */
  summary: z.object({
    completedCount: z.int(),
    avgVelocity: z.number().nullable(),
    avgCommitmentPct: z.int().nullable(),
    avgScopeChangePct: z.int().nullable(),
    avgCarryOverPct: z.int().nullable(),
  }),
  /** Eskiden yeniye. */
  sprints: z.array(AnalyticsSprintSummarySchema),
});
export type AnalyticsSprints = z.infer<typeof AnalyticsSprintsSchema>;

// ---------- İş yükü ve kapasite (ADR-146) ----------

export const ANALYTICS_DEFAULT_WEEKLY_HOURS = 40;
export const ANALYTICS_CAPACITY_STATUSES = ['over', 'ok', 'idle'] as const;
export type AnalyticsCapacityStatus = (typeof ANALYTICS_CAPACITY_STATUSES)[number];

/** Kapasite sorgusu: ortak süzgeçlere ek olarak haftalık çalışma saati (varsayılan 40). */
export const AnalyticsCapacityQuerySchema = AnalyticsQuerySchema.extend({
  weeklyHours: z.coerce.number().int().min(1).max(80).default(ANALYTICS_DEFAULT_WEEKLY_HOURS),
});
export type AnalyticsCapacityQuery = z.infer<typeof AnalyticsCapacityQuerySchema>;

/** GET analytics/capacity (Owner/Admin) */
export const AnalyticsCapacitySchema = z.object({
  range: RangeSchema,
  weeklyHours: z.int(),
  /** Aralıktaki hafta içi gün sayısı (Pzt–Cum). */
  workdays: z.int(),
  team: z.object({
    capacityHours: z.number(),
    loggedHours: z.number(),
    utilizationPct: z.int().nullable(),
    openItems: z.int(),
    remainingHours: z.number(),
    overloaded: z.int(),
    idle: z.int(),
    /** Ortalama zaman kaydı girilen gün oranı (%). */
    avgLoggingPct: z.int().nullable(),
  }),
  people: z.array(
    z.object({
      user: UserRef,
      /** over: kalan tahmin > 2 haftalık kapasite · idle: açık işi yok · ok: diğerleri. */
      status: z.enum(ANALYTICS_CAPACITY_STATUSES),
      open: z.object({
        items: z.int(),
        points: z.number(),
        overdue: z.int(),
        /** Açık işlerin tahmini saati (çoklu atamada pay bölünür). */
        remainingHours: z.number(),
        /** Tahmini olmayan açık iş sayısı (kalan saate dahil değil). */
        unestimated: z.int(),
      }),
      logged: z.object({
        hours: z.number(),
        utilizationPct: z.int().nullable(),
        /** Hafta içi zaman kaydı girilen gün sayısı ve oranı (%). */
        loggingDays: z.int(),
        loggingPct: z.int().nullable(),
        avgPerLoggedDay: z.number().nullable(),
      }),
      /** Haftanın günlerine göre toplam saat; 0 = Pazartesi … 6 = Pazar. */
      byWeekday: z.array(z.number()).length(7),
      /** Saat girilen günler (ısı haritası); aralık 183 günden uzunsa son 183 gün. */
      days: z.array(z.object({ day: DateKey, hours: z.number() })),
    }),
  ),
  /** Ekip toplamı: hafta başına kaydedilen saat ve kapasite. */
  weekly: z.array(z.object({ weekStart: DateKey, hours: z.number(), capacityHours: z.number() })),
});
export type AnalyticsCapacity = z.infer<typeof AnalyticsCapacitySchema>;

// ---------- Kalite ve destek (ADR-147) ----------

export const ANALYTICS_ROUTE_METHODS = ['rule', 'company', 'ai', 'unrouted'] as const;
export type AnalyticsRouteMethod = (typeof ANALYTICS_ROUTE_METHODS)[number];

const BugSeverityEnum = z.enum(['CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL']);
const QualitySummary = z.object({
  /** Aralıkta açılan, çözülen Bug. */
  opened: z.int(),
  resolved: z.int(),
  /** Çözülenlerde açılıştan çözüme gün; yoksa null. */
  avgResolveDays: z.number().nullable(),
});

/** GET analytics/quality (Owner/Admin) */
export const AnalyticsQualitySchema = z.object({
  range: RangeSchema,
  totals: QualitySummary.extend({
    /** Şu an açık Bug. */
    openNow: z.int(),
    medianResolveDays: z.number().nullable(),
    /** Aralıkta açılan Bug'ların, açılan tüm işler (Task/Sub-Task/Bug) içindeki payı (%). */
    bugSharePct: z.int().nullable(),
  }),
  previous: QualitySummary,
  series: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      from: DateKey.nullable(),
      opened: z.int(),
      resolved: z.int(),
      avgResolveDays: z.number().nullable(),
    }),
  ),
  bySeverity: z.array(
    z.object({
      severity: BugSeverityEnum,
      opened: z.int(),
      resolved: z.int(),
      avgResolveDays: z.number().nullable(),
      openNow: z.int(),
      /** Açık Bug'lar içinde en eskisinin yaşı (gün); yoksa null. */
      oldestOpenDays: z.int().nullable(),
    }),
  ),
  byProject: z.array(
    z.object({
      space: SpaceRef,
      opened: z.int(),
      resolved: z.int(),
      openNow: z.int(),
      avgResolveDays: z.number().nullable(),
      /** Projede açılan işlerin yüzde kaçı Bug. */
      bugSharePct: z.int().nullable(),
    }),
  ),
  /** E-postadan gelen Bug'ların firma kırılımı (en çok Bug gönderen 8 firma). */
  byCompany: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      bugs: z.int(),
      resolved: z.int(),
      openNow: z.int(),
      avgResolveDays: z.number().nullable(),
      /** E-postaya ilk insan yanıtına saat; yanıt yoksa null. */
      avgFirstResponseHours: z.number().nullable(),
    }),
  ),
  /** Atama yöntemine göre: kaç Bug sonradan başka projeye taşındı. */
  routing: z.array(
    z.object({
      method: z.enum(ANALYTICS_ROUTE_METHODS),
      bugs: z.int(),
      moved: z.int(),
      /** unrouted için taşınma beklenen adımdır (elle atama); diğerlerinde yanlış atama sinyalidir. */
      movedPct: z.int().nullable(),
    }),
  ),
  /** Açık Kritik/Önemli Bug'lardan en eski 10. */
  critical: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      title: z.string(),
      severity: BugSeverityEnum,
      space: SpaceRef,
      days: z.int(),
      assignee: z.string().nullable(),
    }),
  ),
});
export type AnalyticsQuality = z.infer<typeof AnalyticsQualitySchema>;

// ---------- Öngörü ve risk (ADR-148) ----------

export const ANALYTICS_RISK_KINDS = [
  'sprint_behind',
  'critical_waiting',
  'person_slowing',
  'project_slowing',
  'stuck_items',
  'unassigned_bugs',
] as const;
export type AnalyticsRiskKind = (typeof ANALYTICS_RISK_KINDS)[number];
export const ANALYTICS_RISK_LEVELS = ['high', 'medium', 'low'] as const;
export type AnalyticsRiskLevel = (typeof ANALYTICS_RISK_LEVELS)[number];
export const ANALYTICS_SPRINT_STATES = ['ahead', 'on_track', 'at_risk', 'behind'] as const;
export type AnalyticsSprintState = (typeof ANALYTICS_SPRINT_STATES)[number];

/** Bir uyarı: metni arayüz kendi dilinde `kind` + sayılardan kurar. Kişileri etiketlemez, değişimi söyler. */
export const AnalyticsRiskSchema = z.object({
  id: z.string(),
  kind: z.enum(ANALYTICS_RISK_KINDS),
  level: z.enum(ANALYTICS_RISK_LEVELS),
  /** Kişi, Proje, sprint ya da iş adı. */
  subject: z.string(),
  /** Anlamı türe göre: gün, adet ya da bu/önceki dönem değeri. */
  value: z.number(),
  previous: z.number().nullable(),
  link: z
    .object({
      kind: z.enum(['item', 'person', 'project', 'sprint']),
      /** `item` için iş anahtarı (MOB-12), diğerleri için kimlik. */
      id: z.string(),
    })
    .nullable(),
});
export type AnalyticsRisk = z.infer<typeof AnalyticsRiskSchema>;

/** GET analytics/forecast (Owner/Admin) */
export const AnalyticsForecastSchema = z.object({
  generatedAt: z.iso.datetime(),
  /** Aktif sprintlerin mevcut hızla tahmini. */
  sprints: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      project: SpaceRef.pick({ id: true, name: true, color: true }),
      startDate: DateKey,
      endDate: DateKey,
      daysLeft: z.int(),
      /** Sprintteki toplam, biten ve kalan puan (şu an). */
      totalPoints: z.number(),
      donePoints: z.number(),
      remainingPoints: z.number(),
      /** Başlangıçtan beri günlük biten puan. */
      ratePerDay: z.number(),
      /** Bu hızla bitiş gününde biten puan ve toplama oranı (%). */
      projectedDone: z.number(),
      projectedPct: z.int().nullable(),
      /** Kalan işin bu hızla biteceği gün; hız sıfırsa ya da kalan yoksa null. */
      projectedFinish: DateKey.nullable(),
      state: z.enum(ANALYTICS_SPRINT_STATES),
    }),
  ),
  /** Açık Epic'lerin kalan puanı ve Projenin son 4 haftalık hızıyla tahmini bitiş. */
  epics: z.array(
    z.object({
      id: z.uuid(),
      key: z.string(),
      title: z.string(),
      project: SpaceRef.pick({ id: true, name: true, color: true }),
      totalPoints: z.number(),
      donePoints: z.number(),
      remainingPoints: z.number(),
      openItems: z.int(),
      /** Projenin son 28 günde haftalık ortalama biten puanı. */
      ratePerWeek: z.number(),
      weeksLeft: z.number().nullable(),
      projectedFinish: DateKey.nullable(),
    }),
  ),
  risks: z.array(AnalyticsRiskSchema),
});
export type AnalyticsForecast = z.infer<typeof AnalyticsForecastSchema>;
