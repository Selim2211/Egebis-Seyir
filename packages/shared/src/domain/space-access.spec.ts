import { describe, expect, it } from 'vitest';
import { SPACE_PERMISSIONS as S } from '../permissions/permissions';
import { ALL_SPACE_PERMISSIONS, DEFAULT_SPACE_ROLE_PERMISSIONS } from '../permissions/roles';
import {
  checkSpaceRole,
  outsourcePermissions,
  spacePermissions,
  type SpaceAccessInput,
} from './space-access';

const MANAGER = DEFAULT_SPACE_ROLE_PERMISSIONS.PROJECT_MANAGER;
const MEMBER = DEFAULT_SPACE_ROLE_PERMISSIONS.PROJECT_MEMBER;

const access = (input: Partial<SpaceAccessInput>) =>
  spacePermissions({ workspaceRole: 'MEMBER', memberPermissions: null, ...input });

describe('spacePermissions (ADR-039, ADR-152)', () => {
  it('Super Admin (Owner/Admin) üye olmasa da her Projede tüm izinlere sahip', () => {
    for (const workspaceRole of ['OWNER', 'ADMIN'] as const) {
      expect(access({ workspaceRole })).toEqual(ALL_SPACE_PERMISSIONS);
      expect(access({ workspaceRole, memberPermissions: MEMBER })).toEqual(ALL_SPACE_PERMISSIONS);
    }
  });

  it('Proje üyesi rolünün izinlerini alır', () => {
    expect(access({ memberPermissions: MEMBER })).toEqual(MEMBER);
    expect(access({ memberPermissions: MANAGER })).toEqual(MANAGER);
  });

  it('üye olmayan kullanıcı Projeyi göremez', () => {
    expect(access({})).toBeNull();
    expect(access({ workspaceRole: 'GUEST' })).toBeNull();
  });

  it('dış kaynak: yönetici izinleri yok, içerik varsayılan kapalı', () => {
    const perms = access({ workspaceRole: 'GUEST', memberPermissions: MANAGER })!;
    expect(perms).toContain(S.WORK_ITEM_WRITE);
    expect(perms).not.toContain(S.SPACE_SETTINGS);
    expect(perms).not.toContain(S.SPRINT_PLAN);
    expect(perms).not.toContain(S.DOC_VIEW);
    expect(perms).not.toContain(S.VIDEO_VIEW);
  });

  it('dış kaynağın içerik erişimi: VIEW yalnızca görüntüleme, FULL rolünün izinleri', () => {
    const view = outsourcePermissions(MEMBER, 'VIEW');
    expect(view).toContain(S.DOC_VIEW);
    expect(view).toContain(S.VIDEO_VIEW);
    expect(view).not.toContain(S.DOC_EDIT);
    const full = outsourcePermissions(MEMBER, 'FULL');
    expect(full).toContain(S.DOC_EDIT);
    expect(full).toContain(S.VIDEO_DELETE);
  });
});

describe('checkSpaceRole (ADR-152)', () => {
  it('dış kaynak yalnızca Proje Üyesi olabilir', () => {
    expect(checkSpaceRole('GUEST', 'PROJECT_MEMBER')).toEqual({ ok: true });
    expect(checkSpaceRole('GUEST', 'PROJECT_MANAGER')).toEqual({
      ok: false,
      code: 'OUTSOURCE_NOT_MANAGER',
    });
  });

  it('kullanıcı her Proje rolünü alabilir', () => {
    expect(checkSpaceRole('MEMBER', 'PROJECT_MANAGER')).toEqual({ ok: true });
  });
});
