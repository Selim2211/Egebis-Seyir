import { describe, expect, it } from 'vitest';
import { SPACE_PERMISSIONS as S } from '../permissions/permissions';
import { ALL_SPACE_PERMISSIONS, DEFAULT_SPACE_ROLE_PERMISSIONS } from '../permissions/roles';
import { checkSpaceRole, spacePermissions, type SpaceAccessInput } from './space-access';

const STAKEHOLDER = DEFAULT_SPACE_ROLE_PERMISSIONS.STAKEHOLDER;
const DEVELOPER = DEFAULT_SPACE_ROLE_PERMISSIONS.DEVELOPER;

const access = (input: Partial<SpaceAccessInput>) =>
  spacePermissions({
    workspaceRole: 'MEMBER',
    isPrivate: false,
    memberPermissions: null,
    stakeholderPermissions: STAKEHOLDER,
    ...input,
  });

describe('spacePermissions (ADR-039)', () => {
  it('Owner ve Admin özel Space dahil her yerde tüm izinlere sahip', () => {
    for (const workspaceRole of ['OWNER', 'ADMIN'] as const) {
      expect(access({ workspaceRole, isPrivate: true })).toEqual(ALL_SPACE_PERMISSIONS);
      expect(access({ workspaceRole, memberPermissions: STAKEHOLDER })).toEqual(
        ALL_SPACE_PERMISSIONS,
      );
    }
  });

  it('Space üyesi rolünün izinlerini alır', () => {
    expect(access({ memberPermissions: DEVELOPER })).toEqual(DEVELOPER);
    expect(access({ memberPermissions: DEVELOPER, isPrivate: true })).toEqual(DEVELOPER);
  });

  it('açık Space: üye olmayan Member Stakeholder olarak görür, yapı değiştiremez', () => {
    const perms = access({});
    expect(perms).toEqual(STAKEHOLDER);
    expect(perms).toContain(S.COMMENT_WRITE);
    expect(perms).not.toContain(S.LIST_MANAGE);
    expect(perms).not.toContain(S.WORK_ITEM_WRITE);
  });

  it('özel Space: üye olmayan Member göremez', () => {
    expect(access({ isPrivate: true })).toBeNull();
  });

  it('Guest yalnızca paylaşılan Space görür, her zaman Stakeholder izinleriyle', () => {
    expect(access({ workspaceRole: 'GUEST' })).toBeNull();
    expect(access({ workspaceRole: 'GUEST', memberPermissions: STAKEHOLDER })).toEqual(STAKEHOLDER);
    expect(access({ workspaceRole: 'GUEST', memberPermissions: DEVELOPER })).toEqual(STAKEHOLDER);
  });
});

describe('checkSpaceRole (ADR-035)', () => {
  it('Guest yalnızca Stakeholder olabilir', () => {
    expect(checkSpaceRole('GUEST', 'STAKEHOLDER')).toEqual({ ok: true });
    expect(checkSpaceRole('GUEST', 'DEVELOPER')).toEqual({
      ok: false,
      code: 'GUEST_STAKEHOLDER_ONLY',
    });
  });

  it('Member her Space rolünü alabilir', () => {
    expect(checkSpaceRole('MEMBER', 'PRODUCT_OWNER')).toEqual({ ok: true });
  });
});
