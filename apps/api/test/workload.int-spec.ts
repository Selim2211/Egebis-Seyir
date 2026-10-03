import {
  addDays,
  localDate,
  REPORT_TIME_ZONE,
  type Created,
  type CreatedItem,
  type HierarchyResponse,
  type SpaceDetail,
  type Workload,
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

describe('Kişi bazlı iş yükü (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let ownerId: string;
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
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const workload = async (spaceId: string, query = '', client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/workload${query}`)).expect(200)).body as Workload;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    ownerId = (await ctx.prisma.user.findFirstOrThrow()).id;
  });

  it('açık işler kişi başına toplanır; biten, Epic ve atanmamışlar doğru sayılır', async () => {
    const s = await space();
    const done = s.statuses.find((x) => x.category === 'DONE')!.id;
    await item(s.listId, { type: 'STORY', title: 'Açık', points: 5, assigneeIds: [ownerId] });
    const finished = await item(s.listId, {
      type: 'STORY',
      title: 'Biten',
      points: 8,
      assigneeIds: [ownerId],
    });
    await owner.patch(api(`/items/${finished.id}`), { statusId: done }).expect(204);
    await item(s.listId, { type: 'EPIC', title: 'Epic', assigneeIds: [ownerId] });
    await item(s.listId, { type: 'TASK', title: 'Sahipsiz', estimateHours: 3 });

    const data = await workload(s.id);
    expect(data.sprint).toBeNull();
    const mine = data.rows.find((r) => r.user?.id === ownerId)!;
    expect(mine).toMatchObject({ itemCount: 1, points: 5, remainingMinutes: 0 });
    expect(mine.user?.name).toBe('Zeynep Kaya');
    const unassigned = data.rows.find((r) => r.user === null)!;
    expect(unassigned).toMatchObject({ itemCount: 1, remainingMinutes: 180 });
    expect(data.rows.map((r) => r.user?.id ?? null)).toEqual([null, ownerId]);
  });

  it('kalan süre harcananı düşer; geciken ve yaklaşanlar ayrılır; bu hafta süresi gelir', async () => {
    const s = await space();
    const late = await item(s.listId, {
      type: 'TASK',
      title: 'Geç',
      estimateHours: 4,
      dueDate: addDays(TODAY, -2),
      assigneeIds: [ownerId],
    });
    await item(s.listId, {
      type: 'TASK',
      title: 'Yakında',
      dueDate: addDays(TODAY, 3),
      assigneeIds: [ownerId],
    });
    await owner.post(api(`/items/${late.id}/time`), { day: TODAY, minutes: 60 }).expect(201);

    const mine = (await workload(s.id)).rows.find((r) => r.user?.id === ownerId)!;
    expect(mine).toMatchObject({
      itemCount: 2,
      remainingMinutes: 180,
      overdue: 1,
      dueSoon: 1,
      loggedThisWeekMinutes: 60,
    });
  });

  it('birden çok atanan puanı eşit paylaşır', async () => {
    const s = await space();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    await item(s.listId, {
      type: 'STORY',
      title: 'Ortak',
      points: 5,
      assigneeIds: [ownerId, elifId],
    });

    const data = await workload(s.id, '', elif);
    expect(data.rows).toHaveLength(2);
    for (const row of data.rows) expect(row).toMatchObject({ itemCount: 1, points: 2.5 });
  });

  it('sprint süzgeci yalnızca o sprint işlerini sayar; yabancı sprint 404', async () => {
    const s = await space();
    const inSprint = await item(s.listId, {
      type: 'STORY',
      title: 'S1',
      points: 3,
      assigneeIds: [ownerId],
    });
    await item(s.listId, { type: 'STORY', title: 'Dışarıda', points: 8, assigneeIds: [ownerId] });
    const { id: sprintId } = (
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'Sprint 1',
          goal: 'g',
          startDate: TODAY,
          endDate: addDays(TODAY, 9),
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${s.id}/backlog/move`), { itemIds: [inSprint.id], sprintId })
      .expect(204);

    const scoped = await workload(s.id, `?sprintId=${sprintId}`);
    expect(scoped.sprint).toEqual({ id: sprintId, name: 'Sprint 1' });
    expect(scoped.rows).toHaveLength(1);
    expect(scoped.rows[0]).toMatchObject({ itemCount: 1, points: 3 });

    await owner.get(api(`/spaces/${s.id}/workload?sprintId=${s.id}`)).expect(404);
  });

  it('özel Space iş yükü üye olmayana görünmez', async () => {
    const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api(`/spaces/${hidden.id}/workload`)).expect(404);
  });
});
