import type {
  AutomationRunsResponse,
  AutomationsResponse,
  Created,
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

describe('Otomasyonlar (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    const detail = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
    return {
      id,
      listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id,
      statuses: Object.fromEntries(detail.statuses.map((s) => [s.name, s.id])) as Record<
        string,
        string
      >,
    };
  };
  const addItem = async (listId: string, body: Record<string, unknown> = {}) =>
    (
      (
        await owner
          .post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'İş', ...body })
          .expect(201)
      ).body as Created
    ).id;
  const rule = (spaceId: string, body: Record<string, unknown>) =>
    owner.post(api(`/spaces/${spaceId}/automations`), { name: 'Kural', ...body });
  const runs = async (spaceId: string, id: string) =>
    (await owner.get(api(`/spaces/${spaceId}/automations/${id}/runs`)).expect(200))
      .body as AutomationRunsResponse;
  const item = (id: string) =>
    ctx.prisma.workItem.findUniqueOrThrow({
      where: { id },
      include: { assignees: true, children: true },
    });

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

  it('duruma geçince öncelik, atama, alt görev ve bildirim eylemleri çalışır', async () => {
    const s = await space();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    void elif;
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);

    const created = (
      await rule(s.id, {
        trigger: { type: 'STATUS_CHANGED', toStatusId: s.statuses['İncelemede'] },
        actions: [
          { type: 'SET_PRIORITY', priority: 'HIGH' },
          { type: 'ASSIGN', userId: elifId },
          { type: 'CREATE_SUBTASK', title: 'Kod incelemesi yap' },
          { type: 'NOTIFY', to: 'USER', userId: elifId, message: 'İncelemeye hazır' },
        ],
      }).expect(201)
    ).body as Created;

    const id = await addItem(s.listId);
    await owner.patch(api(`/items/${id}`), { statusId: s.statuses['Devam ediyor'] }).expect(204);
    expect((await runs(s.id, created.id)).runs).toHaveLength(0);

    await owner.patch(api(`/items/${id}`), { statusId: s.statuses['İncelemede'] }).expect(204);
    const after = await item(id);
    expect(after.priority).toBe('HIGH');
    expect(after.assignees.map((a) => a.userId)).toEqual([elifId]);
    expect(after.children.map((c) => c.title)).toEqual(['Kod incelemesi yap']);

    const log = (await runs(s.id, created.id)).runs;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ outcome: 'OK', itemKey: 'MOB-1', message: '4' });

    const note = await ctx.prisma.notification.findFirst({
      where: { userId: elifId, type: 'AUTOMATION' },
    });
    expect(note).not.toBeNull();
  });

  it('koşul eşleşmezse çalışmaz; ITEM_CREATED özel alanı doldurur; devre dışı çalışmaz', async () => {
    const s = await space();
    const field = (
      (
        await owner
          .post(api(`/spaces/${s.id}/custom-fields`), { name: 'Kaynak', type: 'TEXT' })
          .expect(201)
      ).body as Created
    ).id;
    const created = (
      await rule(s.id, {
        trigger: { type: 'ITEM_CREATED' },
        conditions: { types: ['BUG'] },
        actions: [{ type: 'SET_CUSTOM_FIELD', fieldId: field, value: 'Otomatik' }],
      }).expect(201)
    ).body as Created;

    const task = await addItem(s.listId);
    expect((await item(task)).customFields).toEqual({});
    const bug = await addItem(s.listId, { type: 'BUG', title: 'Hata' });
    expect((await item(bug)).customFields).toEqual({ [field]: 'Otomatik' });

    await owner
      .patch(api(`/spaces/${s.id}/automations/${created.id}`), { enabled: false })
      .expect(204);
    const bug2 = await addItem(s.listId, { type: 'BUG', title: 'Hata 2' });
    expect((await item(bug2)).customFields).toEqual({});
    expect((await runs(s.id, created.id)).runs).toHaveLength(1);
  });

  it('döngü koruması: karşılıklı tetikleyen iki kural sonsuza gitmez', async () => {
    const s = await space();
    const a = (
      await rule(s.id, {
        name: 'A',
        trigger: { type: 'PRIORITY_CHANGED', to: 'HIGH' },
        actions: [{ type: 'SET_PRIORITY', priority: 'LOW' }],
      }).expect(201)
    ).body as Created;
    const b = (
      await rule(s.id, {
        name: 'B',
        trigger: { type: 'PRIORITY_CHANGED', to: 'LOW' },
        actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
      }).expect(201)
    ).body as Created;
    const id = await addItem(s.listId);
    await owner.patch(api(`/items/${id}`), { priority: 'HIGH' }).expect(204);

    expect((await item(id)).priority).toBe('HIGH');
    const logA = (await runs(s.id, a.id)).runs;
    const logB = (await runs(s.id, b.id)).runs;
    expect(logB.map((r) => r.outcome)).toEqual(['OK']);
    expect(logA.map((r) => r.outcome).sort()).toEqual(['OK', 'SKIPPED']);
    expect(logA.find((r) => r.outcome === 'SKIPPED')!.message).toBe('LOOP_REPEAT');
  });

  it('kendini tetikleyen kural bir kez çalışır', async () => {
    const s = await space();
    const created = (
      await rule(s.id, {
        trigger: { type: 'STATUS_CHANGED', toStatusId: null },
        actions: [{ type: 'SET_STATUS', statusId: s.statuses['Yapılacak'] }],
      }).expect(201)
    ).body as Created;
    const id = await addItem(s.listId);
    await owner.patch(api(`/items/${id}`), { statusId: s.statuses['İncelemede'] }).expect(204);

    expect((await item(id)).statusId).toBe(s.statuses['Yapılacak']);
    const outcomes = (await runs(s.id, created.id)).runs.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(['OK', 'SKIPPED']);
  });

  it('eylem başarısız olursa günlüğe FAILED yazılır, asıl işlem etkilenmez', async () => {
    const s = await space();
    const created = (
      await rule(s.id, {
        trigger: { type: 'STATUS_CHANGED', toStatusId: s.statuses['İncelemede'] },
        actions: [{ type: 'SET_STATUS', statusId: s.statuses['Tamamlandı'] }],
      }).expect(201)
    ).body as Created;
    const story = await addItem(s.listId, { type: 'STORY', title: 'Üst' });
    await addItem(s.listId, { type: 'TASK', title: 'Açık alt', parentId: story });
    await owner.patch(api(`/items/${story}`), { statusId: s.statuses['İncelemede'] }).expect(204);

    expect((await item(story)).statusId).toBe(s.statuses['İncelemede']);
    const log = (await runs(s.id, created.id)).runs;
    expect(log[0]).toMatchObject({ outcome: 'FAILED', message: 'WORK_ITEM_OPEN_CHILDREN' });
  });

  it('doğrulama: başka Space durumu, geçersiz değer ve yetki', async () => {
    const s = await space();
    const other = (
      await owner.post(api('/spaces'), { name: 'Web', key: 'WEB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    const foreign = ((await owner.get(api(`/spaces/${other.id}`)).expect(200)).body as SpaceDetail)
      .statuses[0]!.id;
    const bad = await rule(s.id, {
      trigger: { type: 'ITEM_CREATED' },
      actions: [{ type: 'SET_STATUS', statusId: foreign }],
    }).expect(422);
    expect(bad.body).toEqual({ code: 'AUTOMATION_INVALID' });
    await rule(s.id, { trigger: { type: 'ITEM_CREATED' }, actions: [] }).expect(400);
    await rule(s.id, {
      trigger: { type: 'ITEM_CREATED' },
      actions: [{ type: 'NOTIFY', to: 'USER', message: 'x' }],
    }).expect(422);

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    await elif
      .post(api(`/spaces/${s.id}/automations`), {
        name: 'Yetkisiz',
        trigger: { type: 'ITEM_CREATED' },
        actions: [{ type: 'SET_PRIORITY', priority: 'LOW' }],
      })
      .expect(403);

    const list = (await owner.get(api(`/spaces/${s.id}/automations`)).expect(200))
      .body as AutomationsResponse;
    expect(list.automations).toHaveLength(0);
  });

  it('otomasyon silinir; günlükleri de gider', async () => {
    const s = await space();
    const created = (
      await rule(s.id, {
        trigger: { type: 'ITEM_CREATED' },
        actions: [{ type: 'SET_PRIORITY', priority: 'URGENT' }],
      }).expect(201)
    ).body as Created;
    const id = await addItem(s.listId);
    expect((await item(id)).priority).toBe('URGENT');
    await owner.delete(api(`/spaces/${s.id}/automations/${created.id}`)).expect(204);
    expect(await ctx.prisma.automationRun.count({ where: { automationId: created.id } })).toBe(0);
  });
});
