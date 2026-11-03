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

describe('Varsayılan Proje rol matrisi (ADR-152)', () => {
  const expected: Array<[SpacePermission, SpaceRole[]]> = [
    [S.SPACE_VIEW, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.BACKLOG_RANK, ['PROJECT_MANAGER']],
    [S.WORK_ITEM_WRITE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.SPRINT_PLAN, ['PROJECT_MANAGER']],
    [S.SPRINT_START, ['PROJECT_MANAGER']],
    [S.SPRINT_COMPLETE, ['PROJECT_MANAGER']],
    [S.SPRINT_CANCEL, ['PROJECT_MANAGER']],
    [S.WORK_ITEM_STATUS_OWN, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.WORK_ITEM_ACCESS, ['PROJECT_MANAGER']],
    [S.BUG_REPORT, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.BUG_ASSIGN, ['PROJECT_MANAGER']],
    [S.ESTIMATE_WRITE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.COMMENT_WRITE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.REPORT_VIEW, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.SPACE_SETTINGS, ['PROJECT_MANAGER']],
    [S.LIST_MANAGE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.DOC_VIEW, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.DOC_CREATE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.DOC_EDIT, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.DOC_DELETE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.VIDEO_VIEW, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.VIDEO_CREATE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.VIDEO_EDIT, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
    [S.VIDEO_DELETE, ['PROJECT_MANAGER', 'PROJECT_MEMBER']],
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
    [W.MEMBERS_VIEW, ['OWNER', 'ADMIN', 'MEMBER']],
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
