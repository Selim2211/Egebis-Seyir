import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  NotificationsResponse,
  RemindersResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RemindersService } from '../src/modules/reminders/reminders.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };
const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

describe('Görev hatırlatıcıları (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let itemId: string;
  let spaceId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const list = async (client = owner) =>
    ((await client.get(api(`/items/${itemId}/reminders`)).expect(200)).body as RemindersResponse)
      .reminders;
  const add = (body: Record<string, unknown>, client = owner) =>
    client.post(api(`/items/${itemId}/reminders`), body);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    spaceId = (
      (
        await owner
          .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
          .expect(201)
      ).body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    itemId = (
      (
        await owner
          .post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'Rapor hazırla' })
          .expect(201)
      ).body as CreatedItem
    ).id;
  });

  it('kurulur, listelenir, silinir; geçmiş ve çok uzak zaman reddedilir', async () => {
    const created = (await add({ remindAt: inHours(2), note: 'Toplantıdan önce bak' }).expect(201))
      .body as Created;
    expect(await list()).toEqual([
      expect.objectContaining({ id: created.id, note: 'Toplantıdan önce bak', sent: false }),
    ]);

    const past = await add({ remindAt: inHours(-1) }).expect(422);
    expect(past.body).toMatchObject({ code: 'REMINDER_IN_PAST' });
    await add({ remindAt: inHours(24 * 400) }).expect(422);
    await add({ remindAt: 'yarın' }).expect(400);
    await add({ remindAt: inHours(3), note: 'x'.repeat(201) }).expect(400);

    await owner.delete(api(`/items/${itemId}/reminders/${created.id}`)).expect(204);
    expect(await list()).toEqual([]);
    await owner.delete(api(`/items/${itemId}/reminders/${created.id}`)).expect(404);
  });

  it('görev başına en çok 10 bekleyen hatırlatıcı', async () => {
    for (let i = 1; i <= 10; i++) await add({ remindAt: inHours(i) }).expect(201);
    const over = await add({ remindAt: inHours(11) }).expect(422);
    expect(over.body).toMatchObject({ code: 'REMINDER_LIMIT' });
  });

  it('herkes yalnızca kendi hatırlatıcısını görür ve silebilir', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const mine = (await add({ remindAt: inHours(2) }).expect(201)).body as Created;
    expect(await list(elif)).toEqual([]);
    await elif.delete(api(`/items/${itemId}/reminders/${mine.id}`)).expect(404);
    expect(await list()).toHaveLength(1);
  });

  it('zamanı gelince bildirim ve e-posta gider; ikinci çalıştırma tekrar göndermez', async () => {
    await add({ remindAt: inHours(1), note: 'Raporu gönder' }).expect(201);
    await add({ remindAt: inHours(30) }).expect(201);
    const service = ctx.app.get(RemindersService);

    expect(await service.sendDue()).toBe(0); // henüz zamanı gelmedi
    expect(await service.sendDue(new Date(Date.now() + 2 * HOUR))).toBe(1);
    expect(await service.sendDue(new Date(Date.now() + 2 * HOUR))).toBe(0);

    const inbox = (await owner.get(api('/notifications')).expect(200))
      .body as NotificationsResponse;
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({
      type: 'REMINDER',
      item: { key: 'MOB-1', title: 'Rapor hazırla' },
      detail: 'Raporu gönder',
    });
    expect(ctx.mail.outbox.at(-1)?.subject).toContain('MOB-1');
    expect((await list()).map((r) => r.sent)).toEqual([true, false]);
  });

  it('bildirim tercihinde kapatılan kanal kullanılmaz; silinen görev için gönderilmez', async () => {
    const service = ctx.app.get(RemindersService);
    await owner
      .put(api('/notifications/preferences'), {
        preferences: [{ type: 'REMINDER', inApp: false, email: false }],
      })
      .expect(204);
    await add({ remindAt: inHours(1) }).expect(201);
    expect(await service.sendDue(new Date(Date.now() + 2 * HOUR))).toBe(1);
    const inbox = (await owner.get(api('/notifications')).expect(200))
      .body as NotificationsResponse;
    expect(inbox.items).toHaveLength(0);

    await add({ remindAt: inHours(3) }).expect(201);
    await owner.delete(api(`/items/${itemId}`)).expect(204);
    expect(await service.sendDue(new Date(Date.now() + 4 * HOUR))).toBe(0);
  });
});
