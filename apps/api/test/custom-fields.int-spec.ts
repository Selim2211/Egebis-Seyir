import type {
  Created,
  CustomFieldsResponse,
  WorkItemDetail,
  WorkItemsResponse,
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

describe('Özel alanlar (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (key = 'MOB') => {
    const res = await owner
      .post(api('/spaces'), { name: `Space ${key}`, key, color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const fields = async (spaceId: string, client = owner) =>
    (await client.get(api(`/spaces/${spaceId}/custom-fields`)).expect(200))
      .body as CustomFieldsResponse;
  const createField = async (spaceId: string, body: Record<string, unknown>) =>
    ((await owner.post(api(`/spaces/${spaceId}/custom-fields`), body).expect(201)).body as Created)
      .id;
  const addItem = async (listId: string, title = 'İş') =>
    (
      (await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title }).expect(201))
        .body as Created
    ).id;
  const setValues = (itemId: string, customFields: Record<string, unknown>, client = owner) =>
    client.patch(api(`/items/${itemId}`), { customFields });
  const valuesOf = async (listId: string, itemId: string) =>
    (
      (await owner.get(api(`/lists/${listId}/items`)).expect(200)).body as WorkItemsResponse
    ).items.find((i) => i.id === itemId)!.customFields;

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

  describe('alan tanımları', () => {
    it('alan eklenir, sıralanır, yeniden adlandırılır; liste seçeneklerine kimlik atanır', async () => {
      const s = await space();
      const text = await createField(s.id, { name: 'Müşteri', type: 'TEXT' });
      const risk = await createField(s.id, {
        name: 'Risk',
        type: 'DROPDOWN',
        options: [{ label: 'Düşük' }, { label: 'Yüksek', color: '#EF4444' }],
      });
      const list = await fields(s.id);
      expect(list.fields.map((f) => f.name)).toEqual(['Müşteri', 'Risk']);
      const options = list.fields[1]!.options;
      expect(options.map((o) => o.label)).toEqual(['Düşük', 'Yüksek']);
      expect(options[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(options[1]!.color).toBe('#EF4444');

      await owner
        .post(api(`/spaces/${s.id}/custom-fields/${risk}/move`), { afterId: null })
        .expect(204);
      expect((await fields(s.id)).fields.map((f) => f.name)).toEqual(['Risk', 'Müşteri']);

      await owner
        .patch(api(`/spaces/${s.id}/custom-fields/${text}`), { name: 'Firma' })
        .expect(204);
      expect((await fields(s.id)).fields.map((f) => f.name)).toEqual(['Risk', 'Firma']);
    });

    it('aynı ad (büyük/küçük harf duyarsız) çakışır; liste alanı seçenek ister', async () => {
      const s = await space();
      await createField(s.id, { name: 'Risk', type: 'TEXT' });
      const dup = await owner
        .post(api(`/spaces/${s.id}/custom-fields`), { name: 'risk', type: 'NUMBER' })
        .expect(409);
      expect(dup.body).toEqual({ code: 'CUSTOM_FIELD_NAME_TAKEN' });

      const noOptions = await owner
        .post(api(`/spaces/${s.id}/custom-fields`), { name: 'Seç', type: 'DROPDOWN' })
        .expect(422);
      expect(noOptions.body).toEqual({ code: 'CUSTOM_FIELD_OPTIONS_REQUIRED' });
      await owner
        .post(api(`/spaces/${s.id}/custom-fields`), {
          name: 'Seç',
          type: 'DROPDOWN',
          options: [{ label: 'A' }, { label: 'a' }],
        })
        .expect(422);
    });

    it('seçenekler güncellenirken mevcut kimlikler korunur; tür değişmez', async () => {
      const s = await space();
      const id = await createField(s.id, {
        name: 'Risk',
        type: 'DROPDOWN',
        options: [{ label: 'Düşük' }, { label: 'Yüksek' }],
      });
      const [low, high] = (await fields(s.id)).fields[0]!.options;
      await owner
        .patch(api(`/spaces/${s.id}/custom-fields/${id}`), {
          options: [
            { id: high!.id, label: 'Kritik' },
            { id: low!.id, label: 'Düşük' },
            { label: 'Orta' },
          ],
        })
        .expect(204);
      const after = (await fields(s.id)).fields[0]!.options;
      expect(after.map((o) => o.label)).toEqual(['Kritik', 'Düşük', 'Orta']);
      expect(after[0]!.id).toBe(high!.id);
      expect(after[1]!.id).toBe(low!.id);

      const text = await createField(s.id, { name: 'Not', type: 'TEXT' });
      await owner
        .patch(api(`/spaces/${s.id}/custom-fields/${text}`), { options: [{ label: 'X' }] })
        .expect(422);
    });

    it('en çok 30 alan; ayar yetkisi olmayan tanım yönetemez ama okur', async () => {
      const s = await space();
      for (let i = 0; i < 30; i += 1) await createField(s.id, { name: `Alan ${i}`, type: 'TEXT' });
      const over = await owner
        .post(api(`/spaces/${s.id}/custom-fields`), { name: 'Fazla', type: 'TEXT' })
        .expect(409);
      expect(over.body).toEqual({ code: 'CUSTOM_FIELD_LIMIT' });

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await elif
        .post(api(`/spaces/${s.id}/custom-fields`), { name: 'Yeni', type: 'TEXT' })
        .expect(403);
      expect((await fields(s.id, elif)).fields).toHaveLength(30);
    });
  });

  describe('değerler', () => {
    it('her türde değer girilir, listede görünür, null temizler', async () => {
      const s = await space();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      void elif;
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      const text = await createField(s.id, { name: 'Müşteri', type: 'TEXT' });
      const num = await createField(s.id, { name: 'Bütçe', type: 'NUMBER' });
      const date = await createField(s.id, { name: 'Teslim', type: 'DATE' });
      const url = await createField(s.id, { name: 'Bağlantı', type: 'URL' });
      const check = await createField(s.id, { name: 'Onaylı', type: 'CHECKBOX' });
      const person = await createField(s.id, { name: 'Sorumlu', type: 'PERSON' });
      const pick = await createField(s.id, {
        name: 'Risk',
        type: 'DROPDOWN',
        options: [{ label: 'Düşük' }, { label: 'Yüksek' }],
      });
      const multi = await createField(s.id, {
        name: 'Bölge',
        type: 'MULTI_SELECT',
        options: [{ label: 'TR' }, { label: 'EU' }],
      });
      const options = (await fields(s.id)).fields;
      const high = options.find((f) => f.id === pick)!.options[1]!.id;
      const regions = options.find((f) => f.id === multi)!.options.map((o) => o.id);

      const itemId = await addItem(s.listId);
      await setValues(itemId, {
        [text]: '  Acme ',
        [num]: 1250.5,
        [date]: '2026-12-31',
        [url]: 'https://example.com/x',
        [check]: true,
        [person]: elifId,
        [pick]: high,
        [multi]: regions,
      }).expect(204);

      expect(await valuesOf(s.listId, itemId)).toEqual({
        [text]: 'Acme',
        [num]: 1250.5,
        [date]: '2026-12-31',
        [url]: 'https://example.com/x',
        [check]: true,
        [person]: elifId,
        [pick]: high,
        [multi]: regions,
      });
      const detail = (await owner.get(api(`/items/${itemId}`)).expect(200)).body as WorkItemDetail;
      expect(detail.customFields[text]).toBe('Acme');

      await setValues(itemId, { [text]: null, [multi]: [] }).expect(204);
      const left = await valuesOf(s.listId, itemId);
      expect(left[text]).toBeUndefined();
      expect(left[multi]).toBeUndefined();
      expect(left[num]).toBe(1250.5);
    });

    it('geçersiz değer, tanımsız alan ve üye olmayan kişi reddedilir', async () => {
      const s = await space();
      const num = await createField(s.id, { name: 'Bütçe', type: 'NUMBER' });
      const pick = await createField(s.id, {
        name: 'Risk',
        type: 'DROPDOWN',
        options: [{ label: 'Düşük' }],
      });
      const person = await createField(s.id, { name: 'Sorumlu', type: 'PERSON' });
      const link = await createField(s.id, { name: 'Bağlantı', type: 'URL' });
      const itemId = await addItem(s.listId);
      const invalid = { code: 'CUSTOM_FIELD_VALUE_INVALID' };

      for (const body of [
        { [num]: 'çok' },
        { [pick]: '0194ba6a-0001-7000-8000-000000000001' },
        { [person]: '0194ba6a-0001-7000-8000-000000000001' },
        { [link]: 'javascript:alert(1)' },
        { '0194ba6a-0001-7000-8000-000000000001': 'x' },
      ]) {
        const res = await setValues(itemId, body).expect(422);
        expect(res.body).toEqual(invalid);
      }
      await setValues(itemId, { 'kimlik-degil': 'x' }).expect(400);
      expect(await valuesOf(s.listId, itemId)).toEqual({});
    });

    it('değişiklik aktivite kaydına yazılır; aynı değer kayıt üretmez', async () => {
      const s = await space();
      const num = await createField(s.id, { name: 'Bütçe', type: 'NUMBER' });
      const itemId = await addItem(s.listId);
      await setValues(itemId, { [num]: 5 }).expect(204);
      await setValues(itemId, { [num]: 5 }).expect(204);
      const events = await ctx.prisma.activityEvent.findMany({
        where: { entityId: itemId, action: 'item.updated' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.changes).toMatchObject({
        customFields: { from: { [num]: null }, to: { [num]: 5 } },
      });
    });

    it('izleyici (Stakeholder) değer giremez', async () => {
      const s = await space();
      const text = await createField(s.id, { name: 'Not', type: 'TEXT' });
      const itemId = await addItem(s.listId);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner
        .put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'STAKEHOLDER' })
        .expect(204);
      await setValues(itemId, { [text]: 'x' }, elif).expect(403);
    });

    it('alan silinince değerler temizlenir', async () => {
      const s = await space();
      const keep = await createField(s.id, { name: 'Kalan', type: 'TEXT' });
      const drop = await createField(s.id, { name: 'Silinen', type: 'TEXT' });
      const itemId = await addItem(s.listId);
      await setValues(itemId, { [keep]: 'a', [drop]: 'b' }).expect(204);
      await owner.delete(api(`/spaces/${s.id}/custom-fields/${drop}`)).expect(204);
      expect(await valuesOf(s.listId, itemId)).toEqual({ [keep]: 'a' });
      expect((await fields(s.id)).fields.map((f) => f.id)).toEqual([keep]);
    });

    it('aynı Space içinde kopyada değerler kalır; başka Space e kopyada ve taşımada düşer', async () => {
      const a = await space('AAA');
      const b = await space('BBB');
      const text = await createField(a.id, { name: 'Not', type: 'TEXT' });
      const itemId = await addItem(a.listId);
      await setValues(itemId, { [text]: 'önemli' }).expect(204);

      const same = (await owner.post(api(`/items/${itemId}/copy`), {}).expect(201)).body as Created;
      expect((await valuesOf(a.listId, same.id))[text]).toBe('önemli');

      const cross = (
        await owner.post(api(`/items/${itemId}/copy`), { listId: b.listId }).expect(201)
      ).body as Created;
      expect(await valuesOf(b.listId, cross.id)).toEqual({});

      await owner.post(api(`/items/${itemId}/move`), { listId: b.listId }).expect(204);
      expect(await valuesOf(b.listId, itemId)).toEqual({});
    });
  });
});
