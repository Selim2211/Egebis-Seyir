import { describe, expect, it } from 'vitest';
import { checkMemberChange } from './members';

describe('checkMemberChange', () => {
  it('Admin, Member rolünü Guest yapabilir', () => {
    expect(
      checkMemberChange({
        actorRole: 'ADMIN',
        targetRole: 'MEMBER',
        newRole: 'GUEST',
        ownerCount: 1,
      }),
    ).toEqual({ ok: true });
  });

  it("Admin bir Owner'a dokunamaz", () => {
    expect(
      checkMemberChange({
        actorRole: 'ADMIN',
        targetRole: 'OWNER',
        newRole: 'MEMBER',
        ownerCount: 2,
      }),
    ).toEqual({ ok: false, code: 'OWNER_ONLY' });
    expect(
      checkMemberChange({ actorRole: 'ADMIN', targetRole: 'OWNER', newRole: null, ownerCount: 2 }),
    ).toEqual({ ok: false, code: 'OWNER_ONLY' });
  });

  it('Admin kimseyi Owner yapamaz', () => {
    expect(
      checkMemberChange({
        actorRole: 'ADMIN',
        targetRole: 'MEMBER',
        newRole: 'OWNER',
        ownerCount: 1,
      }),
    ).toEqual({ ok: false, code: 'OWNER_ONLY' });
  });

  it('Owner başka birini Owner yapabilir', () => {
    expect(
      checkMemberChange({
        actorRole: 'OWNER',
        targetRole: 'ADMIN',
        newRole: 'OWNER',
        ownerCount: 1,
      }),
    ).toEqual({ ok: true });
  });

  it('son Owner düşürülemez veya çıkarılamaz', () => {
    expect(
      checkMemberChange({
        actorRole: 'OWNER',
        targetRole: 'OWNER',
        newRole: 'ADMIN',
        ownerCount: 1,
      }),
    ).toEqual({ ok: false, code: 'LAST_OWNER' });
    expect(
      checkMemberChange({ actorRole: 'OWNER', targetRole: 'OWNER', newRole: null, ownerCount: 1 }),
    ).toEqual({ ok: false, code: 'LAST_OWNER' });
  });

  it('başka Owner varken bir Owner düşürülebilir', () => {
    expect(
      checkMemberChange({
        actorRole: 'OWNER',
        targetRole: 'OWNER',
        newRole: 'MEMBER',
        ownerCount: 2,
      }),
    ).toEqual({ ok: true });
  });
});
