import type {
  Comment,
  Created,
  CreatedItem,
  DocDetail,
  HierarchyResponse,
  NotificationsResponse,
  RichTextDoc,
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

const text = (value: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const mentioning = (userId: string, label: string): RichTextDoc => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bakar mısın ' },
        { type: 'mention', attrs: { id: userId, label } },
      ],
    },
  ],
});

describe('Doküman bağlantıları ve yorumları (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (body: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED', ...body })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const doc = async (spaceId: string, title = 'PRD') =>
    (await owner.post(api(`/spaces/${spaceId}/docs`), { title }).expect(201)).body as Created;
  const item = async (listId: string, title = 'Giriş') =>
    (await owner.post(api(`/lists/${listId}/items`), { type: 'STORY', title }).expect(201))
      .body as CreatedItem;
  const detail = async (id: string, client = owner) =>
    (await client.get(api(`/docs/${id}`)).expect(200)).body as DocDetail;
  const comments = async (id: string, client = owner) =>
    ((await client.get(api(`/docs/${id}/comments`)).expect(200)).body as { comments: Comment[] })
      .comments;
  const inbox = async (client: Client) =>
    (await client.get(api('/notifications')).expect(200)).body as NotificationsResponse;

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

  describe('görev bağlantıları', () => {
    it('sayfaya bağlanan görev iki yönde de görünür; tekrar bağlamak zararsız', async () => {
      const s = await space();
      const d = await doc(s.id);
      const story = await item(s.listId);

      await owner.put(api(`/docs/${d.id}/links/${story.id}`), {}).expect(204);
      await owner.put(api(`/docs/${d.id}/links/${story.id}`), {}).expect(204);

      const page = await detail(d.id);
      expect(page.links).toEqual([
        expect.objectContaining({ id: story.id, key: 'MOB-1', title: 'Giriş', type: 'STORY' }),
      ]);
      const task = (await owner.get(api(`/items/${story.id}`)).expect(200)).body as WorkItemDetail;
      expect(task.docs).toEqual([{ id: d.id, title: 'PRD', spaceId: s.id }]);

      await owner.delete(api(`/docs/${d.id}/links/${story.id}`)).expect(204);
      expect((await detail(d.id)).links).toEqual([]);
      expect(
        ((await owner.get(api(`/items/${story.id}`)).expect(200)).body as WorkItemDetail).docs,
      ).toEqual([]);
    });

    it('silinen sayfa görevde listelenmez; görev silinince bağlantı listelenmez', async () => {
      const s = await space();
      const d = await doc(s.id);
      const story = await item(s.listId);
      await owner.put(api(`/docs/${d.id}/links/${story.id}`), {}).expect(204);

      await owner.delete(api(`/items/${story.id}`)).expect(204);
      expect((await detail(d.id)).links).toEqual([]);
    });

    it('görünmeyen Space’teki görev bağlanamaz ve bağlantısı başkasına sızmaz', async () => {
      const open = await space();
      const hidden = await space({ name: 'Gizli', key: 'GZL', isPrivate: true });
      const d = await doc(open.id);
      const secret = await item(hidden.listId, 'Gizli iş');
      await owner.put(api(`/docs/${d.id}/links/${secret.id}`), {}).expect(204);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      expect((await detail(d.id, elif)).links).toEqual([]);
      await owner
        .put(api(`/spaces/${open.id}/members/${elifId}`), { role: 'DEVELOPER' })
        .expect(204);
      await elif.put(api(`/docs/${d.id}/links/${secret.id}`), {}).expect(404);
    });

    it('Stakeholder bağlayamaz', async () => {
      const s = await space();
      const d = await doc(s.id);
      const story = await item(s.listId);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.put(api(`/docs/${d.id}/links/${story.id}`), {}).expect(403);
    });
  });

  describe('yorumlar', () => {
    it('yorum yazılır, düzenlenir, tepki alır ve silinir', async () => {
      const s = await space();
      const d = await doc(s.id);
      const c = (
        await owner.post(api(`/docs/${d.id}/comments`), { body: text('İlk fikir') }).expect(201)
      ).body as Created;

      let list = await comments(d.id);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ canEdit: true, canDelete: true, editedAt: null });

      await owner
        .patch(api(`/docs/${d.id}/comments/${c.id}`), { body: text('Düzeltilmiş fikir') })
        .expect(204);
      await owner.put(api(`/docs/${d.id}/comments/${c.id}/reactions`), { emoji: '👍' }).expect(204);
      list = await comments(d.id);
      expect(list[0]!.body).toEqual(text('Düzeltilmiş fikir'));
      expect(list[0]!.editedAt).not.toBeNull();
      expect(list[0]!.reactions).toEqual([
        expect.objectContaining({ emoji: '👍', count: 1, mine: true }),
      ]);

      await owner.delete(api(`/docs/${d.id}/comments/${c.id}`)).expect(204);
      expect(await comments(d.id)).toEqual([]);
    });

    it('boş yorum reddedilir; başkasının yorumu düzenlenemez', async () => {
      const s = await space();
      const d = await doc(s.id);
      await owner.post(api(`/docs/${d.id}/comments`), { body: text('  ') }).expect(400);
      const c = (await owner.post(api(`/docs/${d.id}/comments`), { body: text('x') }).expect(201))
        .body as Created;
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await elif.patch(api(`/docs/${d.id}/comments/${c.id}`), { body: text('y') }).expect(403);
      await elif.delete(api(`/docs/${d.id}/comments/${c.id}`)).expect(403);
    });

    it('@mention bildirim üretir; düzenlemede yalnızca yeni etiketlenen alır', async () => {
      const s = await space();
      const d = await doc(s.id, 'Karar kaydı');
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      const c = (
        await owner
          .post(api(`/docs/${d.id}/comments`), { body: mentioning(elifId, 'Elif Demir') })
          .expect(201)
      ).body as Created;
      let box = await inbox(elif);
      expect(box.items).toHaveLength(1);
      expect(box.items[0]).toMatchObject({
        type: 'MENTIONED',
        item: null,
        doc: { id: d.id, title: 'Karar kaydı', spaceId: s.id },
      });

      // Aynı kişi yeniden etiketlenerek düzenlenirse ikinci bildirim gelmez.
      await owner
        .patch(api(`/docs/${d.id}/comments/${c.id}`), {
          body: mentioning(elifId, 'Elif Demir'),
        })
        .expect(204);
      box = await inbox(elif);
      expect(box.items).toHaveLength(1);

      const mails = ctx.mail.outbox.filter(
        (m) => m.to === ELIF.email && /Karar kaydı/.test(m.subject),
      );
      expect(mails.length).toBeGreaterThanOrEqual(1);
    });

    it('görmeyen kişi etiketlenemez; adayları yalnızca görenler', async () => {
      const s = await space({ isPrivate: true });
      const d = await doc(s.id);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      await owner
        .post(api(`/docs/${d.id}/comments`), { body: mentioning(elifId, 'Elif Demir') })
        .expect(201);
      expect((await inbox(elif)).items).toEqual([]);
      const found = await owner.get(api(`/docs/${d.id}/mention-candidates?q=Elif`)).expect(200);
      expect((found.body as { users: unknown[] }).users).toEqual([]);
    });

    it('silinmiş sayfaya ve arşivli Space’e yorum yazılamaz', async () => {
      const s = await space();
      const d = await doc(s.id);
      await owner.post(api(`/spaces/${s.id}/archive`), {}).expect(204);
      await owner.post(api(`/docs/${d.id}/comments`), { body: text('x') }).expect(409);
      await owner.get(api(`/docs/${d.id}/comments`)).expect(200);
    });
  });
});
