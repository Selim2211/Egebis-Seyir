/**
 * Backlog sayfası sürükle-bırak çözümleyicisi (Faz 8.2, ADR-102; ADR-125). Saf fonksiyon: imlecin
 * altındaki hedeften hangi işlemin yapılacağını bulur. Kapsayıcılar Backlog ve açık sprint'lerdir.
 * Bir Task, başka bir Task satırının ortasına bırakılırsa (`nestOn`) onun Sub-Task'ı olur; satırın
 * kenarına ya da boş alana bırakılırsa sprint/sıra değişir. Alt öğeler Ayır alanına bırakılınca ayrılır.
 */

/** Satırın üst ve alt kenarındaki bu oran "araya bırak"tır; ortası "alt öğe yap" (Görevler listesi gibi). */
export const NEST_EDGE_RATIO = 0.25;

/** Sürüklenen öğenin şu an neyin üstünde olduğu: kopyada gösterilir. */
export type BacklogIntent =
  { kind: 'nest'; targetKey: string } | { kind: 'detach' } | { kind: 'move'; label: string } | null;

/**
 * Niyet için küçük dış depo (Görevler listesindekiyle aynı yaklaşım, ADR-123): niyet her satır geçişinde
 * değişir; React durumunda tutulsaydı sayfa ve tüm satırlar yeniden çizilirdi.
 */
export function createIntentStore() {
  let value: BacklogIntent = null;
  const listeners = new Set<() => void>();
  return {
    get: (): BacklogIntent => value,
    set: (next: BacklogIntent): void => {
      if (JSON.stringify(next) === JSON.stringify(value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
export type IntentStore = ReturnType<typeof createIntentStore>;

export const DETACH_ATTR = 'data-detach-zone';

export const BACKLOG_CONTAINER = 'container:backlog';
export const containerId = (sprintId: string | null) =>
  sprintId === null ? BACKLOG_CONTAINER : `container:${sprintId}`;

export interface DropContainer {
  /** null = Backlog. */
  sprintId: string | null;
  itemIds: readonly string[];
}

export type BacklogDrop =
  | { kind: 'move'; itemId: string; sprintId: string | null; afterId: string | null }
  | { kind: 'nest'; itemId: string; parentId: string }
  /** Alt öğe Ayır alanına bırakıldı: bağımsız Task olur, yeri değişmez. */
  | { kind: 'detach'; itemId: string }
  /** Alt öğe üst öğesinden ayrılıp bir kapsayıcıya (sprint/Backlog) bırakıldı. */
  | { kind: 'unnest'; itemId: string; sprintId: string | null; afterId: string | null };

export function resolveBacklogDrop({
  activeId,
  overId,
  nestOn = false,
  containers,
  detach = false,
}: {
  activeId: string;
  overId: string | null;
  /** İmleç `overId` satırının ortasında ve o satır geçerli bir üst öğe (sayfa karar verir). */
  nestOn?: boolean;
  containers: readonly DropContainer[];
  /** Sürüklenen bir alt öğe (kapsayıcılarda satırı yok): bırakılınca üst öğesinden ayrılır. */
  detach?: boolean;
}): BacklogDrop | null {
  if (!overId) return null;
  if (detach) {
    const box = containers.find((c) => containerId(c.sprintId) === overId);
    if (box) {
      return {
        kind: 'unnest',
        itemId: activeId,
        sprintId: box.sprintId,
        afterId: box.itemIds.at(-1) ?? null,
      };
    }
    const host = containers.find((c) => c.itemIds.includes(overId));
    if (!host) return null;
    if (nestOn) return { kind: 'nest', itemId: activeId, parentId: overId };
    const index = host.itemIds.indexOf(overId);
    return {
      kind: 'unnest',
      itemId: activeId,
      sprintId: host.sprintId,
      afterId: host.itemIds[index - 1] ?? null,
    };
  }
  const source = containers.find((c) => c.itemIds.includes(activeId));
  if (!source) return null;

  // Boş alan / kapsayıcı başlığı: hedefin sonuna.
  const byContainer = containers.find((c) => containerId(c.sprintId) === overId);
  if (byContainer) {
    if (byContainer === source) return null;
    const rest = byContainer.itemIds.filter((id) => id !== activeId);
    return {
      kind: 'move',
      itemId: activeId,
      sprintId: byContainer.sprintId,
      afterId: rest.at(-1) ?? null,
    };
  }

  const target = containers.find((c) => c.itemIds.includes(overId));
  if (!target) return null;
  if (overId !== activeId && nestOn) {
    return { kind: 'nest', itemId: activeId, parentId: overId };
  }
  if (overId === activeId) return null;

  if (target === source) {
    // Aynı kapsayıcıda yeniden sıralama: aşağı çekilince hedefin arkasına, yukarı çekilince önüne.
    const from = source.itemIds.indexOf(activeId);
    const to = source.itemIds.indexOf(overId);
    const reordered = [...source.itemIds];
    reordered.splice(from, 1);
    reordered.splice(to, 0, activeId);
    return {
      kind: 'move',
      itemId: activeId,
      sprintId: target.sprintId,
      afterId: reordered[to - 1] ?? null,
    };
  }
  // Başka kapsayıcı: hedef satırın önüne.
  const index = target.itemIds.indexOf(overId);
  return {
    kind: 'move',
    itemId: activeId,
    sprintId: target.sprintId,
    afterId: target.itemIds[index - 1] ?? null,
  };
}
