import type { Created, CreatedItem, Gantt, HierarchyResponse, SpaceDetail } from '@scrum/shared';
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

describe('Gantt, bağımlılık ve kritik yol (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
      .expect(201);
    const id = (res.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return {
      id,
      listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id,
      statuses: detail.statuses,
    };
  };
  const task = async (listId: string, title: string, startDate?: string, dueDate?: string) =>
    (
      await owner
        .post(api(`/lists/${listId}/items`), {
          type: 'TASK',
          title,
          ...(startDate && { startDate }),
          ...(dueDate && { dueDate }),
        })
        .expect(201)
    ).body as CreatedItem;
  const blocks = (from: string, to: string) =>
    owner.post(api(`/items/${from}/links`), { targetId: to, relation: 'BLOCKS' });
  const gantt = async (spaceId: string, client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/gantt`)).expect(200)).body as Gantt;

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

  it('tarihli işler listelenir, tarihsiz ve bağımsız olanlar listelenmez', async () => {
    const s = await space();
    await task(s.listId, 'Tarihli', '2026-10-05', '2026-10-09');
    await task(s.listId, 'Tek tarih', undefined, '2026-10-12');
    await task(s.listId, 'Tarihsiz');

    const data = await gantt(s.id);
    expect(data.items.map((i) => i.title).sort()).toEqual(['Tarihli', 'Tek tarih']);
    expect(data).toMatchObject({
      dependencies: [],
      criticalPath: [],
      hasCycle: false,
      violations: [],
      canEdit: true,
    });
  });

  it('bağımlılıktaki tarihsiz iş de listelenir; kritik yol en uzun zincirdir', async () => {
    const s = await space();
    const a = await task(s.listId, 'A', '2026-10-05', '2026-10-07');
    const b = await task(s.listId, 'B', '2026-10-08', '2026-10-09');
    const c = await task(s.listId, 'C');
    const d = await task(s.listId, 'D', '2026-10-12', '2026-10-15');
    await blocks(a.id, b.id).expect(201);
    await blocks(a.id, c.id).expect(201);
    await blocks(b.id, d.id).expect(201);
    await blocks(c.id, d.id).expect(201);

    const data = await gantt(s.id);
    expect(data.items).toHaveLength(4);
    expect(data.dependencies).toHaveLength(4);
    expect(data.criticalPath).toEqual([a.id, b.id, d.id]);
    expect(data.criticalDays).toBe(9);
    expect(data.violations).toEqual([]);
  });

  it('öncülü bitmeden başlayan ardıl çakışma olarak işaretlenir', async () => {
    const s = await space();
    const a = await task(s.listId, 'A', '2026-10-05', '2026-10-09');
    const b = await task(s.listId, 'B', '2026-10-08', '2026-10-12');
    await blocks(a.id, b.id).expect(201);

    const data = await gantt(s.id);
    expect(data.violations).toEqual([{ from: a.id, to: b.id }]);
  });

  it('Epic ilerlemesi alt öğelerden gelir; biten iş %100', async () => {
    const s = await space();
    const done = s.statuses.find((x) => x.category === 'DONE')!.id;
    const epic = (
      await owner
        .post(api(`/lists/${s.listId}/items`), {
          type: 'EPIC',
          title: 'E',
          startDate: '2026-10-01',
          dueDate: '2026-10-30',
        })
        .expect(201)
    ).body as CreatedItem;
    const story = (
      await owner
        .post(api(`/lists/${s.listId}/items`), {
          type: 'STORY',
          title: 'S',
          parentId: epic.id,
          points: 5,
          startDate: '2026-10-05',
          dueDate: '2026-10-09',
        })
        .expect(201)
    ).body as CreatedItem;
    await owner.patch(api(`/items/${story.id}`), { statusId: done }).expect(204);

    const data = await gantt(s.id);
    const byTitle = new Map(data.items.map((i) => [i.title, i]));
    expect(byTitle.get('E')).toMatchObject({ type: 'EPIC', progress: 100, parentId: null });
    expect(byTitle.get('S')).toMatchObject({ progress: 100, parentId: epic.id, category: 'DONE' });
  });

  it('silinen işler ve başka Space bağlantıları dahil edilmez', async () => {
    const s = await space();
    const other = await space({ name: 'Web', key: 'WEB' });
    const a = await task(s.listId, 'A', '2026-10-05', '2026-10-06');
    const b = await task(s.listId, 'B', '2026-10-07', '2026-10-08');
    const outside = await task(other.listId, 'Dış', '2026-10-09', '2026-10-10');
    await blocks(a.id, b.id).expect(201);
    await blocks(b.id, outside.id).expect(201);

    let data = await gantt(s.id);
    expect(data.dependencies).toEqual([{ from: a.id, to: b.id }]);

    await owner.delete(api(`/items/${b.id}`)).expect(204);
    data = await gantt(s.id);
    expect(data.items.map((i) => i.title)).toEqual(['A']);
    expect(data.dependencies).toEqual([]);
  });

  it('Stakeholder salt okunur görür; özel Space üye olmayana kapalı', async () => {
    const s = await space();
    await task(s.listId, 'A', '2026-10-05', '2026-10-06');
    const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);

    expect((await gantt(s.id, elif)).canEdit).toBe(false);
    await elif.get(api(`/spaces/${hidden.id}/gantt`)).expect(404);

    await owner.post(api(`/spaces/${s.id}/archive`), {}).expect(204);
    expect((await gantt(s.id)).canEdit).toBe(false);
  });
});
