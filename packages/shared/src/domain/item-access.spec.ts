import { describe, expect, it } from 'vitest';
import { ALL_SPACE_PERMISSIONS, DEFAULT_SPACE_ROLE_PERMISSIONS } from '../permissions/roles';
import { itemPermissions, type ItemAccessInput } from './item-access';

// Salt okuma izinleri (eski Stakeholder karşılığı).
const STAKEHOLDER = ['space.view', 'comment.write', 'report.view', 'bug.report'];
const DEVELOPER = DEFAULT_SPACE_ROLE_PERMISSIONS.PROJECT_MEMBER;

const base: ItemAccessInput = {
  workspaceRole: 'MEMBER',
  spacePermissions: STAKEHOLDER,
  root: null,
  entryPermissions: null,
  userId: 'u1',
};
const run = (patch: Partial<ItemAccessInput>) => itemPermissions({ ...base, ...patch });

describe('itemPermissions (ADR-113)', () => {
  it('kök yoksa Space izinleri aynen geçerli', () => {
    expect(run({})).toEqual(STAKEHOLDER);
    expect(run({ spacePermissions: null })).toBeNull();
  });

  it('Owner/Admin her zaman her şeyi görür ve yapar', () => {
    const root = { isPrivate: true, createdById: 'baskasi' };
    expect(run({ workspaceRole: 'OWNER', root, spacePermissions: null })).toEqual(
      ALL_SPACE_PERMISSIONS,
    );
    expect(run({ workspaceRole: 'ADMIN', root })).toEqual(ALL_SPACE_PERMISSIONS);
  });

  it('açık kökte listedeki rol Space izinlerine eklenir', () => {
    const permissions = run({
      root: { isPrivate: false, createdById: null },
      entryPermissions: DEVELOPER,
    });
    expect(permissions).toEqual(expect.arrayContaining([...STAKEHOLDER, 'workItem.write']));
    // Girişi olmayan etkilenmez.
    expect(run({ root: { isPrivate: false, createdById: null } })).toEqual(STAKEHOLDER);
  });

  it("açık kök, Space'e erişimi olmayana giriş rolünü verir", () => {
    expect(
      run({
        spacePermissions: null,
        root: { isPrivate: false, createdById: null },
        entryPermissions: STAKEHOLDER,
      }),
    ).toEqual(STAKEHOLDER);
  });

  it('gizli kök: yalnızca girişler; girişin rolü Space izninin yerini alır (kısıtlama)', () => {
    const root = { isPrivate: true, createdById: 'baskasi' };
    expect(run({ root, spacePermissions: DEVELOPER })).toBeNull();
    expect(run({ root, spacePermissions: DEVELOPER, entryPermissions: STAKEHOLDER })).toEqual(
      STAKEHOLDER,
    );
  });

  it('gizli kökü oluşturan Space izinleriyle görmeye devam eder', () => {
    expect(
      run({ root: { isPrivate: true, createdById: 'u1' }, spacePermissions: DEVELOPER }),
    ).toEqual(DEVELOPER);
  });

  it('dış kaynak için giriş izinlerinden yönetici ve içerik izinleri düşer (ADR-152)', () => {
    const permissions = run({
      workspaceRole: 'GUEST',
      root: { isPrivate: true, createdById: null },
      entryPermissions: DEFAULT_SPACE_ROLE_PERMISSIONS.PROJECT_MANAGER,
    });
    expect(permissions).toContain('workItem.write');
    expect(permissions).not.toContain('space.settings');
    expect(permissions).not.toContain('doc.view');
  });
});
