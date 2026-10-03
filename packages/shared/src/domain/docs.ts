import { DOC_MAX_DEPTH, DOC_VERSION_WINDOW_MS } from '../constants/doc';

export interface DocNode {
  id: string;
  parentId: string | null;
}

/** `candidateId`, `ancestorId` sayfasının (kendisi dahil) alt dalında mı? Taşıma döngüsünü önler. */
export function isInSubtree(
  docs: ReadonlyArray<DocNode>,
  ancestorId: string,
  candidateId: string,
): boolean {
  const parentOf = new Map(docs.map((d) => [d.id, d.parentId]));
  const seen = new Set<string>();
  let current: string | null | undefined = candidateId;
  while (current != null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

/** Sayfanın derinliği (kök = 1). */
export function docDepth(docs: ReadonlyArray<DocNode>, id: string): number {
  const parentOf = new Map(docs.map((d) => [d.id, d.parentId]));
  let depth = 0;
  let current: string | null | undefined = id;
  while (current != null && depth <= DOC_MAX_DEPTH + 1) {
    depth += 1;
    current = parentOf.get(current);
  }
  return depth;
}

/** Bir dalın en derin sayfasının, dalın köküne göre derinliği (yalnız kök = 1). */
export function subtreeHeight(docs: ReadonlyArray<DocNode>, rootId: string): number {
  const children = new Map<string, string[]>();
  for (const doc of docs) {
    if (doc.parentId) children.set(doc.parentId, [...(children.get(doc.parentId) ?? []), doc.id]);
  }
  const height = (id: string, guard: number): number =>
    guard > DOC_MAX_DEPTH + 1
      ? guard
      : 1 + Math.max(0, ...(children.get(id) ?? []).map((c) => height(c, guard + 1)));
  return height(rootId, 1);
}

export type MoveCheck = 'OK' | 'CYCLE' | 'TOO_DEEP';

/** `id` sayfasını `newParentId` altına (null = köke) taşımak geçerli mi? */
export function checkDocMove(
  docs: ReadonlyArray<DocNode>,
  id: string,
  newParentId: string | null,
): MoveCheck {
  if (newParentId === null) return 'OK';
  if (isInSubtree(docs, id, newParentId)) return 'CYCLE';
  const depth = docDepth(docs, newParentId) + subtreeHeight(docs, id);
  return depth > DOC_MAX_DEPTH ? 'TOO_DEEP' : 'OK';
}

/**
 * Kayıt yeni bir sürüm satırı mı açsın, yoksa son sürümü mü güncellesin? (ADR-069)
 * Sürüm yoksa, yazar değiştiyse ya da son sürüm eskidiyse yeni sürüm açılır; aynı yazarın
 * art arda kayıtları tek "çalışma oturumu" sürümünde birleşir.
 */
export function startsNewVersion(
  last: { authorId: string | null; createdAt: Date } | null,
  actorId: string,
  now: Date,
): boolean {
  if (!last) return true;
  if (last.authorId !== actorId) return true;
  return now.getTime() - last.createdAt.getTime() > DOC_VERSION_WINDOW_MS;
}
