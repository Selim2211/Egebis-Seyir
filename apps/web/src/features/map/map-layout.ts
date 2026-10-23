import type { MapNode } from '@scrum/shared';

export const COLUMN_WIDTH = 340;
export const ROW_HEIGHT = 96;
const ROOT_GAP = 0.6;

export type MapPos = { x: number; y: number };

const TYPE_ORDER: Record<string, number> = { EPIC: 0, TASK: 1, BUG: 2, SUBTASK: 3 };

const keyNumber = (key: string) => Number(key.slice(key.lastIndexOf('-') + 1)) || 0;

/**
 * Otomatik düzen (soldan sağa ağaç): Epic'ler solda, Task'lar ortada, Sub-Task'lar sağda. Her ebeveyn,
 * çocuklarının dikey ortasında durur; kökler arasında küçük bir boşluk kalır. Ebeveyni görünmeyen
 * (süzgeçle gizlenmiş ya da yok) iş kök sayılır.
 */
export function autoLayout(
  nodes: ReadonlyArray<Pick<MapNode, 'id' | 'key' | 'type' | 'parentId'>>,
): Record<string, MapPos> {
  const ids = new Set(nodes.map((n) => n.id));
  const children = new Map<string, (typeof nodes)[number][]>();
  const roots: Array<(typeof nodes)[number]> = [];
  for (const node of nodes) {
    if (node.parentId && ids.has(node.parentId)) {
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
    } else roots.push(node);
  }
  const order = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
    (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || keyNumber(a.key) - keyNumber(b.key);

  const out: Record<string, MapPos> = {};
  let cursor = 0;
  const seen = new Set<string>();
  const place = (node: (typeof nodes)[number], depth: number): number => {
    seen.add(node.id);
    const kids = (children.get(node.id) ?? []).filter((k) => !seen.has(k.id)).sort(order);
    let y: number;
    if (kids.length === 0) {
      y = cursor * ROW_HEIGHT;
      cursor += 1;
    } else {
      const ys = kids.map((k) => place(k, depth + 1));
      y = (ys[0]! + ys[ys.length - 1]!) / 2;
    }
    out[node.id] = { x: depth * COLUMN_WIDTH, y };
    return y;
  };
  for (const root of roots.sort(order)) {
    if (seen.has(root.id)) continue;
    place(root, 0);
    cursor += ROOT_GAP;
  }
  return out;
}
