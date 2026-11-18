import { describe, expect, it } from 'vitest';
import { SPACE_PERMISSIONS as S } from '../permissions/permissions';
import { accountTermDays, DEFAULT_SPACE_ROLE_PERMISSIONS } from '../permissions/roles';
import { checkSpaceRole, spacePermissions, viewerPermissions } from './space-access';

const member = DEFAULT_SPACE_ROLE_PERMISSIONS.PROJECT_MEMBER;

describe('Guest (VIEWER) yalnızca okur — ADR-169', () => {
  it('yazma ve yönetme izinleri hiç gelmez', () => {
    const p = viewerPermissions(member, 'FULL');
    expect(p).not.toContain(S.WORK_ITEM_WRITE);
    expect(p).not.toContain(S.COMMENT_WRITE);
    expect(p).not.toContain(S.DOC_EDIT);
    expect(p).not.toContain(S.SPACE_SETTINGS);
    expect(p).toContain(S.SPACE_VIEW);
  });

  it('doküman/video yalnızca içerik erişimi verilince görüntülenir, yazılmaz', () => {
    expect(viewerPermissions(member, 'NONE')).not.toContain(S.DOC_VIEW);
    const view = viewerPermissions(member, 'VIEW');
    expect(view).toContain(S.DOC_VIEW);
    expect(view).not.toContain(S.DOC_CREATE);
  });

  it('Projeye üye değilse görünmez; Super Admin etkilenmez', () => {
    expect(spacePermissions({ workspaceRole: 'VIEWER', memberPermissions: null })).toBeNull();
    expect(spacePermissions({ workspaceRole: 'ADMIN', memberPermissions: null })).not.toBeNull();
  });

  it('yalnızca Proje Üyesi rolüyle eklenebilir', () => {
    expect(checkSpaceRole('VIEWER', 'PROJECT_MANAGER').ok).toBe(false);
    expect(checkSpaceRole('VIEWER', 'PROJECT_MEMBER').ok).toBe(true);
  });
});

describe('hesap süreleri', () => {
  it('Dış kaynak 90, Guest 30 gün; diğerleri süresiz', () => {
    expect(accountTermDays('GUEST')).toBe(90);
    expect(accountTermDays('VIEWER')).toBe(30);
    expect(accountTermDays('MEMBER')).toBeNull();
    expect(accountTermDays('ADMIN')).toBeNull();
  });
});
