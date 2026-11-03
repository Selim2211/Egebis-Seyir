import { ERROR_CODES } from '../errors/codes';
import {
  ALL_SPACE_PERMISSIONS,
  CONTENT_PERMISSIONS,
  CONTENT_VIEW_PERMISSIONS,
  PROJECT_LEAD_PERMISSIONS,
  type WorkspaceRole,
} from '../permissions/roles';

/** Dış kaynağın doküman/video erişimi; Super Admin verir (ADR-152). */
export const CONTENT_ACCESS = ['NONE', 'VIEW', 'FULL'] as const;
export type ContentAccess = (typeof CONTENT_ACCESS)[number];

export interface SpaceAccessInput {
  workspaceRole: WorkspaceRole;
  /** Kullanıcı Proje üyesiyse Proje rolünün izinleri; değilse null. */
  memberPermissions: readonly string[] | null;
  /** Yalnızca dış kaynak (GUEST) için anlamlı; verilmezse NONE. */
  contentAccess?: ContentAccess;
}

/**
 * Dış kaynağın üst sınırı: Proje yöneticisi izinleri hiç yok; doküman/video izinleri Super Admin'in
 * verdiği erişime göre (NONE: hiç, VIEW: yalnızca görüntüleme, FULL: rolünün verdiği kadar).
 */
export function outsourcePermissions(
  memberPermissions: readonly string[],
  contentAccess: ContentAccess = 'NONE',
): readonly string[] {
  const base = memberPermissions.filter(
    (p) =>
      !(PROJECT_LEAD_PERMISSIONS as readonly string[]).includes(p) &&
      (contentAccess === 'FULL' || !(CONTENT_PERMISSIONS as readonly string[]).includes(p)),
  );
  return contentAccess === 'VIEW' ? [...base, ...CONTENT_VIEW_PERMISSIONS] : base;
}

/**
 * Kullanıcının bir Projedeki etkin izinleri (ADR-039, ADR-152). `null` = Proje görünmez (404).
 * - Super Admin (Owner/Admin): tüm Proje izinleri (ADR-038).
 * - Projenin üyesi olmayan herkes: görünmez. Açık/gizli Proje ayrımı yoktur.
 * - Proje üyesi: rolünün izinleri.
 * - Dış kaynak (Guest) üye: rol izinleri `outsourcePermissions` ile sınırlanır.
 */
export function spacePermissions(input: SpaceAccessInput): readonly string[] | null {
  const { workspaceRole, memberPermissions } = input;
  if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') return ALL_SPACE_PERMISSIONS;
  if (!memberPermissions) return null;
  if (workspaceRole === 'GUEST')
    return outsourcePermissions(memberPermissions, input.contentAccess);
  return memberPermissions;
}

export type SpaceRoleCheck =
  { ok: true } | { ok: false; code: typeof ERROR_CODES.OUTSOURCE_NOT_MANAGER };

/** Dış kaynak Proje Yöneticisi olamaz; yalnızca Proje Üyesi rolüyle eklenir (ADR-152). */
export function checkSpaceRole(workspaceRole: WorkspaceRole, spaceRole: string): SpaceRoleCheck {
  if (workspaceRole === 'GUEST' && spaceRole !== 'PROJECT_MEMBER') {
    return { ok: false, code: ERROR_CODES.OUTSOURCE_NOT_MANAGER };
  }
  return { ok: true };
}
