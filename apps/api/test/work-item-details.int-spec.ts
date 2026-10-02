import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  ItemSearchResponse,
  SpaceDetail,
  SplitItemResponse,
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

const doc = (text: string, extra: object = {}) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text, ...extra }] }],
});

describe('Görev detayı (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED', ...body })
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
  const create = async (listId: string, body: Record<string, unknown>, client = owner) =>
    (await client.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const item = async (id: string, client = owner) =>
    (await client.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;

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

  describe('açıklama (ADR-048)', () => {
    it('kaydedilir, okunur; boş belge null olur; gövde aktiviteye yazılmaz', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'TASK', title: 'T' });
      await owner
        .patch(api(`/items/${t.id}`), {
          description: doc('Merhaba', { marks: [{ type: 'bold' }] }),
        })
        .expect(204);
      expect((await item(t.id)).description).toEqual(doc('Merhaba', { marks: [{ type: 'bold' }] }));
      const row = await ctx.prisma.workItem.findUniqueOrThrow({ where: { id: t.id } });
      expect(row.descriptionText).toBe('Merhaba');

      const events = await ctx.prisma.activityEvent.findMany({
        where: { entityId: t.id, action: 'item.updated' },
      });
      expect(JSON.stringify(events[0]!.changes)).not.toContain('Merhaba');

      await owner
        .patch(api(`/items/${t.id}`), {
          description: { type: 'doc', content: [{ type: 'paragraph' }] },
        })
        .expect(204);
      expect((await item(t.id)).description).toBeNull();
    });

    it('tehlikeli içerik reddedilir (XSS)', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'TASK', title: 'T' });
      const bad = [
        doc('x', { marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }),
        { type: 'doc', content: [{ type: 'script', content: [] }] },
        { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://x/y.png' } }] },
        '<script>alert(1)</script>',
      ];
      for (const description of bad) {
        await owner.patch(api(`/items/${t.id}`), { description }).expect(400);
      }
      expect((await item(t.id)).description).toBeNull();
    });

    it('Stakeholder açıklamayı değiştiremez', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'TASK', title: 'T' });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      // Açık Space: üye olmayan Member Stakeholder izinleriyle okur.
      await elif.patch(api(`/items/${t.id}`), { description: doc('x') }).expect(403);
    });
  });

  describe('kabul kriterleri ve checklist (ADR-049)', () => {
    it('kabul kriteri maddeleri ilk eklemede listeyi oluşturur; işaretlenir, silinir', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'STORY', title: 'S' });
      const entry = (
        (
          await owner
            .post(api(`/items/${t.id}/checklists/acceptance/entries`), {
              text: 'Given giriş When tıklanır Then açılır',
            })
            .expect(201)
        ).body as Created
      ).id;
      await owner
        .post(api(`/items/${t.id}/checklists/acceptance/entries`), { text: 'İkinci' })
        .expect(201);

      let detail = await item(t.id);
      expect(detail.checklists).toHaveLength(1);
      expect(detail.checklists[0]).toMatchObject({ kind: 'ACCEPTANCE' });
      expect(detail.checklists[0]!.items.map((i) => i.text)).toEqual([
        'Given giriş When tıklanır Then açılır',
        'İkinci',
      ]);

      const listId = detail.checklists[0]!.id;
      await owner
        .patch(api(`/items/${t.id}/checklists/${listId}/entries/${entry}`), { done: true })
        .expect(204);
      detail = await item(t.id);
      expect(detail.checklists[0]!.items[0]!.done).toBe(true);
      await owner.delete(api(`/items/${t.id}/checklists/${listId}/entries/${entry}`)).expect(204);
      expect((await item(t.id)).checklists[0]!.items).toHaveLength(1);
    });

    it('adlı checklist: oluştur, yeniden adlandır, madde ekle, sil; kabul listesi silinemez; sınır 20', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'STORY', title: 'S' });
      await owner
        .post(api(`/items/${t.id}/checklists/acceptance/entries`), { text: 'k' })
        .expect(201);
      const id = (
        (await owner.post(api(`/items/${t.id}/checklists`), { title: 'Yayın öncesi' }).expect(201))
          .body as Created
      ).id;
      await owner
        .patch(api(`/items/${t.id}/checklists/${id}`), { title: 'Yayın kontrolü' })
        .expect(204);
      await owner
        .post(api(`/items/${t.id}/checklists/${id}/entries`), { text: 'Sürüm notu' })
        .expect(201);

      const detail = await item(t.id);
      // Kabul kriterleri her zaman önce gelir.
      expect(detail.checklists.map((c) => c.kind)).toEqual(['ACCEPTANCE', 'CHECKLIST']);
      expect(detail.checklists[1]).toMatchObject({
        title: 'Yayın kontrolü',
        items: [{ text: 'Sürüm notu', done: false }],
      });

      const acceptanceId = detail.checklists[0]!.id;
      await owner.delete(api(`/items/${t.id}/checklists/${acceptanceId}`)).expect(404);
      await owner.delete(api(`/items/${t.id}/checklists/${id}`)).expect(204);

      for (let i = 0; i < 20; i++) {
        await owner.post(api(`/items/${t.id}/checklists`), { title: `L${i}` }).expect(201);
      }
      const res = await owner
        .post(api(`/items/${t.id}/checklists`), { title: 'fazla' })
        .expect(422);
      expect(res.body).toEqual({ code: 'CHECKLIST_LIMIT' });
    });

    it('kopyada checklist gelir, maddeler işaretsizdir', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'STORY', title: 'S' });
      const e = (
        (
          await owner
            .post(api(`/items/${t.id}/checklists/acceptance/entries`), { text: 'k' })
            .expect(201)
        ).body as Created
      ).id;
      const cid = (await item(t.id)).checklists[0]!.id;
      await owner
        .patch(api(`/items/${t.id}/checklists/${cid}/entries/${e}`), { done: true })
        .expect(204);

      const copy = (
        await owner.post(api(`/items/${t.id}/copy`), { includeChildren: false }).expect(201)
      ).body as CreatedItem;
      expect((await item(copy.id)).checklists[0]!.items).toMatchObject([
        { text: 'k', done: false },
      ]);
    });
  });

  describe('bağlantılar ve engelleyen uyarısı (ADR-050)', () => {
    it('BLOCKS karşı tarafta BLOCKED_BY görünür; kendine ve tekrar bağlanamaz', async () => {
      const s = await space();
      const a = await create(s.listId, { type: 'TASK', title: 'A' });
      const b = await create(s.listId, { type: 'TASK', title: 'B' });

      await owner
        .post(api(`/items/${a.id}/links`), { targetId: b.id, relation: 'BLOCKS' })
        .expect(201);
      expect((await item(a.id)).links).toMatchObject([
        { relation: 'BLOCKS', item: { key: 'MOB-2' } },
      ]);
      expect((await item(b.id)).links).toMatchObject([
        { relation: 'BLOCKED_BY', item: { key: 'MOB-1' } },
      ]);

      const self = await owner
        .post(api(`/items/${a.id}/links`), { targetId: a.id, relation: 'RELATES_TO' })
        .expect(422);
      expect(self.body).toEqual({ code: 'WORK_ITEM_LINK_SELF' });
      const dup = await owner
        .post(api(`/items/${b.id}/links`), { targetId: a.id, relation: 'BLOCKED_BY' })
        .expect(409);
      expect(dup.body).toEqual({ code: 'WORK_ITEM_LINK_EXISTS' });
    });

    it('RELATES_TO iki yönde tek kayıt; kaldırılır', async () => {
      const s = await space();
      const a = await create(s.listId, { type: 'TASK', title: 'A' });
      const b = await create(s.listId, { type: 'TASK', title: 'B' });
      const linkId = (
        (
          await owner
            .post(api(`/items/${a.id}/links`), { targetId: b.id, relation: 'RELATES_TO' })
            .expect(201)
        ).body as Created
      ).id;
      await owner
        .post(api(`/items/${b.id}/links`), { targetId: a.id, relation: 'RELATES_TO' })
        .expect(409);
      expect((await item(b.id)).links).toMatchObject([{ relation: 'RELATES_TO' }]);

      await owner.delete(api(`/items/${b.id}/links/${linkId}`)).expect(204);
      expect((await item(a.id)).links).toEqual([]);
    });

    it("görünmeyen Space'teki öğe bağlanamaz ve bağlantı listede gizlenir", async () => {
      const open = await space();
      const hidden = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      const a = await create(open.listId, { type: 'TASK', title: 'A' });
      const secret = await create(hidden.listId, { type: 'TASK', title: 'Gizli iş' });
      await owner
        .post(api(`/items/${a.id}/links`), { targetId: secret.id, relation: 'BLOCKS' })
        .expect(201);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      expect((await item(a.id, elif)).links).toEqual([]);
      expect((await item(a.id)).links).toHaveLength(1);
    });

    it('engelleyeni bitmemiş öğe başlatılırken uyarılır; engelleyen bitince uyarı kalkar', async () => {
      const s = await space();
      const active = s.statuses.find((x) => x.category === 'ACTIVE')!;
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const blocker = await create(s.listId, { type: 'TASK', title: 'Engelleyen' });
      const blocked = await create(s.listId, { type: 'TASK', title: 'Engellenen' });
      await owner
        .post(api(`/items/${blocker.id}/links`), { targetId: blocked.id, relation: 'BLOCKS' })
        .expect(201);

      // Başlangıç durumu NOT_STARTED; ACTIVE'e çekmek uyarır.
      const res = await owner
        .patch(api(`/items/${blocked.id}`), { statusId: active.id })
        .expect(409);
      expect(res.body).toEqual({ code: 'WORK_ITEM_BLOCKED', details: { keys: ['MOB-1'] } });
      await owner
        .patch(api(`/items/${blocked.id}`), { statusId: active.id, force: true })
        .expect(204);

      await owner.patch(api(`/items/${blocked.id}`), { statusId: s.statuses[0]!.id }).expect(204);
      await owner.patch(api(`/items/${blocker.id}`), { statusId: done.id }).expect(204);
      await owner.patch(api(`/items/${blocked.id}`), { statusId: active.id }).expect(204);
    });
  });

  describe('izleyiciler ve bölme (ADR-051)', () => {
    it('bildiren ve atananlar otomatik izleyici; herkes kendini ekleyip çıkarır', async () => {
      const s = await space();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      const t = await create(s.listId, { type: 'TASK', title: 'T', assigneeIds: [elifId] });

      expect(await item(t.id)).toMatchObject({ watching: true, watcherCount: 2 });
      expect(await item(t.id, elif)).toMatchObject({ watching: true });

      await elif.delete(api(`/items/${t.id}/watch`)).expect(204);
      expect(await item(t.id, elif)).toMatchObject({ watching: false, watcherCount: 1 });
      await elif.put(api(`/items/${t.id}/watch`)).expect(204);
      await elif.put(api(`/items/${t.id}/watch`)).expect(204);
      expect((await item(t.id)).watcherCount).toBe(2);

      // Sonradan atanan da izleyici olur.
      const u = await create(s.listId, { type: 'TASK', title: 'U' });
      await owner.patch(api(`/items/${u.id}`), { assigneeIds: [elifId] }).expect(204);
      expect(await item(u.id, elif)).toMatchObject({ watching: true });
    });

    it("Story birden çok Task'a bölünür; Story değişmez, Task'lar altında açılır", async () => {
      const s = await space();
      const story = await create(s.listId, { type: 'STORY', title: 'Giriş', points: 5 });
      const res = await owner
        .post(api(`/items/${story.id}/split`), { titles: ['API', 'Arayüz', 'Test'] })
        .expect(201);
      const { items } = res.body as SplitItemResponse;
      expect(items.map((i) => i.key)).toEqual(['MOB-2', 'MOB-3', 'MOB-4']);

      const detail = await item(story.id);
      expect(detail).toMatchObject({ points: 5, childCount: 3 });
      expect(detail.children.map((c) => [c.title, c.type])).toEqual([
        ['API', 'TASK'],
        ['Arayüz', 'TASK'],
        ['Test', 'TASK'],
      ]);
    });

    it('yalnızca Story bölünebilir; başlık listesi boş olamaz', async () => {
      const s = await space();
      const task = await create(s.listId, { type: 'TASK', title: 'T' });
      const res = await owner.post(api(`/items/${task.id}/split`), { titles: ['x'] }).expect(422);
      expect(res.body).toEqual({ code: 'WORK_ITEM_SPLIT_NOT_ALLOWED' });
      const story = await create(s.listId, { type: 'STORY', title: 'S' });
      await owner.post(api(`/items/${story.id}/split`), { titles: [] }).expect(400);
    });
  });

  describe('öğe arama', () => {
    it("başlık ve MOB-12 ile arar; görünmeyen Space'ler ve kendisi hariç", async () => {
      const open = await space();
      const hidden = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      const a = await create(open.listId, { type: 'TASK', title: 'Ödeme ekranı' });
      await create(open.listId, { type: 'TASK', title: 'Rapor' });
      await create(hidden.listId, { type: 'TASK', title: 'Ödeme gizli' });
      const search = async (q: string, client = owner, exclude = '') =>
        (
          (
            await client
              .get(api(`/items/search?q=${encodeURIComponent(q)}&exclude=${exclude}`))
              .expect(200)
          ).body as ItemSearchResponse
        ).items.map((i) => i.key);

      expect(await search('ödeme')).toEqual(['GIZ-1', 'MOB-1']);
      expect(await search('mob-2')).toEqual(['MOB-2']);
      expect(await search('ödeme', owner, a.id)).toEqual(['GIZ-1']);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      expect(await search('ödeme', elif)).toEqual(['MOB-1']);
      expect(await search('')).toEqual([]);
    });
  });
});
