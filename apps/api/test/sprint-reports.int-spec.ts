import {
  addDays,
  localDate,
  REPORT_TIME_ZONE,
  type Created,
  type CreatedItem,
  type HierarchyResponse,
  type SpaceDetail,
  type SprintBurndown,
  type VelocityResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SprintReportsService } from '../src/modules/sprints/sprint-reports.service';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

const TODAY = localDate(new Date(), REPORT_TIME_ZONE);

describe('Sprint raporları: burndown ve velocity (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === id)!.lists[0]!.id;
    return { id, listId, statuses: detail.statuses };
  };
  const item = async (listId: string, points: number) =>
    (
      await owner
        .post(api(`/lists/${listId}/items`), { type: 'STORY', title: `Hikaye ${points}`, points })
        .expect(201)
    ).body as CreatedItem;
  const sprint = async (spaceId: string, name = 'Sprint 1') =>
    (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name,
          goal: 'Hedef',
          startDate: TODAY,
          endDate: addDays(TODAY, 9),
        })
        .expect(201)
    ).body as Created;
  const move = (spaceId: string, itemIds: string[], sprintId: string | null) =>
    owner.post(api(`/spaces/${spaceId}/backlog/move`), { itemIds, sprintId }).expect(204);
  const burndown = async (id: string) =>
    (await owner.get(api(`/sprints/${id}/burndown`)).expect(200)).body as SprintBurndown;
  const velocity = async (spaceId: string) =>
    (await owner.get(api(`/spaces/${spaceId}/velocity`)).expect(200)).body as VelocityResponse;
  const setStatus = (itemId: string, statusId: string) =>
    owner.patch(api(`/items/${itemId}`), { statusId }).expect(204);

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

  async function activeSprint() {
    const s = await space();
    const a = await item(s.listId, 5);
    const b = await item(s.listId, 3);
    const { id } = await sprint(s.id);
    await move(s.id, [a.id, b.id], id);
    await owner.post(api(`/sprints/${id}/start`), {}).expect(204);
    const done = s.statuses.find((x) => x.category === 'DONE')!.id;
    return { s, id, a, b, done };
  }

  it("planlı sprint'in burndown'ı boştur", async () => {
    const s = await space();
    const { id } = await sprint(s.id);
    const result = await burndown(id);
    expect(result.points).toEqual([]);
    expect(result.currentRemaining).toBeNull();
  });

  it('başlatma ilk görüntüyü yazar: baseline toplam puandır', async () => {
    const { id } = await activeSprint();
    const result = await burndown(id);
    expect(result.baseline).toBe(8);
    expect(result.currentRemaining).toBe(8);
    expect(result.points).toHaveLength(10);
    expect(result.points[0]).toMatchObject({ date: TODAY, ideal: 8, remaining: 8, scopeChange: 0 });
    expect(result.points.at(-1)).toMatchObject({ ideal: 0, remaining: null });
  });

  it('biten iş kalan puanı düşürür; bugünün noktası canlıdır', async () => {
    const { s, id, a, done } = await activeSprint();
    await setStatus(a.id, done);
    const result = await burndown(id);
    expect(result.currentRemaining).toBe(3);
    expect(result.baseline).toBe(8);
    expect(result.points[0]).toMatchObject({ date: TODAY, remaining: 3 });
    expect(s.id).toBeTruthy();
  });

  it("aktif sprint'e sonradan eklenen iş scope change olarak işaretlenir", async () => {
    const { s, id } = await activeSprint();
    const late = await item(s.listId, 2);
    await move(s.id, [late.id], id);
    const result = await burndown(id);
    expect(result.baseline).toBe(8);
    expect(result.currentRemaining).toBe(10);
    expect(result.points[0]).toMatchObject({ scopeChange: 2, remaining: 10 });

    await move(s.id, [late.id], null);
    const after = await burndown(id);
    expect(after.points[0]).toMatchObject({ scopeChange: 0, remaining: 8 });
  });

  it('gece işi aynı gün için tek satır yazar ve günceller', async () => {
    const { id, a, done } = await activeSprint();
    const reports = ctx.app.get(SprintReportsService);
    await setStatus(a.id, done);
    expect(await reports.captureActive()).toBe(1);
    expect(await reports.captureActive()).toBe(1);

    const rows = await ctx.prisma.sprintSnapshot.findMany({ where: { sprintId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ totalPoints: 8, donePoints: 5, remainingPoints: 3 });
  });

  it("tamamlama velocity'yi dondurur; taahhüt başlangıç puanıdır", async () => {
    const { s, id, a, done } = await activeSprint();
    await setStatus(a.id, done);
    await owner.post(api(`/sprints/${id}/complete`), { unfinished: 'BACKLOG' }).expect(204);

    const result = await velocity(s.id);
    expect(result.sprints).toEqual([
      expect.objectContaining({ id, committedPoints: 8, completedPoints: 5 }),
    ]);
    expect(result.average).toBe(5);

    const final = await burndown(id);
    expect(final.currentRemaining).toBeNull();
    expect(final.points.at(-1)?.date).toBe(addDays(TODAY, 9));
    // Bitmeyen 3 puan sprint'ten çıksa da son görüntü kalan işi korur.
    expect(final.points[0]).toMatchObject({ date: TODAY, remaining: 3 });
  });

  it("velocity yalnızca tamamlanmış sprint'leri gösterir", async () => {
    const { s } = await activeSprint();
    const empty = await velocity(s.id);
    expect(empty).toEqual({ sprints: [], average: null });
  });

  it('bilinmeyen sprint 404 döner', async () => {
    await owner.get(api('/sprints/019dd2a0-0000-7000-8000-000000000000/burndown')).expect(404);
  });
});
