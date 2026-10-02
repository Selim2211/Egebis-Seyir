import type { LinkType } from '../constants/work-item';
import { ERROR_CODES } from '../errors/codes';

export interface LinkEnds {
  fromId: string;
  toId: string;
  type: LinkType;
}

export type LinkCheck =
  { ok: true; link: LinkEnds } | { ok: false; code: typeof ERROR_CODES.WORK_ITEM_LINK_SELF };

/**
 * Bağlantı uçlarını doğrular ve kayıt biçimine getirir (ADR-050). Kendine bağlanamaz;
 * `RELATES_TO` yönsüzdür, bu yüzden uçlar sıralanarak tek kayıt garanti edilir.
 */
export function canonicalLink(fromId: string, toId: string, type: LinkType): LinkCheck {
  if (fromId === toId) return { ok: false, code: ERROR_CODES.WORK_ITEM_LINK_SELF };
  if (type === 'RELATES_TO' && fromId > toId)
    return { ok: true, link: { fromId: toId, toId: fromId, type } };
  return { ok: true, link: { fromId, toId, type } };
}

/** Bir öğenin gözünden bağlantının adı: BLOCKS'ın ters yönü "blocked by" olur. */
export type LinkRelation = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO' | 'DUPLICATES' | 'DUPLICATED_BY';

export function relationFor(type: LinkType, itemIsFrom: boolean): LinkRelation {
  if (type === 'BLOCKS') return itemIsFrom ? 'BLOCKS' : 'BLOCKED_BY';
  if (type === 'DUPLICATES') return itemIsFrom ? 'DUPLICATES' : 'DUPLICATED_BY';
  return 'RELATES_TO';
}
