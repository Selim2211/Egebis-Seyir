import { describe, expect, it } from 'vitest';
import { SPACE_PERMISSIONS as S } from '../permissions/permissions';
import { ALL_SPACE_PERMISSIONS, DEFAULT_SPACE_ROLE_PERMISSIONS } from '../permissions/roles';
import { checkSpaceRole, spacePermissions, type SpaceAccessInput } from './space-access';

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

  it('dış kaynak: yetki rolden değil kişisel ayardan gelir; varsayılan yalnızca iş öğesi okuma', () => {
    const perms = access({ workspaceRole: 'GUEST', memberPermissions: MANAGER })!;
    expect(perms).toContain(S.SPACE_VIEW);
    // Rol Proje Yöneticisi bile olsa yazma ve yönetme gelmez (ADR-172).
    expect(perms).not.toContain(S.WORK_ITEM_WRITE);
    expect(perms).not.toContain(S.SPACE_SETTINGS);
    expect(perms).not.toContain(S.SPRINT_PLAN);
    expect(perms).not.toContain(S.DOC_VIEW);
  });

  it('dış kaynağın alan yetkisi: Okuma görüntüler, Yazma yazar; yönetici izni hiç gelmez', () => {
    const perms = access({
      workspaceRole: 'GUEST',
      memberPermissions: MEMBER,
      outsourceAccess: {
        items: 'WRITE',
        comments: 'WRITE',
        docs: 'READ',
        videos: 'WRITE',
        reports: 'READ',
      },
    })!;
    expect(perms).toContain(S.WORK_ITEM_WRITE);
    expect(perms).toContain(S.COMMENT_WRITE);
    expect(perms).toContain(S.DOC_VIEW);
    expect(perms).not.toContain(S.DOC_EDIT);
    expect(perms).toContain(S.VIDEO_EDIT);
    expect(perms).toContain(S.REPORT_VIEW);
    expect(perms).not.toContain(S.SPACE_SETTINGS);
    expect(perms).not.toContain(S.SPRINT_PLAN);
    expect(perms).not.toContain(S.BUG_ASSIGN);
  });

  it('dış kaynakta iş öğeleri en az Okuma olur (Proje görünür kalır)', () => {
    const perms = access({
      workspaceRole: 'GUEST',
      memberPermissions: MEMBER,
      outsourceAccess: {
        items: 'NONE',
        comments: 'NONE',
        docs: 'NONE',
        videos: 'NONE',
        reports: 'NONE',
      },
    })!;
    expect(perms).toContain(S.SPACE_VIEW);
  });

  it('Projeye atanmamış dış kaynak hiçbir Proje görmez', () => {
    expect(access({ workspaceRole: 'GUEST', memberPermissions: null })).toBeNull();
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
