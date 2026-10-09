/**
 * Backlog sayfası sürükle-bırak çözümleyicisi (Faz 8.2, ADR-102). Saf fonksiyon: dnd-kit olayından
 * hangi işlemin yapılacağını bulur. Kapsayıcılar Backlog ve açık sprint'lerdir; bir satır başka bir
 * satırın üzerine sağa doğru (girinti) bırakılırsa o satırın alt öğesi olur.
 */

/** Sağa bu kadar piksel çekilen öğe "alt öğe yap" olarak yorumlanır (Jira/Linear girinti hissi). */
export const NEST_OFFSET_PX = 48;

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
  | { kind: 'nest'; itemId: string; parentId: string };

export function resolveBacklogDrop({
  activeId,
  overId,
  deltaX,
  containers,
}: {
  activeId: string;
  overId: string | null;
  deltaX: number;
  containers: readonly DropContainer[];
}): BacklogDrop | null {
  if (!overId) return null;
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
  if (overId !== activeId && deltaX >= NEST_OFFSET_PX) {
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
