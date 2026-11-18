import { ERROR_CODES } from '../errors/codes';
import {
  ALL_SPACE_PERMISSIONS,
  CONTENT_PERMISSIONS,
  CONTENT_VIEW_PERMISSIONS,
  PROJECT_LEAD_PERMISSIONS,
  type WorkspaceRole,
} from '../permissions/roles';
import { outsourceAccessPermissions } from './outsource-access';
import { SPACE_PERMISSIONS as SP } from '../permissions/permissions';

/** Dış kaynağın doküman/video erişimi; Super Admin verir (ADR-152). */
export const CONTENT_ACCESS = ['NONE', 'VIEW', 'FULL'] as const;
export type ContentAccess = (typeof CONTENT_ACCESS)[number];

/** Guest (VIEWER) yalnızca okur: Super Admin'in verdiği Projelerde görüntüleme izinleri (ADR-169). */
const VIEWER_READ: readonly string[] = [SP.SPACE_VIEW, SP.REPORT_VIEW];
export function viewerPermissions(
  memberPermissions: readonly string[],
  contentAccess: ContentAccess = 'NONE',
): readonly string[] {
  const allowed = new Set<string>(VIEWER_READ);
  if (contentAccess !== 'NONE') for (const p of CONTENT_VIEW_PERMISSIONS) allowed.add(p);
  return memberPermissions.filter((p) => allowed.has(p));
}

export interface SpaceAccessInput {
  workspaceRole: WorkspaceRole;
  /** Kullanıcı Proje üyesiyse Proje rolünün izinleri; değilse null. */
  memberPermissions: readonly string[] | null;
  /** Guest (VIEWER) için doküman/video erişimi; verilmezse NONE. */
  contentAccess?: ContentAccess;
  /** Dış kaynağın (GUEST) bu Projedeki kişiye özel alan yetkisi (ADR-172); yoksa varsayılan. */
  outsourceAccess?: unknown;
}

/**
 * (Eski, ADR-152) Dış kaynağın rol tabanlı üst sınırı; artık kullanılmaz, uyumluluk için durur.
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
 * - Dış kaynak (GUEST) üye: izinleri Projedeki kişisel alan ayarından gelir (`outsourceAccessPermissions`, ADR-172).
 */
export function spacePermissions(input: SpaceAccessInput): readonly string[] | null {
  const { workspaceRole, memberPermissions } = input;
  if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') return ALL_SPACE_PERMISSIONS;
  if (!memberPermissions) return null;
  if (workspaceRole === 'VIEWER') return viewerPermissions(memberPermissions, input.contentAccess);
  // Dış kaynak: yetki rolden değil, Proje bazlı kişisel ayardan gelir (ADR-172).
  if (workspaceRole === 'GUEST') return outsourceAccessPermissions(input.outsourceAccess);
  return memberPermissions;
}

export type SpaceRoleCheck =
  { ok: true } | { ok: false; code: typeof ERROR_CODES.OUTSOURCE_NOT_MANAGER };

/** Dış kaynak Proje Yöneticisi olamaz; yalnızca Proje Üyesi rolüyle eklenir (ADR-152). */
export function checkSpaceRole(workspaceRole: WorkspaceRole, spaceRole: string): SpaceRoleCheck {
  if ((workspaceRole === 'GUEST' || workspaceRole === 'VIEWER') && spaceRole !== 'PROJECT_MEMBER') {
    return { ok: false, code: ERROR_CODES.OUTSOURCE_NOT_MANAGER };
  }
  return { ok: true };
}
