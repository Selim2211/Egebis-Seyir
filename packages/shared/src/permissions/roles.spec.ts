import { describe, expect, it } from 'vitest';
import {
  SPACE_PERMISSIONS as S,
  WORKSPACE_PERMISSIONS as W,
  type SpacePermission,
  type WorkspacePermission,
} from './permissions';
import {
  DEFAULT_SPACE_ROLE_PERMISSIONS as SPACE,
  DEFAULT_WORKSPACE_ROLE_PERMISSIONS as WS,
  SPACE_ROLES,
  WORKSPACE_ROLES,
  type SpaceRole,
  type WorkspaceRole,
} from './roles';

const spaceRolesWith = (p: SpacePermission) => SPACE_ROLES.filter((r) => SPACE[r].includes(p));
const wsRolesWith = (p: WorkspacePermission) => WORKSPACE_ROLES.filter((r) => WS[r].includes(p));

describe('Varsayılan Space rol matrisi (brief §7.2)', () => {
  const expected: Array<[SpacePermission, SpaceRole[]]> = [
    [S.SPACE_VIEW, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER', 'STAKEHOLDER']],
    [S.BACKLOG_RANK, ['PRODUCT_OWNER']],
    [S.WORK_ITEM_WRITE, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER']],
    [S.SPRINT_PLAN, ['PRODUCT_OWNER', 'SCRUM_MASTER']],
    [S.SPRINT_START, ['PRODUCT_OWNER', 'SCRUM_MASTER']],
    [S.SPRINT_COMPLETE, ['PRODUCT_OWNER', 'SCRUM_MASTER']],
    [S.SPRINT_CANCEL, ['PRODUCT_OWNER']],
    [S.WORK_ITEM_STATUS_OWN, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER']],
    [S.ESTIMATE_WRITE, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER']],
    [S.COMMENT_WRITE, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER', 'STAKEHOLDER']],
    [S.REPORT_VIEW, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER', 'STAKEHOLDER']],
    [S.SPACE_SETTINGS, ['PRODUCT_OWNER', 'SCRUM_MASTER']],
    [S.DOC_WRITE, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER']],
    [S.DOC_VIEW, ['PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER', 'STAKEHOLDER']],
  ];

  it.each(expected)('%s → %j', (permission, roles) => {
    expect(spaceRolesWith(permission)).toEqual(roles);
  });

  it('her Space izni matriste test edilmiş', () => {
    const tested = new Set(expected.map(([p]) => p));
    expect(Object.values(S).filter((p) => !tested.has(p))).toEqual([]);
  });

  it('rollerde tekrar eden izin yok', () => {
    for (const role of SPACE_ROLES) {
      expect(new Set(SPACE[role]).size).toBe(SPACE[role].length);
    }
  });
});

describe('Varsayılan workspace rol matrisi (brief §7.1)', () => {
  const expected: Array<[WorkspacePermission, WorkspaceRole[]]> = [
    [W.WORKSPACE_DELETE, ['OWNER']],
    [W.MEMBERS_MANAGE, ['OWNER', 'ADMIN']],
    [W.WORKSPACE_SETTINGS, ['OWNER', 'ADMIN']],
    [W.AUDIT_VIEW, ['OWNER', 'ADMIN']],
    [W.SPACE_CREATE, ['OWNER', 'ADMIN', 'MEMBER']],
  ];

  it.each(expected)('%s → %j', (permission, roles) => {
    expect(wsRolesWith(permission)).toEqual(roles);
  });

  it('her workspace izni matriste test edilmiş', () => {
    const tested = new Set(expected.map(([p]) => p));
    expect(Object.values(W).filter((p) => !tested.has(p))).toEqual([]);
  });
});
