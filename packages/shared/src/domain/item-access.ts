import { ALL_SPACE_PERMISSIONS, type WorkspaceRole } from '../permissions/roles';
import { type ContentAccess, outsourcePermissions } from './space-access';

/**
 * Öğe bazlı erişim (ADR-113). En yakın "özel erişimli" üst öğe (kök) Space kuralının yerini ya da
 * üstüne ekleme yapar:
 * - Kök yoksa: Space izinleri aynen geçerli.
 * - Owner/Admin: her zaman tüm izinler.
 * - Gizli kök: yalnızca listedekiler (kişi/takım rolleri birleşir) ve kökü oluşturan (Space izniyle).
 * - Açık (gizli olmayan) kök: Space izinleri ∪ listedeki rollerin izinleri.
 * - Dış kaynak (Guest): listedeki rol izinleri `outsourcePermissions` ile sınırlanır (ADR-152).
 * `null` = öğe görünmez.
 */
export interface ItemAccessInput {
  workspaceRole: WorkspaceRole;
  /** Kullanıcının Space'teki etkin izinleri (`spacePermissions` sonucu); Space görünmezse null. */
  spacePermissions: readonly string[] | null;
  /** Kök yoksa null. */
  root: { isPrivate: boolean; createdById: string | null } | null;
  /** Kullanıcının (doğrudan veya takımı üzerinden) aldığı rollerin izinlerinin birleşimi; yoksa null. */
  entryPermissions: readonly string[] | null;
  userId: string;
  /** Dış kaynağın doküman/video erişimi (yalnızca Guest için). */
  contentAccess?: ContentAccess;
}

export function itemPermissions(input: ItemAccessInput): readonly string[] | null {
  const { workspaceRole, spacePermissions, root, userId } = input;
  if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') return ALL_SPACE_PERMISSIONS;
  if (!root) return spacePermissions;

  const granted =
    input.entryPermissions === null
      ? null
      : workspaceRole === 'GUEST'
        ? outsourcePermissions(input.entryPermissions, input.contentAccess)
        : input.entryPermissions;

  if (root.isPrivate) {
    if (granted) return granted;
    // Oluşturan, kendi gizli öğesini Space izinleriyle görmeye devam eder.
    return root.createdById === userId ? spacePermissions : null;
  }
  if (spacePermissions === null) return granted;
  return granted ? [...new Set([...spacePermissions, ...granted])] : spacePermissions;
}
