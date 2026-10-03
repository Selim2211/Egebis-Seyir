import { addDays } from './reports';
import { daysBetween } from './timeline';

export interface ScheduleNode {
  id: string;
  /** Hem başlangıç hem bitiş olan işler zincire girer; biri eksikse süre 1 gün sayılır. */
  startDate: string | null;
  dueDate: string | null;
}

/** `from` bitmeden `to` başlayamaz (bitiş–başlangıç bağımlılığı; "from, to'yu bloklar"). */
export interface ScheduleEdge {
  from: string;
  to: string;
}

export interface ScheduleAnalysis {
  /** Bağımlılık grafiğinde döngü var (kritik yol hesaplanamaz). */
  hasCycle: boolean;
  /** En uzun bağımlılık zinciri (gün toplamına göre), sırayla; bağımlılık yoksa boş. */
  criticalPath: string[];
  /** Zincirin toplam süresi, gün. */
  criticalDays: number;
  /** Ardıl iş, öncülü bitmeden başlıyor: planlama çakışması. */
  violations: ScheduleEdge[];
}

/** İşin süresi, gün (bitiş dahil); tarih eksikse 1. */
export function durationDays(node: ScheduleNode): number {
  if (node.startDate === null || node.dueDate === null) return 1;
  return Math.max(1, daysBetween(node.startDate, node.dueDate) + 1);
}

/**
 * Zamanlama çözümlemesi (ADR-077): bağımlılık zincirleri üzerinde kritik yol ve çakışmalar.
 * Kritik yol, kenarlar boyunca süre toplamı en büyük yoldur (CPM'nin çizelge tarihlerinden
 * bağımsız basit hâli). Yalnızca grafikte bulunan düğümler (`nodes`) ve iki ucu da bilinen
 * kenarlar sayılır. Döngü varsa `hasCycle` olur ve kritik yol boş döner.
 */
export function analyzeSchedule(
  nodes: readonly ScheduleNode[],
  edges: readonly ScheduleEdge[],
): ScheduleAnalysis {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = edges.filter((e) => e.from !== e.to && byId.has(e.from) && byId.has(e.to));

  const violations = valid.filter((e) => {
    const before = byId.get(e.from)!;
    const after = byId.get(e.to)!;
    const finish = before.dueDate ?? before.startDate;
    const start = after.startDate ?? after.dueDate;
    return finish !== null && start !== null && start <= finish;
  });

  // Kahn sırası + en uzun yol (DP).
  const incoming = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const e of valid) {
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }
  const queue = nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  const best = new Map<string, number>();
  const previous = new Map<string, string>();
  for (const n of nodes) best.set(n.id, durationDays(n));
  let processed = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i]!;
    processed += 1;
    for (const next of outgoing.get(id) ?? []) {
      const candidate = best.get(id)! + durationDays(byId.get(next)!);
      if (candidate > best.get(next)!) {
        best.set(next, candidate);
        previous.set(next, id);
      }
      incoming.set(next, incoming.get(next)! - 1);
      if (incoming.get(next) === 0) queue.push(next);
    }
  }
  if (processed < nodes.length) {
    return { hasCycle: true, criticalPath: [], criticalDays: 0, violations };
  }

  const linked = new Set(valid.flatMap((e) => [e.from, e.to]));
  let end: string | null = null;
  for (const id of linked) {
    if (end === null || best.get(id)! > best.get(end)!) end = id;
  }
  if (end === null) return { hasCycle: false, criticalPath: [], criticalDays: 0, violations };

  const path = [end];
  while (previous.has(path[0]!)) path.unshift(previous.get(path[0]!)!);
  return { hasCycle: false, criticalPath: path, criticalDays: best.get(end)!, violations };
}

/** `shiftDays` kadar kaydırılmış tarihler; boş tarih boş kalır. */
export function shiftSpan(
  span: { startDate: string | null; dueDate: string | null },
  shiftDays: number,
): { startDate: string | null; dueDate: string | null } {
  return {
    startDate: span.startDate === null ? null : addDays(span.startDate, shiftDays),
    dueDate: span.dueDate === null ? null : addDays(span.dueDate, shiftDays),
  };
}
