import { describe, expect, it } from 'vitest';
import { scopeArgs, TenantScopeError } from './tenant-scope';

const WS = '00000000-0000-7000-8000-000000000001';

describe('scopeArgs', () => {
  it('kiracı olmayan modele dokunmaz', () => {
    const args = { where: { id: 'x' } };
    expect(scopeArgs('User', 'findMany', args, WS)).toBe(args);
  });

  it('okuma ve yazma sorgularına workspaceId koşulu ekler', () => {
    for (const op of ['findMany', 'findFirst', 'findUnique', 'count', 'update', 'deleteMany']) {
      expect(scopeArgs('Membership', op, { where: { userId: 'u' } }, WS)).toEqual({
        where: { userId: 'u', workspaceId: WS },
      });
    }
  });

  it('argümansız findMany de kapsama alınır', () => {
    expect(scopeArgs('Invitation', 'findMany', undefined, WS)).toEqual({
      where: { workspaceId: WS },
    });
  });

  it('istemci başka bir workspaceId verse bile koşul ezilir', () => {
    expect(scopeArgs('Membership', 'findMany', { where: { workspaceId: 'baska' } }, WS)).toEqual({
      where: { workspaceId: WS },
    });
  });

  it('create ve createMany kayıtlarına workspaceId yazar', () => {
    expect(scopeArgs('ActivityEvent', 'create', { data: { action: 'a' } }, WS)).toEqual({
      data: { action: 'a', workspaceId: WS },
    });
    expect(scopeArgs('Role', 'createMany', { data: [{ key: 'A' }, { key: 'B' }] }, WS)).toEqual({
      data: [
        { key: 'A', workspaceId: WS },
        { key: 'B', workspaceId: WS },
      ],
    });
  });

  it('başka workspace adına oluşturmayı reddeder', () => {
    expect(() =>
      scopeArgs('Role', 'create', { data: { key: 'A', workspaceId: 'baska' } }, WS),
    ).toThrow(TenantScopeError);
  });
});
