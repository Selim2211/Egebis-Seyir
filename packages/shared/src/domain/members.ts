import { ERROR_CODES } from '../errors/codes';
import type { WorkspaceRole } from '../permissions/roles';

export type MemberChangeResult =
  { ok: true } | { ok: false; code: typeof ERROR_CODES.OWNER_ONLY | typeof ERROR_CODES.LAST_OWNER };

/**
 * Bir üyenin rolünü değiştirme / üyeyi çıkarma kuralı (brief §7.1).
 * Yetki (workspace.members.manage) guard tarafından ayrıca kontrol edilir; bu fonksiyon
 * Owner'ı koruyan ek kuralları uygular:
 * - Owner rolünü yalnızca bir Owner verebilir veya geri alabilir.
 * - Workspace'te en az bir Owner kalmalıdır.
 *
 * @param newRole `null` = üyeyi workspace'ten çıkarma.
 */
export function checkMemberChange(params: {
  actorRole: WorkspaceRole;
  targetRole: WorkspaceRole;
  newRole: WorkspaceRole | null;
  ownerCount: number;
}): MemberChangeResult {
  const { actorRole, targetRole, newRole, ownerCount } = params;
  const touchesOwner = targetRole === 'OWNER' || newRole === 'OWNER';

  if (touchesOwner && actorRole !== 'OWNER') {
    return { ok: false, code: ERROR_CODES.OWNER_ONLY };
  }
  if (targetRole === 'OWNER' && newRole !== 'OWNER' && ownerCount <= 1) {
    return { ok: false, code: ERROR_CODES.LAST_OWNER };
  }
  return { ok: true };
}
