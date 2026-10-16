import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  MeResponse,
  RolesResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };

describe('Özel roller ve izin matrisi (ADR-112)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const roles = async () =>
    ((await owner.get(api('/roles')).expect(200)).body as RolesResponse).roles;
  const byKey = async (key: string) => (await roles()).find((r) => r.key === key)!;
  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const createRole = (body: Record<string, unknown>) => owner.post(api('/roles'), body);
  const memberOf = async (spaceId: string, roleKey: string) => {
    const client = await inviteAndAccept(ctx, owner, ws, ELIF);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } });
    await owner.put(api(`/spaces/${spaceId}/members/${user.id}`), { role: roleKey }).expect(204);
    return { client, id: user.id };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
  });

  it('sistem rolleri listelenir; yalnızca ayar yetkisi olan değiştirebilir', async () => {
    const list = await roles();
    expect(list.filter((r) => r.scope === 'WORKSPACE').map((r) => r.key)).toEqual(
      expect.arrayContaining(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']),
    );
    expect(list.filter((r) => r.scope === 'SPACE')).toHaveLength(4);
    expect(list.every((r) => r.isSystem)).toBe(true);
    expect((await byKey('OWNER')).memberCount).toBe(1);

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/roles')).expect(200);
    await elif
      .post(api('/roles'), { scope: 'SPACE', name: 'QA', permissions: ['space.view'] })
      .expect(403);
  });

  it('özel Space rolü: oluştur, ata, izinler uygulanır, ad tekrarı ve geçersiz izin reddedilir', async () => {
    const s = await space();
    const created = await createRole({
      scope: 'SPACE',
      name: 'QA',
      description: 'Test mühendisi',
      permissions: ['space.view', 'comment.write', 'report.view'],
    }).expect(201);
    const roleId = (created.body as Created).id;
    const role = (await roles()).find((r) => r.id === roleId)!;
    expect(role).toMatchObject({ name: 'QA', isSystem: false, scope: 'SPACE', memberCount: 0 });
    expect(role.key).toMatch(/^custom_/);

    expect(
      (await createRole({ scope: 'SPACE', name: 'qa', permissions: ['space.view'] }).expect(409))
        .body,
    ).toEqual({ code: 'ROLE_NAME_TAKEN' });
    expect(
      (
        await createRole({ scope: 'SPACE', name: 'X', permissions: ['space.view', 'yok'] }).expect(
          409,
        )
      ).body,
    ).toEqual({ code: 'ROLE_INVALID_PERMISSIONS' });
    expect(
      (await createRole({ scope: 'SPACE', name: 'Y', permissions: ['comment.write'] }).expect(409))
        .body,
    ).toEqual({ code: 'ROLE_GUARDRAIL' });
    expect(
      (
        await createRole({
          scope: 'WORKSPACE',
          name: 'Z',
          permissions: ['workspace.delete'],
        }).expect(409)
      ).body,
    ).toEqual({ code: 'ROLE_GUARDRAIL' });

    const member = await memberOf(s.id, role.key);
    expect((await byKey(role.key)).memberCount).toBe(1);
    // QA yorum yazar ama öğe oluşturamaz.
    await member.client
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'x' })
      .expect(403);
    const item = (
      await owner.post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'T' }).expect(201)
    ).body as CreatedItem;
    await member.client
      .post(api(`/items/${item.id}/comments`), { body: { type: 'doc', content: [] } })
      .expect((res) => {
        expect(res.status).not.toBe(403);
      });
  });

  it('sistem rolü düzenlenir ve varsayılana döner; OWNER kilitli; ADMIN yönetimi kaybedemez', async () => {
    const s = await space();
    const developer = await byKey('DEVELOPER');
    const member = await memberOf(s.id, 'DEVELOPER');
    await member.client
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'a' })
      .expect(201);

    await owner
      .patch(api(`/roles/${developer.id}`), {
        permissions: developer.permissions.filter((p) => p !== 'workItem.write'),
      })
      .expect(204);
    await member.client
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'b' })
      .expect(403);

    await owner.post(api(`/roles/${developer.id}/reset`)).expect(204);
    expect((await byKey('DEVELOPER')).permissions.sort()).toEqual(developer.permissions.sort());
    await member.client
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'c' })
      .expect(201);

    const ownerRole = await byKey('OWNER');
    expect(
      (await owner.patch(api(`/roles/${ownerRole.id}`), { permissions: [] }).expect(403)).body,
    ).toEqual({
      code: 'ROLE_LOCKED',
    });
    const admin = await byKey('ADMIN');
    expect(
      (
        await owner
          .patch(api(`/roles/${admin.id}`), { permissions: ['workspace.members.view'] })
          .expect(409)
      ).body,
    ).toEqual({ code: 'ROLE_GUARDRAIL' });
    // Sistem rolü adı değişmez.
    await owner.patch(api(`/roles/${developer.id}`), { name: 'Dev' }).expect(403);
  });

  it('özel workspace rolü Member katmanında çalışır; atanır ve izinleri uygulanır', async () => {
    const created = await createRole({
      scope: 'WORKSPACE',
      name: 'Denetçi',
      permissions: ['workspace.members.view', 'workspace.audit.view'],
    }).expect(201);
    const roleId = (created.body as Created).id;
    const key = (await roles()).find((r) => r.id === roleId)!.key;

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, key);
    const me = (await elif.get('/api/auth/me').expect(200)).body as MeResponse;
    expect(me.workspaces[0]!.role).toBe(key);
    expect(me.workspaces[0]!.permissions.sort()).toEqual(
      ['workspace.audit.view', 'workspace.members.view'].sort(),
    );
    // Space oluşturma izni yok; Admin ayrıcalığı da yok (Space'leri görmez).
    await elif.post(api('/spaces'), { name: 'S', key: 'SSS', color: '#7C3AED' }).expect(403);
    const s = await space();
    await elif.get(api(`/spaces/${s.id}`)).expect(200); // açık Space: Stakeholder olarak görünür
    await elif.patch(api(`/spaces/${s.id}`), { name: 'Yeni' }).expect(403);
  });

  it('özel rol silme: kullanımdaysa devir gerekir; sistem rolü silinemez', async () => {
    const s = await space();
    const created = await createRole({
      scope: 'SPACE',
      name: 'Tasarımcı',
      permissions: ['space.view', 'comment.write'],
    }).expect(201);
    const roleId = (created.body as Created).id;
    const key = (await roles()).find((r) => r.id === roleId)!.key;
    const member = await memberOf(s.id, key);

    expect((await owner.delete(api(`/roles/${roleId}`)).expect(409)).body).toEqual({
      code: 'ROLE_IN_USE',
    });
    const stakeholder = await byKey('STAKEHOLDER');
    await owner.delete(api(`/roles/${roleId}?reassignToRoleId=${stakeholder.id}`)).expect(204);
    expect((await roles()).some((r) => r.id === roleId)).toBe(false);
    const members = (await owner.get(api(`/spaces/${s.id}/members`)).expect(200)).body as {
      members: Array<{ userId: string; role: string }>;
    };
    expect(members.members.find((m) => m.userId === member.id)!.role).toBe('STAKEHOLDER');

    const system = await byKey('DEVELOPER');
    expect((await owner.delete(api(`/roles/${system.id}`)).expect(403)).body).toEqual({
      code: 'ROLE_LOCKED',
    });
    // Kullanılmayan özel rol doğrudan silinir.
    const again = await createRole({
      scope: 'SPACE',
      name: 'Boş',
      permissions: ['space.view'],
    }).expect(201);
    await owner.delete(api(`/roles/${(again.body as Created).id}`)).expect(204);
  });

  it('olmayan rol anahtarı atanamaz', async () => {
    const s = await space();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    void elif;
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } });
    expect(
      (
        await owner
          .put(api(`/spaces/${s.id}/members/${user.id}`), { role: 'custom_yok' })
          .expect(404)
      ).body,
    ).toEqual({ code: 'ROLE_NOT_FOUND' });
  });
});
