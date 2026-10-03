import type { DocNodeDto } from '@scrum/shared';

export interface Row {
  doc: DocNodeDto;
  depth: number;
  /** Kardeşler arasındaki konumu ve önceki/sonraki kardeş (yukarı/aşağı taşıma için). */
  prevSibling: DocNodeDto | null;
  prevPrevSibling: DocNodeDto | null;
  nextSibling: DocNodeDto | null;
}

/** API ağaç sırasıyla gelen düz listeyi, derinlik ve kardeş bilgisiyle satırlara çevirir. */
export function buildRows(docs: readonly DocNodeDto[]): Row[] {
  const byParent = new Map<string | null, DocNodeDto[]>();
  for (const doc of docs) {
    byParent.set(doc.parentId, [...(byParent.get(doc.parentId) ?? []), doc]);
  }
  const depthOf = (doc: DocNodeDto): number => {
    let depth = 0;
    let current: DocNodeDto | undefined = doc;
    while (current?.parentId && depth < 10) {
      depth += 1;
      current = docs.find((d) => d.id === current!.parentId);
    }
    return depth;
  };
  return docs.map((doc) => {
    const siblings = byParent.get(doc.parentId) ?? [];
    const index = siblings.findIndex((s) => s.id === doc.id);
    return {
      doc,
      depth: depthOf(doc),
      prevSibling: siblings[index - 1] ?? null,
      prevPrevSibling: siblings[index - 2] ?? null,
      nextSibling: siblings[index + 1] ?? null,
    };
  });
}
