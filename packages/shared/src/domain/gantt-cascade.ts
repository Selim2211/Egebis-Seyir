import { shiftSpan, type ScheduleEdge, type ScheduleNode } from './schedule';
import { daysBetween } from './timeline';

export interface CascadeUpdate {
  id: string;
  startDate: string | null;
  dueDate: string | null;
}

/**
 * Gantt'ta bir işi `days` gün kaydırınca bağımlı (ardıl) işleri otomatik kaydırır (Faz 7.2, ADR-100).
 * Kural bitiş-başlangıç: ardıl, öncülün bitişinden sonra başlamalıdır (çakışma ölçütü `schedule.ts` ile
 * aynıdır: başlangıç ≤ öncül bitişi ihlaldir). Yalnızca ihlal edilen ardıllar, ihlali gidermeye yetecek
 * kadar (en az) ileri kaydırılır; zincir ardılın ardıllarına devam eder. Geri çekmede ardıllar yerinde kalır
 * (boşluk bırakmak güvenlidir). Döngü varsa yalnızca taşınan iş döner. Sonuç taşınan işi ilk sırada içerir.
 */
export function cascadeReschedule(
  nodes: readonly ScheduleNode[],
  edges: readonly ScheduleEdge[],
  movedId: string,
  days: number,
): CascadeUpdate[] {
  const byId = new Map(nodes.map((n) => [n.id, { ...n }]));
  const moved = byId.get(movedId);
  if (!moved || days === 0) return [];
  const first = shiftSpan(moved, days);
  moved.startDate = first.startDate;
  moved.dueDate = first.dueDate;
  const updates = new Map<string, CascadeUpdate>([[movedId, { id: movedId, ...first }]]);

  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === e.to || !byId.has(e.from) || !byId.has(e.to)) continue;
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
  }

  // Genişlik öncelikli ilerleme; her düğüm en çok düğüm sayısı kadar kez güncellenebilir (döngü koruması).
  const queue = [movedId];
  const budget = nodes.length * Math.max(1, nodes.length);
  let steps = 0;
  while (queue.length > 0) {
    if (++steps > budget) return [{ id: movedId, ...first }];
    const current = byId.get(queue.shift()!)!;
    const finish = current.dueDate ?? current.startDate;
    if (finish === null) continue;
    for (const nextId of outgoing.get(current.id) ?? []) {
      const next = byId.get(nextId)!;
      const start = next.startDate ?? next.dueDate;
      if (start === null || start > finish) continue;
      // Başlangıç, öncül bitişinden bir gün sonrasına gelecek kadar ileri.
      const shift = daysBetween(start, finish) + 1;
      const moved2 = shiftSpan(next, shift);
      next.startDate = moved2.startDate;
      next.dueDate = moved2.dueDate;
      updates.set(nextId, { id: nextId, ...moved2 });
      queue.push(nextId);
    }
  }
  return [...updates.values()];
}
