import type { Created, SpaceDetail } from '@scrum/shared';
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

describe('Durumlar: WIP limiti (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    return (res.body as Created).id;
  };
  const detail = async (spaceId: string, client = owner) =>
    (await client.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;

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

  it('varsayılan durumların limiti yok; limit konur ve kaldırılır', async () => {
    const id = await space();
    const before = await detail(id);
    expect(before.statuses.every((s) => s.wipLimit === null)).toBe(true);
    const target = before.statuses[1]!;

    await owner.patch(api(`/spaces/${id}/statuses/${target.id}`), { wipLimit: 3 }).expect(204);
    expect((await detail(id)).statuses[1]!.wipLimit).toBe(3);

    await owner.patch(api(`/spaces/${id}/statuses/${target.id}`), { wipLimit: null }).expect(204);
    expect((await detail(id)).statuses[1]!.wipLimit).toBeNull();
  });

  it('geçersiz limit reddedilir', async () => {
    const id = await space();
    const target = (await detail(id)).statuses[0]!;
    for (const wipLimit of [0, -1, 1000, 1.5]) {
      await owner.patch(api(`/spaces/${id}/statuses/${target.id}`), { wipLimit }).expect(400);
    }
  });

  it('limit işin taşınmasını engellemez', async () => {
    const id = await space();
    const d = await detail(id);
    const list = (
      (await owner.get(api('/hierarchy')).expect(200)).body as {
        spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
      }
    ).spaces.find((s) => s.id === id)!.lists[0]!;
    const column = d.statuses[1]!;
    await owner.patch(api(`/spaces/${id}/statuses/${column.id}`), { wipLimit: 1 }).expect(204);
    for (const title of ['A', 'B']) {
      const item = (
        await owner
          .post(api(`/lists/${list.id}/items`), { title, type: 'TASK', statusId: column.id })
          .expect(201)
      ).body as Created;
      expect(item.id).toBeTruthy();
    }
  });

  it('Space ayarı yetkisi olmayan limit koyamaz; başka Space durumu bulunamaz', async () => {
    const id = await space();
    const other = (
      await owner.post(api('/spaces'), { name: 'Web', key: 'WEB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    const status = (await detail(id)).statuses[0]!;
    await elif.patch(api(`/spaces/${id}/statuses/${status.id}`), { wipLimit: 2 }).expect(403);
    await owner
      .patch(api(`/spaces/${other.id}/statuses/${status.id}`), { wipLimit: 2 })
      .expect(404);
  });
});
