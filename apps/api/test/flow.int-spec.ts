import {
  addDays,
  localDate,
  REPORT_TIME_ZONE,
  type Created,
  type CreatedItem,
  type Flow,
  type HierarchyResponse,
  type SpaceDetail,
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
const TODAY = localDate(new Date(), REPORT_TIME_ZONE);
const daysAgo = (n: number) => new Date(`${addDays(TODAY, -n)}T12:00:00Z`);

describe('Akış raporları: CFD, throughput, cycle time, bug trendi (gerçek veritabanı)', () => {
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
      active: detail.statuses.find((x) => x.category === 'ACTIVE')!.id,
      done: detail.statuses.find((x) => x.category === 'DONE')!.id,
    };
  };
  const item = async (listId: string, type: string, title: string) =>
    (await owner.post(api(`/lists/${listId}/items`), { type, title }).expect(201))
      .body as CreatedItem;
  const flow = async (spaceId: string, query = '', client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/flow${query}`)).expect(200)).body as Flow;

  /** Öğenin oluşturulma, Active ve Done anlarını geçmişe taşır (olay günleri dahil). */
  async function backdate(itemId: string, created: number, active: number, done: number) {
    await ctx.prisma.workItem.update({
      where: { id: itemId },
      data: { createdAt: daysAgo(created), completedAt: daysAgo(done) },
    });
    const events = await ctx.prisma.activityEvent.findMany({
      where: { entityId: itemId, action: 'item.updated' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events).toHaveLength(2);
    await ctx.prisma.activityEvent.update({
      where: { id: events[0]!.id },
      data: { createdAt: daysAgo(active) },
    });
    await ctx.prisma.activityEvent.update({
      where: { id: events[1]!.id },
      data: { createdAt: daysAgo(done) },
    });
  }

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

  it('CFD gün gün kategori sayılarını geçmişten kurar', async () => {
    const s = await space();
    const a = await item(s.listId, 'TASK', 'A');
    await item(s.listId, 'TASK', 'B');
    await owner.patch(api(`/items/${a.id}`), { statusId: s.active }).expect(204);
    await owner.patch(api(`/items/${a.id}`), { statusId: s.done }).expect(204);
    await backdate(a.id, 10, 6, 2);
    await ctx.prisma.workItem.updateMany({
      where: { title: 'B' },
      data: { createdAt: daysAgo(4) },
    });

    const data = await flow(s.id, '?days=14');
    expect(data.cfd.days).toHaveLength(14);
    expect(data.cfd.days.at(-1)).toBe(TODAY);
    const at = (n: number) => data.cfd.days.indexOf(addDays(TODAY, -n));
    // 8 gün önce: A henüz Active'e geçmedi.
    expect([data.cfd.notStarted[at(8)], data.cfd.active[at(8)], data.cfd.done[at(8)]]).toEqual([
      1, 0, 0,
    ]);
    // 5 gün önce: A Active; B (4 gün önce açıldı) henüz yok.
    expect([data.cfd.notStarted[at(5)], data.cfd.active[at(5)], data.cfd.done[at(5)]]).toEqual([
      0, 1, 0,
    ]);
    // 3 gün önce: B açıldı.
    expect([data.cfd.notStarted[at(3)], data.cfd.active[at(3)], data.cfd.done[at(3)]]).toEqual([
      1, 1, 0,
    ]);
    // bugün: A bitti.
    expect([data.cfd.notStarted[at(0)], data.cfd.active[at(0)], data.cfd.done[at(0)]]).toEqual([
      1, 0, 1,
    ]);
  });

  it('lead/cycle time ve throughput tamamlanan işten hesaplanır', async () => {
    const s = await space();
    const a = await item(s.listId, 'TASK', 'A');
    await owner.patch(api(`/items/${a.id}`), { statusId: s.active }).expect(204);
    await owner.patch(api(`/items/${a.id}`), { statusId: s.done }).expect(204);
    await backdate(a.id, 10, 6, 2);

    const data = await flow(s.id, '?days=30');
    expect(data.cycle).toMatchObject({
      sample: 1,
      leadAvg: 8,
      cycleAvg: 4,
      cycleMedian: 4,
      cycleP85: 4,
    });
    expect(data.throughput.reduce((sum, w) => sum + w.count, 0)).toBe(1);
  });

  it('bug’lar haftalık açılan ve kapanan olarak ayrılır; Epic sayılmaz', async () => {
    const s = await space();
    const bug = await item(s.listId, 'BUG', 'Hata');
    await item(s.listId, 'EPIC', 'Epic');
    await owner.patch(api(`/items/${bug.id}`), { statusId: s.active }).expect(204);
    await owner.patch(api(`/items/${bug.id}`), { statusId: s.done }).expect(204);

    const data = await flow(s.id);
    expect(data.bugs.opened.reduce((sum, w) => sum + w.count, 0)).toBe(1);
    expect(data.bugs.closed.reduce((sum, w) => sum + w.count, 0)).toBe(1);
    expect(data.cfd.notStarted.at(-1)! + data.cfd.active.at(-1)! + data.cfd.done.at(-1)!).toBe(1);
  });

  it('aralık sınırı dışındaki gün sayısı reddedilir; özel Space kapalı', async () => {
    const s = await space();
    await owner.get(api(`/spaces/${s.id}/flow?days=3`)).expect(422);
    await owner.get(api(`/spaces/${s.id}/flow?days=500`)).expect(422);
    const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api(`/spaces/${hidden.id}/flow`)).expect(404);
    expect((await flow(s.id, '', elif)).cycle.sample).toBe(0);
  });
});
