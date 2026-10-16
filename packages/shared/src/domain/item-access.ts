import { ALL_SPACE_PERMISSIONS, type WorkspaceRole } from '../permissions/roles';

/**
 * Öğe bazlı erişim (ADR-113). En yakın "özel erişimli" üst öğe (kök) Space kuralının yerini ya da
 * üstüne ekleme yapar:
 * - Kök yoksa: Space izinleri aynen geçerli.
 * - Owner/Admin: her zaman tüm izinler.
 * - Gizli kök: yalnızca listedekiler (kişi/takım rolleri birleşir) ve kökü oluşturan (Space izniyle).
 * - Açık (gizli olmayan) kök: Space izinleri ∪ listedeki rollerin izinleri.
 * - Guest: listedeki rol izinleri Stakeholder izinleriyle sınırlanır (`guestCap`).
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
  /** Guest için üst sınır: Stakeholder izinleri. */
  guestCap: readonly string[];
}

export function itemPermissions(input: ItemAccessInput): readonly string[] | null {
  const { workspaceRole, spacePermissions, root, userId } = input;
  if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') return ALL_SPACE_PERMISSIONS;
  if (!root) return spacePermissions;

  const granted =
    input.entryPermissions === null
      ? null
      : workspaceRole === 'GUEST'
        ? input.entryPermissions.filter((p) => input.guestCap.includes(p))
        : input.entryPermissions;

  if (root.isPrivate) {
    if (granted) return granted;
    // Oluşturan, kendi gizli öğesini Space izinleriyle görmeye devam eder.
    return root.createdById === userId ? spacePermissions : null;
  }
  if (spacePermissions === null) return granted;
  return granted ? [...new Set([...spacePermissions, ...granted])] : spacePermissions;
}
