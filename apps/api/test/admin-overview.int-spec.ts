import type {
  AdminOverview,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
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

/** ADR-139: yönetici paneli verisi. */
describe('Yönetici paneli (gerçek veritabanı)', { timeout: 30_000 }, () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

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

  const overview = async (client = owner) =>
    (await client.get(api('/admin/overview')).expect(200)).body as AdminOverview;

  it('Bug akışı, proje/sprint ilerlemesi, geciken işler ve ekip yükü hesaplanır', async () => {
    const created = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const spaceId = (created.body as Created).id;
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const done = detail.statuses.find((s) => s.category === 'DONE')!;
    const item = async (body: Record<string, unknown>) =>
      (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;

    const me = (await owner.get('/api/auth/me').expect(200)).body as { user: { id: string } };
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    const bugOpen = await item({ type: 'BUG', title: 'Açık hata', severity: 'CRITICAL' });
    const bugDone = await item({ type: 'BUG', title: 'Çözülen hata', severity: 'MINOR' });
    await owner.patch(api(`/items/${bugDone.id}`), { statusId: done.id }).expect(204);
    const taskOverdue = await item({
      type: 'TASK',
      title: 'Geciken',
      dueDate: yesterday,
      assigneeIds: [me.user.id],
    });
    const taskDone = await item({ type: 'TASK', title: 'Biten' });
    const taskPlain = await item({ type: 'TASK', title: 'Normal' });

    // Aktif sprint: 3 iş, 1'i tamamlanmış.
    const sprint = (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name: 'Sprint 1',
          goal: 'Hedef',
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10),
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), {
        itemIds: [taskOverdue.id, taskDone.id, taskPlain.id],
        sprintId: sprint.id,
      })
      .expect(204);
    await owner.post(api(`/sprints/${sprint.id}/start`), {}).expect(204);
    await owner.patch(api(`/items/${taskDone.id}`), { statusId: done.id }).expect(204);

    const res = await overview();
    expect(res.bugs).toMatchObject({
      total: 2,
      open: 1,
      resolved: 1,
      openUnassigned: 1,
      newToday: 2,
      newThisWeek: 2,
      resolvedToday: 1,
      resolutionRate: 50,
      inboxPending: 0,
      bySource: { email: 0, manual: 2 },
    });
    expect(res.bugs.openBySeverity.find((s) => s.severity === 'CRITICAL')!.count).toBe(1);
    expect(res.bugs.openBySeverity.find((s) => s.severity === 'MINOR')!.count).toBe(0);
    expect(res.bugs.daily).toHaveLength(14);
    expect(res.bugs.daily.at(-1)).toMatchObject({ opened: 2, resolved: 1 });
    expect(res.bugs.avgResolutionHours).not.toBeNull();

    expect(res.totals).toMatchObject({
      projects: 1,
      members: 1,
      openItems: 3,
      overdueItems: 1,
      completedThisWeek: 2,
    });
    const project = res.projects.find((p) => p.key === 'MOB')!;
    expect(project).toMatchObject({ openItems: 3, doneItems: 2, overdueItems: 1, openBugs: 1 });
    expect(project.sprint).toMatchObject({ name: 'Sprint 1', totalItems: 3, doneItems: 1 });
    expect(project.sprint!.daysLeft).toBeGreaterThan(0);
    expect(res.workload).toEqual([
      expect.objectContaining({ userId: me.user.id, open: 1, overdue: 1 }),
    ]);
    expect(res.throughput.at(-1)!.completed).toBe(2);
    expect(bugOpen.key).toBeTruthy();

    // "Bugün": iki Bug açıldı, bir Bug ve bir Task bitti; yeniden eskiye sıralı.
    const opened = res.today.filter((e) => e.kind === 'opened');
    const completed = res.today.filter((e) => e.kind === 'completed');
    expect(opened.map((e) => e.key).sort()).toEqual([bugOpen.key, bugDone.key].sort());
    expect(opened.find((e) => e.key === bugOpen.key)).toMatchObject({
      type: 'BUG',
      severity: 'CRITICAL',
    });
    expect(completed.map((e) => e.key).sort()).toEqual([bugDone.key, taskDone.key].sort());
    expect(completed.find((e) => e.key === taskDone.key)!.severity).toBeNull();
    const times = res.today.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('yalnızca Owner/Admin görür; Member erişemez', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api('/admin/overview')).expect(403);
  });
});
