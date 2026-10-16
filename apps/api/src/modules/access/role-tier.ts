import type { WorkspaceRole } from '@scrum/shared';

/**
 * Rolün yetki katmanı: sistem rolünde kendi anahtarı, özel workspace rolünde `baseKey` (ADR-112).
 * Owner/Admin/Guest kuralları (tüm Space'lere erişim, Guest sınırı…) bu katmana bakar.
 */
export const roleTier = (role: { key: string; baseKey: string | null }): WorkspaceRole =>
  (role.baseKey ?? role.key) as WorkspaceRole;
