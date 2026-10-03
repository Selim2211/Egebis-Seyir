const DAY_MS = 86_400_000;

/** Bir anı verilen saat diliminde YYYY-MM-DD yerel tarihine çevirir. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface BurndownSnapshotInput {
  date: string;
  remainingPoints: number;
  totalPoints: number;
}

/** Aktif sprint'e sonradan eklenen (+) ya da çıkarılan (−) puan; gün bazında. */
export interface ScopeChangeInput {
  date: string;
  delta: number;
}

export interface BurndownPoint {
  date: string;
  /** Başlangıç puanından bitiş gününde sıfıra inen ideal çizgi. */
  ideal: number;
  /** O gün sonundaki kalan puan; henüz yaşanmamış günlerde null. */
  remaining: number | null;
  /** O gün kapsama giren net puan (scope change). */
  scopeChange: number;
}

export interface Burndown {
  /** Sprint başlarkenki toplam puan. */
  baseline: number;
  points: BurndownPoint[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Sprint Burndown (brief §5.11): her gün için kalan puan ve ideal çizgi.
 * Kalan puan, o güne kadarki en son snapshot'tır (gün atlanırsa bir öncekini taşır).
 * `lastDay` yaşanan son gündür (aktifte bugün, tamamlanmışta bitiş günü); sonrası null kalır.
 * Süre aşılırsa eksen `lastDay`'e kadar uzar, ideal çizgi sıfırda kalır.
 */
export function buildBurndown(input: {
  /** Sprint başlarken taahhüt edilen toplam puan. */
  baseline: number;
  startDate: string;
  endDate: string;
  lastDay: string;
  snapshots: readonly BurndownSnapshotInput[];
  scopeChanges: readonly ScopeChangeInput[];
}): Burndown {
  const snapshots = [...input.snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const { baseline } = input;
  const axisEnd = input.lastDay > input.endDate ? input.lastDay : input.endDate;
  const span = Math.round((Date.parse(input.endDate) - Date.parse(input.startDate)) / DAY_MS);

  const points: BurndownPoint[] = [];
  for (
    let date = input.startDate, index = 0;
    date <= axisEnd;
    date = addDays(date, 1), index += 1
  ) {
    const ideal = index >= span ? 0 : round1(baseline * (1 - index / span));
    let remaining: number | null = null;
    if (date <= input.lastDay) {
      remaining = baseline;
      for (const snapshot of snapshots) {
        if (snapshot.date <= date) remaining = snapshot.remainingPoints;
      }
    }
    const scopeChange = input.scopeChanges
      .filter((c) => c.date === date)
      .reduce((sum, c) => sum + c.delta, 0);
    points.push({ date, ideal, remaining, scopeChange: round1(scopeChange) });
  }
  return { baseline, points };
}

export interface VelocitySprintInput {
  id: string;
  name: string;
  endDate: string;
  completedPoints: number | null;
  /** Başlangıçta taahhüt edilen puan; eski kayıtlarda null. */
  committedPoints: number | null;
}

/** Velocity grafiği: tamamlanmış sprint'ler eskiden yeniye, donmuş puanla (brief §6.1.7). */
export function buildVelocity(
  sprints: readonly VelocitySprintInput[],
  limit: number,
): VelocitySprintInput[] {
  return sprints
    .filter((s) => s.completedPoints !== null)
    .sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0))
    .slice(-limit);
}
