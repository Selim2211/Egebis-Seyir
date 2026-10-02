import {
  SPACE_PERMISSIONS as S,
  WORKSPACE_PERMISSIONS as W,
  type SpacePermission,
  type WorkspacePermission,
} from './permissions';

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const SPACE_ROLES = ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER', 'STAKEHOLDER'] as const;
export type SpaceRole = (typeof SPACE_ROLES)[number];

/**
 * Varsayılan workspace rol matrisi (brief §7.1). DB'ye seed edilir;
 * F2 özel rolleri bu setlerden türetilebilir.
 */
export const DEFAULT_WORKSPACE_ROLE_PERMISSIONS: Record<
  WorkspaceRole,
  readonly WorkspacePermission[]
> = {
  OWNER: [W.WORKSPACE_DELETE, W.MEMBERS_MANAGE, W.WORKSPACE_SETTINGS, W.AUDIT_VIEW, W.SPACE_CREATE],
  ADMIN: [W.MEMBERS_MANAGE, W.WORKSPACE_SETTINGS, W.AUDIT_VIEW, W.SPACE_CREATE],
  MEMBER: [W.SPACE_CREATE],
  GUEST: [],
};

const VIEW_AND_DISCUSS = [S.SPACE_VIEW, S.COMMENT_WRITE, S.REPORT_VIEW, S.DOC_VIEW] as const;
const TEAM_WORK = [
  ...VIEW_AND_DISCUSS,
  S.WORK_ITEM_WRITE,
  S.WORK_ITEM_STATUS_OWN,
  S.ESTIMATE_WRITE,
  S.DOC_WRITE,
] as const;
const SPRINT_LEAD = [S.SPRINT_PLAN, S.SPRINT_START, S.SPRINT_COMPLETE, S.SPACE_SETTINGS] as const;

/**
 * Varsayılan Space (Scrum) rol matrisi (brief §7.2). Brief bunu başlangıç önerisi
 * olarak tanımlar; roller DB'de tutulduğu için sonradan esnetilebilir.
 */
export const DEFAULT_SPACE_ROLE_PERMISSIONS: Record<SpaceRole, readonly SpacePermission[]> = {
  PRODUCT_OWNER: [...TEAM_WORK, ...SPRINT_LEAD, S.BACKLOG_RANK, S.SPRINT_CANCEL],
  SCRUM_MASTER: [...TEAM_WORK, ...SPRINT_LEAD],
  DEVELOPER: [...TEAM_WORK],
  STAKEHOLDER: [...VIEW_AND_DISCUSS],
};
