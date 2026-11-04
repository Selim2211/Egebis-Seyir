import type { Created, CreatedItem, HierarchyResponse, ProjectRolesResponse } from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };
const MEHMET = { email: 'mehmet@example.com', name: 'Mehmet Can', password: 'mehmet-pass-1' };

describe('Proje bazında rol ayarı ve Story Point kilidi (ADR-161)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const idOf = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

  /** Projeyi kurar: Elif Proje Yöneticisi, Mehmet Proje Üyesi. */
  const setup = async () => {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', []);
    const mehmet = await inviteAndAccept(ctx, owner, ws, MEHMET, 'MEMBER', []);
    await owner
      .put(api(`/spaces/${spaceId}/members/${await idOf(ELIF.email)}`), {
        role: 'PROJECT_MANAGER',
      })
      .expect(204);
    await owner
      .put(api(`/spaces/${spaceId}/members/${await idOf(MEHMET.email)}`), {
        role: 'PROJECT_MEMBER',
      })
      .expect(204);
    return { spaceId, listId, elif, mehmet };
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

  describe('Story Point kilidi', () => {
    it('üye boş puanı girer; belirlenmiş puanı yalnızca Proje Yöneticisi değiştirir', async () => {
      const { listId, elif, mehmet } = await setup();
      const item = (
        await mehmet.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'İş' }).expect(201)
      ).body as CreatedItem;

      await mehmet.patch(api(`/items/${item.id}`), { points: 3 }).expect(204);
      const res = await mehmet.patch(api(`/items/${item.id}`), { points: 5 }).expect(403);
      expect(res.body).toEqual({ code: 'POINTS_LOCKED' });
      // Aynı değeri yeniden göndermek değişiklik sayılmaz.
      await mehmet.patch(api(`/items/${item.id}`), { points: 3 }).expect(204);

      await elif.patch(api(`/items/${item.id}`), { points: 5 }).expect(204);
      await owner.patch(api(`/items/${item.id}`), { points: 8 }).expect(204);
    });
  });

  describe('rol ayarı', () => {
    it('Proje Yöneticisi üyenin yetkisini Projede kapatır; varsayılana dönünce açılır', async () => {
      const { spaceId, listId, elif, mehmet } = await setup();
      const path = api(`/spaces/${spaceId}/role-permissions`);

      const before = (await elif.get(path).expect(200)).body as ProjectRolesResponse;
      const member = before.roles.find((r) => r.role === 'PROJECT_MEMBER')!;
      expect(member).toMatchObject({ customized: false, editable: true });
      expect(member.permissions).toContain('workItem.write');
      expect(before.roles.find((r) => r.role === 'PROJECT_MANAGER')!.editable).toBe(false);

      await elif
        .put(path, {
          role: 'PROJECT_MEMBER',
          permissions: member.permissions.filter((p) => p !== 'workItem.write'),
        })
        .expect(204);
      await mehmet.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'X' }).expect(403);
      // Görüntüleme rolün kendisinden gelir; kapanmaz.
      await mehmet.get(api(`/spaces/${spaceId}`)).expect(200);

      const after = (await elif.get(path).expect(200)).body as ProjectRolesResponse;
      expect(after.roles.find((r) => r.role === 'PROJECT_MEMBER')!.customized).toBe(true);

      await elif.put(path, { role: 'PROJECT_MEMBER', permissions: null }).expect(204);
      await mehmet.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'X' }).expect(201);
    });

    it('Proje Yöneticisi rolünü yalnızca Super Admin ayarlar; ayar yalnızca o Projeyi etkiler', async () => {
      const { spaceId, elif } = await setup();
      const path = api(`/spaces/${spaceId}/role-permissions`);
      await elif.put(path, { role: 'PROJECT_MANAGER', permissions: [] }).expect(403);
      await owner
        .put(path, { role: 'PROJECT_MANAGER', permissions: ['workItem.write'] })
        .expect(204);
      // Proje ayarları kapanmaz; sprint planlama kapandı.
      await elif.get(path).expect(200);
      await elif
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'S1',
          startDate: '2026-11-02',
          endDate: '2026-11-13',
        })
        .expect(403);
    });

    it('ayarlanamayan izin reddedilir', async () => {
      const { spaceId } = await setup();
      await owner
        .put(api(`/spaces/${spaceId}/role-permissions`), {
          role: 'PROJECT_MEMBER',
          permissions: ['space.settings'],
        })
        .expect(400);
    });
  });
});
