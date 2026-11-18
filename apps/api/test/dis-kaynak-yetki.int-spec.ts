import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  OutsourceAccessResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const DIS = { email: 'dis@example.com', name: 'Dış Kaynak', password: 'dis-pass-12345' };
const SM = { email: 'sm@example.com', name: 'Sinan Master', password: 'sm-pass-12345' };
const UYE = { email: 'uye@example.com', name: 'Üye Kişi', password: 'uye-pass-12345' };

const ACCESS = (over: object = {}) => ({
  items: 'READ',
  comments: 'NONE',
  docs: 'NONE',
  videos: 'NONE',
  reports: 'NONE',
  ...over,
});

/** Dış kaynak yetkisi kişi ve Proje bazlıdır (ADR-172). */
describe('Dış kaynak: kişi ve Proje bazlı yetki', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

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

  const space = async (key: string) => {
    const id = (
      (await owner.post(api('/spaces'), { name: key, key, color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const permsIn = async (c: Client, spaceId: string) =>
    ((await c.get(api(`/spaces/${spaceId}`)).expect(200)).body as { permissions: string[] })
      .permissions;

  it('Projeye atanmayan dış kaynak hiçbir Proje görmez; atanınca varsayılan yalnızca okur', async () => {
    const a = await space('AAA');
    const dis = await inviteAndAccept(ctx, owner, ws, DIS, 'GUEST', [a.id]);
    const b = await space('BBB');

    await dis.get(api(`/spaces/${b.id}`)).expect(404);
    const perms = await permsIn(dis, a.id);
    expect(perms).toContain('space.view');
    expect(perms).not.toContain('workItem.write');
    expect(perms).not.toContain('doc.view');

    const tree = (await dis.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    expect(tree.spaces.map((s) => s.id)).toEqual([a.id]);
  });

  it('yetki her Projede farklıdır; Scrum Master ayarlar, yazma açılınca öğe oluşturabilir', async () => {
    const a = await space('AAA');
    const b = await space('BBB');
    const dis = await inviteAndAccept(ctx, owner, ws, DIS, 'GUEST', [a.id]);
    await owner
      .put(api(`/spaces/${b.id}/members/${await userId(DIS.email)}`), { role: 'PROJECT_MEMBER' })
      .expect(204);
    const sm = await inviteAndAccept(ctx, owner, ws, SM, 'MEMBER', [a.id, b.id]);
    await owner
      .put(api(`/spaces/${a.id}/scrum-roles`), {
        productOwnerId: null,
        scrumMasterId: await userId(SM.email),
      })
      .expect(204);

    // A'da Scrum Master dış kaynağa yazma verir; B'de varsayılan kalır.
    const disId = await userId(DIS.email);
    await dis
      .post(api(`/lists/${a.listId}/items`), { type: 'TASK', title: 'Yetkisiz' })
      .expect(403);
    await sm
      .put(api(`/spaces/${a.id}/outsource-access/${disId}`), {
        access: ACCESS({ items: 'WRITE', comments: 'WRITE' }),
      })
      .expect(204);

    await dis
      .post(api(`/lists/${a.listId}/items`), { type: 'TASK', title: 'Yazabilir' })
      .expect(201);
    await dis
      .post(api(`/lists/${b.listId}/items`), { type: 'TASK', title: 'B yazamaz' })
      .expect(403);

    const listed = (await sm.get(api(`/spaces/${a.id}/outsource-access`)).expect(200))
      .body as OutsourceAccessResponse;
    expect(listed.people.map((p) => p.userId)).toEqual([disId]);
    expect(listed.people[0]!.access.items).toBe('WRITE');
    // B'nin Scrum Master'ı olmayan SM, B'de ayarlayamaz.
    await sm
      .put(api(`/spaces/${b.id}/outsource-access/${disId}`), { access: ACCESS({ items: 'WRITE' }) })
      .expect(403);
  });

  it('doküman/video/rapor alan bazında açılır; yönetici izni hiçbir ayarla gelmez', async () => {
    const a = await space('AAA');
    const dis = await inviteAndAccept(ctx, owner, ws, DIS, 'GUEST', [a.id]);
    const disId = await userId(DIS.email);
    await owner
      .put(api(`/spaces/${a.id}/outsource-access/${disId}`), {
        access: ACCESS({ items: 'WRITE', docs: 'READ', videos: 'WRITE', reports: 'READ' }),
      })
      .expect(204);
    const perms = await permsIn(dis, a.id);
    expect(perms).toEqual(
      expect.arrayContaining(['doc.view', 'video.view', 'video.create', 'report.view']),
    );
    expect(perms).not.toContain('doc.edit');
    for (const forbidden of [
      'space.settings',
      'sprint.plan',
      'bug.assign',
      'workItem.access.manage',
    ]) {
      expect(perms).not.toContain(forbidden);
    }
  });

  it('yetkiyi yalnızca Scrum Master, Proje yöneticisi ya da Super Admin ayarlar; Dış kaynak olmayana ayarlanmaz', async () => {
    const a = await space('AAA');
    await inviteAndAccept(ctx, owner, ws, DIS, 'GUEST', [a.id]);
    const uye = await inviteAndAccept(ctx, owner, ws, UYE, 'MEMBER', [a.id]);
    const disId = await userId(DIS.email);
    const res = await uye
      .put(api(`/spaces/${a.id}/outsource-access/${disId}`), { access: ACCESS() })
      .expect(403);
    expect((res.body as { code: string }).code).toBe('OUTSOURCE_ACCESS_FORBIDDEN');
    await uye.get(api(`/spaces/${a.id}/outsource-access`)).expect(403);

    const notOut = await owner
      .put(api(`/spaces/${a.id}/outsource-access/${await userId(UYE.email)}`), { access: ACCESS() })
      .expect(403);
    expect((notOut.body as { code: string }).code).toBe('NOT_OUTSOURCE');
  });

  it('Dış kaynağı Projeye yalnızca Super Admin atar; Proje Yöneticisi atayamaz', async () => {
    const a = await space('AAA');
    const b = await space('BBB');
    await inviteAndAccept(ctx, owner, ws, DIS, 'GUEST', [a.id]);
    const pm = await inviteAndAccept(ctx, owner, ws, UYE, 'MEMBER', [b.id]);
    const pmRole = await ctx.prisma.role.findFirstOrThrow({
      where: { scope: 'SPACE', key: 'PROJECT_MANAGER' },
    });
    await ctx.prisma.spaceMember.updateMany({
      where: { spaceId: b.id, userId: await userId(UYE.email) },
      data: { roleId: pmRole.id },
    });
    const res = await pm
      .put(api(`/spaces/${b.id}/members/${await userId(DIS.email)}`), { role: 'PROJECT_MEMBER' })
      .expect(403);
    expect((res.body as { code: string }).code).toBe('VIEWER_ADMIN_ONLY');
    await owner
      .put(api(`/spaces/${b.id}/members/${await userId(DIS.email)}`), { role: 'PROJECT_MEMBER' })
      .expect(204);
    const row = await ctx.prisma.spaceMember.findFirstOrThrow({
      where: { spaceId: b.id, userId: await userId(DIS.email) },
    });
    expect(row.outsourceAccess).toMatchObject({ items: 'READ', docs: 'NONE' });
  });

  it('öğeye özel erişim, dış kaynağın Proje yetkisini aşamaz', async () => {
    const a = await space('AAA');
    const dis = await inviteAndAccept(ctx, owner, ws, DIS, 'GUEST', [a.id]);
    const item = (
      await owner.post(api(`/lists/${a.listId}/items`), { type: 'TASK', title: 'Özel' }).expect(201)
    ).body as CreatedItem;
    await owner
      .put(api(`/items/${item.id}/access`), {
        isPrivate: false,
        entries: [{ userId: await userId(DIS.email), roleKey: 'PROJECT_MEMBER' }],
      })
      .expect((r) => expect([200, 204]).toContain(r.status));
    const detail = (await dis.get(api(`/items/${item.id}`)).expect(200)).body as {
      permissions?: string[];
    };
    if (detail.permissions) {
      expect(detail.permissions).not.toContain('workItem.write');
      expect(detail.permissions).not.toContain('space.settings');
    }
    await dis.patch(api(`/items/${item.id}`), { title: 'Değişti' }).expect(403);
  });
});
