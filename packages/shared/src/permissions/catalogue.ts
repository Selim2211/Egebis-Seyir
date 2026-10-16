import { SPACE_PERMISSIONS as S, WORKSPACE_PERMISSIONS as W } from './permissions';

export interface PermissionEntry {
  scope: 'WORKSPACE' | 'SPACE';
  /** Arayüzde gruplamak için (i18n: `permissionGroups.<group>`). */
  group: string;
  key: string;
}

/**
 * Rol matrisi arayüzünün izin kataloğu (ADR-112). Etiketler i18n'de `permissions.<key>`.
 * Her izin anahtarı burada tam bir kez geçer (spec bunu doğrular).
 */
export const PERMISSION_CATALOGUE: readonly PermissionEntry[] = [
  { scope: 'WORKSPACE', group: 'workspace', key: W.WORKSPACE_DELETE },
  { scope: 'WORKSPACE', group: 'workspace', key: W.WORKSPACE_SETTINGS },
  { scope: 'WORKSPACE', group: 'workspace', key: W.AUDIT_VIEW },
  { scope: 'WORKSPACE', group: 'people', key: W.MEMBERS_VIEW },
  { scope: 'WORKSPACE', group: 'people', key: W.MEMBERS_MANAGE },
  { scope: 'WORKSPACE', group: 'spaces', key: W.SPACE_CREATE },
  { scope: 'SPACE', group: 'space', key: S.SPACE_VIEW },
  { scope: 'SPACE', group: 'space', key: S.SPACE_SETTINGS },
  { scope: 'SPACE', group: 'space', key: S.LIST_MANAGE },
  { scope: 'SPACE', group: 'items', key: S.WORK_ITEM_WRITE },
  { scope: 'SPACE', group: 'items', key: S.WORK_ITEM_STATUS_OWN },
  { scope: 'SPACE', group: 'items', key: S.WORK_ITEM_ACCESS },
  { scope: 'SPACE', group: 'items', key: S.ESTIMATE_WRITE },
  { scope: 'SPACE', group: 'items', key: S.COMMENT_WRITE },
  { scope: 'SPACE', group: 'sprints', key: S.BACKLOG_RANK },
  { scope: 'SPACE', group: 'sprints', key: S.SPRINT_PLAN },
  { scope: 'SPACE', group: 'sprints', key: S.SPRINT_START },
  { scope: 'SPACE', group: 'sprints', key: S.SPRINT_COMPLETE },
  { scope: 'SPACE', group: 'sprints', key: S.SPRINT_CANCEL },
  { scope: 'SPACE', group: 'content', key: S.REPORT_VIEW },
  { scope: 'SPACE', group: 'content', key: S.DOC_VIEW },
  { scope: 'SPACE', group: 'content', key: S.DOC_WRITE },
];
