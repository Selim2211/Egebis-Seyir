import { WIDGET_IDS, type Created, type Dashboard } from '@scrum/shared';
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

describe('Pano düzeni (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) =>
    (
      await owner
        .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
        .expect(201)
    ).body as Created;
  const get = async (spaceId: string, client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/dashboard`)).expect(200)).body as Dashboard;

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

  it('kayıt yokken tüm widget’lar görünür varsayılanla gelir', async () => {
    const s = await space();
    const data = await get(s.id);
    expect(data.widgets.map((w) => w.id)).toEqual([...WIDGET_IDS]);
    expect(data.widgets.every((w) => w.visible)).toBe(true);
  });

  it('düzen kaydedilir; eksik widget’lar sona eklenir, tekrarlar atılır', async () => {
    const s = await space();
    const res = await owner
      .put(api(`/spaces/${s.id}/dashboard`), {
        widgets: [
          { id: 'velocity', size: 'L', visible: true },
          { id: 'cfd', size: 'M', visible: false },
          { id: 'velocity', size: 'M', visible: true },
        ],
      })
      .expect(200);
    const saved = res.body as Dashboard;
    expect(saved.widgets.slice(0, 2)).toEqual([
      { id: 'velocity', size: 'L', visible: true },
      { id: 'cfd', size: 'M', visible: false },
    ]);
    expect(saved.widgets).toHaveLength(WIDGET_IDS.length);
    expect(await get(s.id)).toEqual(saved);
  });

  it('geçersiz widget ya da boyut 400', async () => {
    const s = await space();
    await owner
      .put(api(`/spaces/${s.id}/dashboard`), { widgets: [{ id: 'yok', size: 'M', visible: true }] })
      .expect(400);
    await owner
      .put(api(`/spaces/${s.id}/dashboard`), {
        widgets: [{ id: 'cfd', size: 'XL', visible: true }],
      })
      .expect(400);
  });

  it('düzen kullanıcıya özeldir; özel Space’e yabancı erişemez', async () => {
    const s = await space();
    await owner
      .put(api(`/spaces/${s.id}/dashboard`), {
        widgets: [{ id: 'epics', size: 'L', visible: false }],
      })
      .expect(200);
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const theirs = await get(s.id, elif);
    expect(theirs.widgets[0]).toEqual({ id: 'sprint', size: 'L', visible: true });

    const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
    await elif.get(api(`/spaces/${hidden.id}/dashboard`)).expect(404);
  });
});
