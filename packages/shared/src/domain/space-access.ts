import { ERROR_CODES } from '../errors/codes';
import { ALL_SPACE_PERMISSIONS, type SpaceRole, type WorkspaceRole } from '../permissions/roles';

export interface SpaceAccessInput {
  workspaceRole: WorkspaceRole;
  isPrivate: boolean;
  /** Kullanıcı Space üyesiyse Space rolünün izinleri; değilse null. */
  memberPermissions: readonly string[] | null;
  /** Stakeholder rolünün izinleri (açık Space'te üye olmayanlar ve Guest'ler). */
  stakeholderPermissions: readonly string[];
}

/**
 * Kullanıcının bir Space'teki etkin izinleri (ADR-039). `null` = Space görünmez (404).
 * - Owner/Admin: tüm Space izinleri (ADR-038).
 * - Guest: yalnızca üyesi olduğu Space'ler, her zaman Stakeholder izinleriyle (ADR-035).
 * - Space üyesi: rolünün izinleri.
 * - Açık Space'te üye olmayan Member: Stakeholder izinleri; özel Space'te görünmez.
 */
export function spacePermissions(input: SpaceAccessInput): readonly string[] | null {
  const { workspaceRole, isPrivate, memberPermissions, stakeholderPermissions } = input;
  if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') return ALL_SPACE_PERMISSIONS;
  if (workspaceRole === 'GUEST') return memberPermissions ? stakeholderPermissions : null;
  if (memberPermissions) return memberPermissions;
  return isPrivate ? null : stakeholderPermissions;
}

export type SpaceRoleCheck =
  { ok: true } | { ok: false; code: typeof ERROR_CODES.GUEST_STAKEHOLDER_ONLY };

/** Guest bir Space'e yalnızca Stakeholder olarak eklenebilir (ADR-035). */
export function checkSpaceRole(workspaceRole: WorkspaceRole, spaceRole: SpaceRole): SpaceRoleCheck {
  if (workspaceRole === 'GUEST' && spaceRole !== 'STAKEHOLDER') {
    return { ok: false, code: ERROR_CODES.GUEST_STAKEHOLDER_ONLY };
  }
  return { ok: true };
}
