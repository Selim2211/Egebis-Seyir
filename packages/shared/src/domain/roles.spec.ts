import { describe, expect, it } from 'vitest';
import { PERMISSION_CATALOGUE } from '../permissions/catalogue';
import { WORKSPACE_PERMISSIONS as W } from '../permissions/permissions';
import {
  ALL_SPACE_PERMISSIONS,
  DEFAULT_SPACE_ROLE_PERMISSIONS,
  DEFAULT_WORKSPACE_ROLE_PERMISSIONS,
} from '../permissions/roles';
import { validateRolePermissions } from './roles';

describe('izin kataloğu', () => {
  it('her izin tam bir kez ve doğru kapsamda listelenir', () => {
    const keys = PERMISSION_CATALOGUE.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const space = PERMISSION_CATALOGUE.filter((p) => p.scope === 'SPACE').map((p) => p.key);
    expect([...space].sort()).toEqual([...ALL_SPACE_PERMISSIONS].sort());
    const workspace = PERMISSION_CATALOGUE.filter((p) => p.scope === 'WORKSPACE').map((p) => p.key);
    expect([...workspace].sort()).toEqual(Object.values(W).sort());
  });

  it('varsayılan roller kendi doğrulamasından geçer (OWNER hariç)', () => {
    for (const [key, permissions] of Object.entries(DEFAULT_WORKSPACE_ROLE_PERMISSIONS)) {
      if (key === 'OWNER') continue;
      expect(validateRolePermissions({ scope: 'WORKSPACE', systemKey: key, permissions }).ok).toBe(
        true,
      );
    }
    for (const [key, permissions] of Object.entries(DEFAULT_SPACE_ROLE_PERMISSIONS)) {
      expect(validateRolePermissions({ scope: 'SPACE', systemKey: key, permissions }).ok).toBe(
        true,
      );
    }
  });
});

describe('validateRolePermissions', () => {
  const check = (scope: 'WORKSPACE' | 'SPACE', systemKey: string | null, permissions: string[]) =>
    validateRolePermissions({ scope, systemKey, permissions });

  it('bilinmeyen, yinelenen veya yanlış kapsamdaki izni reddeder', () => {
    expect(check('SPACE', null, ['space.view', 'yok'])).toEqual({
      ok: false,
      code: 'ROLE_INVALID_PERMISSIONS',
    });
    expect(check('SPACE', null, ['space.view', 'space.view'])).toMatchObject({ ok: false });
    expect(check('SPACE', null, ['space.view', 'workspace.settings'])).toMatchObject({ ok: false });
  });

  it('OWNER kilitli; özel rol workspace.delete alamaz; ADMIN yönetimi kaybedemez', () => {
    expect(check('WORKSPACE', 'OWNER', [])).toEqual({ ok: false, code: 'ROLE_LOCKED' });
    expect(check('WORKSPACE', null, ['workspace.delete'])).toEqual({
      ok: false,
      code: 'ROLE_GUARDRAIL',
    });
    expect(check('WORKSPACE', 'ADMIN', ['workspace.members.view'])).toEqual({
      ok: false,
      code: 'ROLE_GUARDRAIL',
    });
    expect(check('WORKSPACE', 'ADMIN', ['workspace.members.manage', 'workspace.settings']).ok).toBe(
      true,
    );
  });

  it('her Space rolü space.view içerir', () => {
    expect(check('SPACE', null, ['comment.write'])).toEqual({ ok: false, code: 'ROLE_GUARDRAIL' });
    expect(check('SPACE', null, ['space.view', 'comment.write']).ok).toBe(true);
  });
});
