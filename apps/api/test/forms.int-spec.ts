import type {
  Created,
  CreatedItem,
  FormsResponse,
  HierarchyResponse,
  WorkItemDetail,
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

describe('Formlar (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let spaceId: string;
  let listId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const forms = async (client = owner) =>
    ((await client.get(api(`/spaces/${spaceId}/forms`)).expect(200)).body as FormsResponse).forms;
  const createForm = async (body: Record<string, unknown> = {}) =>
    (
      await owner
        .post(api(`/spaces/${spaceId}/forms`), {
          name: 'Hata bildir',
          listId,
          itemType: 'BUG',
          fields: [
            { key: 'description', required: true },
            { key: 'priority', required: false },
          ],
          ...body,
        })
        .expect(201)
    ).body as Created;

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
    listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
  });

  it('yönetici form tanımlar, günceller ve siler', async () => {
    const created = await createForm({ description: 'Sorunu kısaca anlat' });
    expect(await forms()).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Hata bildir',
        listName: 'Görevler',
        itemType: 'BUG',
        enabled: true,
      }),
    ]);
    await owner
      .patch(api(`/spaces/${spaceId}/forms/${created.id}`), {
        name: 'Hata bildirimi',
        enabled: false,
      })
      .expect(204);
    expect((await forms())[0]).toMatchObject({ name: 'Hata bildirimi', enabled: false });

    await owner
      .post(api(`/spaces/${spaceId}/forms`), { name: 'X', listId, itemType: 'EPIC' })
      .expect(400);
    await owner
      .post(api(`/spaces/${spaceId}/forms`), {
        name: 'X',
        listId,
        fields: [{ key: 'priority' }, { key: 'priority' }],
      })
      .expect(400);
    await owner
      .post(api(`/spaces/${spaceId}/forms`), {
        name: 'X',
        listId: '0194ba6a-0001-7000-8000-000000000001',
      })
      .expect(404);

    await owner.delete(api(`/spaces/${spaceId}/forms/${created.id}`)).expect(204);
    expect(await forms()).toEqual([]);
    await owner.delete(api(`/spaces/${spaceId}/forms/${created.id}`)).expect(404);
  });

  it('Stakeholder formu doldurur: görev açılır, bildiren o olur; zorunlu alan denetlenir', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const form = await createForm();
    const submit = (body: Record<string, unknown>) =>
      elif.post(api(`/spaces/${spaceId}/forms/${form.id}/submissions`), body);

    // Zorunlu açıklama eksik.
    const missing = await submit({ title: 'Çöküyor' }).expect(422);
    expect(missing.body).toMatchObject({
      code: 'FORM_FIELD_REQUIRED',
      details: { field: 'description' },
    });

    const item = (
      await submit({
        title: 'Uygulama açılışta çöküyor',
        description: 'Android 14\nSplash ekranında kapanıyor',
        priority: 'HIGH',
        // Formda olmayan alanlar yok sayılır.
        dueDate: '2030-01-01',
      }).expect(201)
    ).body as CreatedItem;
    const detail = (await owner.get(api(`/items/${item.id}`)).expect(200)).body as WorkItemDetail;
    expect(detail).toMatchObject({
      type: 'BUG',
      title: 'Uygulama açılışta çöküyor',
      priority: 'HIGH',
      dueDate: null,
      reporter: { name: 'Elif Demir' },
    });
    expect(detail.description?.content).toHaveLength(2);

    const events = await ctx.prisma.activityEvent.findMany({
      where: { action: 'item.form_submitted' },
    });
    expect(events).toHaveLength(1);
  });

  it('kapalı form gönderilemez; yalnızca yönetici kapalı ve yönetim uçlarını kullanır', async () => {
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const form = await createForm({ fields: [] });
    await owner.patch(api(`/spaces/${spaceId}/forms/${form.id}`), { enabled: false }).expect(204);

    expect(await forms(elif)).toEqual([]);
    expect(await forms()).toHaveLength(1);
    const closed = await elif
      .post(api(`/spaces/${spaceId}/forms/${form.id}/submissions`), { title: 'T' })
      .expect(409);
    expect(closed.body).toMatchObject({ code: 'FORM_DISABLED' });

    await elif.post(api(`/spaces/${spaceId}/forms`), { name: 'Y', listId }).expect(403);
    await elif.patch(api(`/spaces/${spaceId}/forms/${form.id}`), { name: 'Y' }).expect(403);
    await elif.delete(api(`/spaces/${spaceId}/forms/${form.id}`)).expect(403);
  });

  it('özel Space formu üye olmayana görünmez; formlar Space ile sınırlıdır', async () => {
    const hidden = (
      await owner
        .post(api('/spaces'), { name: 'Gizli', key: 'GIZ', color: '#7C3AED', isPrivate: true })
        .expect(201)
    ).body as Created;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const hiddenList = tree.spaces.find((s) => s.id === hidden.id)!.lists[0]!.id;
    const form = (
      await owner
        .post(api(`/spaces/${hidden.id}/forms`), { name: 'Gizli form', listId: hiddenList })
        .expect(201)
    ).body as Created;
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await elif.get(api(`/spaces/${hidden.id}/forms`)).expect(404);
    await elif
      .post(api(`/spaces/${hidden.id}/forms/${form.id}/submissions`), { title: 'T' })
      .expect(404);
    // Başka Space'in listesi forma bağlanamaz.
    await owner
      .post(api(`/spaces/${spaceId}/forms`), { name: 'Z', listId: hiddenList })
      .expect(404);
  });
});
