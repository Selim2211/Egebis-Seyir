import { ERROR_CODES } from '../errors/codes';
import { PERMISSION_CATALOGUE } from '../permissions/catalogue';
import { SPACE_PERMISSIONS as S, WORKSPACE_PERMISSIONS as W } from '../permissions/permissions';
import type { RoleScopeName } from '../schemas/role';

export type RolePermissionsCheck =
  | { ok: true }
  | {
      ok: false;
      code:
        | typeof ERROR_CODES.ROLE_INVALID_PERMISSIONS
        | typeof ERROR_CODES.ROLE_LOCKED
        | typeof ERROR_CODES.ROLE_GUARDRAIL;
    };

/**
 * Rol izin setini doğrular (ADR-112):
 * - Yalnızca rolün kapsamına ait bilinen izinler.
 * - OWNER değiştirilemez.
 * - Özel rolde `workspace.delete` olamaz.
 * - ADMIN, üye ve ayar yönetimini kaybedemez (workspace kilitlenmesin).
 * - Her Space rolü `space.view` içerir.
 */
export function validateRolePermissions(input: {
  scope: RoleScopeName;
  /** Sistem rolü anahtarı; özel rolde null. */
  systemKey: string | null;
  permissions: readonly string[];
}): RolePermissionsCheck {
  const { scope, systemKey, permissions } = input;
  const known = new Set(PERMISSION_CATALOGUE.filter((p) => p.scope === scope).map((p) => p.key));
  if (permissions.some((p) => !known.has(p)) || new Set(permissions).size !== permissions.length) {
    return { ok: false, code: ERROR_CODES.ROLE_INVALID_PERMISSIONS };
  }
  if (scope === 'WORKSPACE') {
    if (systemKey === 'OWNER') return { ok: false, code: ERROR_CODES.ROLE_LOCKED };
    if (systemKey === null && permissions.includes(W.WORKSPACE_DELETE)) {
      return { ok: false, code: ERROR_CODES.ROLE_GUARDRAIL };
    }
    if (
      systemKey === 'ADMIN' &&
      !(permissions.includes(W.MEMBERS_MANAGE) && permissions.includes(W.WORKSPACE_SETTINGS))
    ) {
      return { ok: false, code: ERROR_CODES.ROLE_GUARDRAIL };
    }
  } else if (!permissions.includes(S.SPACE_VIEW)) {
    return { ok: false, code: ERROR_CODES.ROLE_GUARDRAIL };
  }
  return { ok: true };
}
