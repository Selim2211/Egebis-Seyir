import type { WorkspaceRole } from '@scrum/shared';
import type { ClsStore } from 'nestjs-cls';

/** İstek boyunca taşınan bağlam (ADR-012). Guard'lar doldurur, servisler okur. */
export interface AppClsStore extends ClsStore {
  userId?: string;
  sessionId?: string;
  /** Yalnızca /workspaces/:workspaceId/... rotalarında dolu. */
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
  permissions?: readonly string[];
}
