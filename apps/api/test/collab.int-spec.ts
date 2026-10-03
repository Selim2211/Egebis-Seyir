import type {
  ActivityResponse,
  Comment,
  CommentsResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  MeResponse,
  MentionCandidates,
  WorkItemDetail,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StorageService } from '../src/infra/storage/storage.service';
import {
  Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };
const MERT = { email: 'mert@example.com', name: 'Mert Aydın', password: 'mert-pass' };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');

const doc = (...content: object[]) => ({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const mention = (id: string, label: string) => ({ type: 'mention', attrs: { id, label } });

describe('Yorum, ek, aktivite ve profil fotoğrafı (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const makeItem = async (spaceBody: Record<string, unknown> = {}) => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED', ...spaceBody })
      .expect(201);
    const spaceId = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    const item = (
      await owner.post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'Görev' }).expect(201)
    ).body as CreatedItem;
    return { spaceId, listId, itemId: item.id };
  };
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const comments = async (itemId: string, client = owner) =>
    ((await client.get(api(`/items/${itemId}/comments`)).expect(200)).body as CommentsResponse)
      .comments;

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

  describe('yorumlar (ADR-055)', () => {
    it('yazılır, listelenir; yazan izleyici olur; aktivite kaydı gövde taşımaz', async () => {
      const { itemId } = await makeItem();
      const id = (
        (
          await owner
            .post(api(`/items/${itemId}/comments`), { body: doc(para('İlk yorum')) })
            .expect(201)
        ).body as Created
      ).id;

      const [comment] = await comments(itemId);
      expect(comment).toMatchObject({
        id,
        author: { name: 'Zeynep Kaya' },
        editedAt: null,
        canEdit: true,
        canDelete: true,
      });
      expect(comment!.body).toEqual(doc(para('İlk yorum')));
      const detail = (await owner.get(api(`/items/${itemId}`)).expect(200)).body as WorkItemDetail;
      expect(detail.commentCount).toBe(1);

      const events = await ctx.prisma.activityEvent.findMany({
        where: { entityId: itemId, action: 'item.commented' },
      });
      expect(JSON.stringify(events[0]!.changes)).not.toContain('İlk yorum');
    });

    it('boş yorum ve tehlikeli içerik reddedilir', async () => {
      const { itemId } = await makeItem();
      await owner
        .post(api(`/items/${itemId}/comments`), { body: doc({ type: 'paragraph' }) })
        .expect(400);
      await owner
        .post(api(`/items/${itemId}/comments`), {
          body: doc({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          }),
        })
        .expect(400);
      expect(await comments(itemId)).toEqual([]);
    });

    it("@mention kaydedilir ve izleyici yapar; görmeyen kişinin mention'ı düz metne iner", async () => {
      const { itemId } = await makeItem({ isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await inviteAndAccept(ctx, owner, ws, MERT);
      const elifId = await userId(ELIF.email);
      const mertId = await userId(MERT.email);
      // Elif Space'e Developer olarak eklenir; Mert özel Space'i göremez.
      const spaceId = (await ctx.prisma.workItem.findUniqueOrThrow({ where: { id: itemId } }))
        .spaceId;
      await owner
        .put(api(`/spaces/${spaceId}/members/${elifId}`), { role: 'DEVELOPER' })
        .expect(204);

      await owner
        .post(api(`/items/${itemId}/comments`), {
          body: doc({
            type: 'paragraph',
            content: [
              mention(elifId, 'Elif Demir'),
              { type: 'text', text: ' ve ' },
              mention(mertId, 'Mert Aydın'),
            ],
          }),
        })
        .expect(201);

      const mentions = await ctx.prisma.commentMention.findMany();
      expect(mentions.map((m) => m.userId)).toEqual([elifId]);
      const [comment] = await comments(itemId);
      expect(JSON.stringify(comment!.body)).toContain('"mention"');
      expect(JSON.stringify(comment!.body)).toContain('@Mert Aydın');
      const detail = (await elif.get(api(`/items/${itemId}`)).expect(200)).body as WorkItemDetail;
      expect(detail.watching).toBe(true);
    });

    it('mention önerisi yalnızca öğeyi görebilenleri ve ada uyanları listeler', async () => {
      const { itemId, spaceId } = await makeItem({ isPrivate: true });
      await inviteAndAccept(ctx, owner, ws, ELIF);
      await inviteAndAccept(ctx, owner, ws, MERT);
      await owner
        .put(api(`/spaces/${spaceId}/members/${await userId(ELIF.email)}`), { role: 'DEVELOPER' })
        .expect(204);

      const all = (await owner.get(api(`/items/${itemId}/mention-candidates`)).expect(200))
        .body as MentionCandidates;
      expect(all.users.map((u) => u.name).sort()).toEqual(['Elif Demir', 'Zeynep Kaya']);
      const filtered = (
        await owner.get(api(`/items/${itemId}/mention-candidates?q=eli`)).expect(200)
      ).body as MentionCandidates;
      expect(filtered.users.map((u) => u.name)).toEqual(['Elif Demir']);
    });

    it('düzenleme yalnızca yazara ait; silme yazar veya Space yöneticisi', async () => {
      const { itemId, spaceId } = await makeItem();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await owner
        .put(api(`/spaces/${spaceId}/members/${await userId(ELIF.email)}`), { role: 'DEVELOPER' })
        .expect(204);
      const mine = (
        (
          await elif
            .post(api(`/items/${itemId}/comments`), { body: doc(para('Elif yazdı')) })
            .expect(201)
        ).body as Created
      ).id;

      const res = await owner
        .patch(api(`/items/${itemId}/comments/${mine}`), { body: doc(para('değiştirdim')) })
        .expect(403);
      expect(res.body).toEqual({ code: 'COMMENT_FORBIDDEN' });

      await elif
        .patch(api(`/items/${itemId}/comments/${mine}`), { body: doc(para('düzeltildi')) })
        .expect(204);
      const [edited] = await comments(itemId);
      expect(edited!.editedAt).not.toBeNull();
      expect(edited!.body).toEqual(doc(para('düzeltildi')));

      // Developer başkasının yorumunu silemez; Owner (tüm Space izinleri) silebilir.
      const other = (
        (
          await owner
            .post(api(`/items/${itemId}/comments`), { body: doc(para('Owner yazdı')) })
            .expect(201)
        ).body as Created
      ).id;
      await elif.delete(api(`/items/${itemId}/comments/${other}`)).expect(403);
      await owner.delete(api(`/items/${itemId}/comments/${mine}`)).expect(204);
      expect((await comments(itemId)).map((c: Comment) => c.id)).toEqual([other]);
      await owner.delete(api(`/items/${itemId}/comments/${mine}`)).expect(404);
    });

    it('tepkiler açılır/kapanır, sayılır; geçersiz emoji reddedilir; Stakeholder tepki verir ama yazamaz', async () => {
      const { itemId } = await makeItem();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const id = (
        (await owner.post(api(`/items/${itemId}/comments`), { body: doc(para('x')) }).expect(201))
          .body as Created
      ).id;

      await owner
        .put(api(`/items/${itemId}/comments/${id}/reactions`), { emoji: '👍' })
        .expect(204);
      await elif.put(api(`/items/${itemId}/comments/${id}/reactions`), { emoji: '👍' }).expect(204);
      await elif.put(api(`/items/${itemId}/comments/${id}/reactions`), { emoji: '🎉' }).expect(204);
      let [c] = await comments(itemId, elif);
      expect(c!.reactions).toMatchObject([
        { emoji: '👍', count: 2, mine: true },
        { emoji: '🎉', count: 1, mine: true },
      ]);

      await elif.put(api(`/items/${itemId}/comments/${id}/reactions`), { emoji: '👍' }).expect(204);
      [c] = await comments(itemId, elif);
      expect(c!.reactions[0]).toMatchObject({ emoji: '👍', count: 1, mine: false });
      await owner
        .put(api(`/items/${itemId}/comments/${id}/reactions`), { emoji: '💩' })
        .expect(400);
    });

    it("özel Space'in yorumlarına üye olmayan erişemez", async () => {
      const { itemId } = await makeItem({ isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(api(`/items/${itemId}/comments`)).expect(404);
      await elif.post(api(`/items/${itemId}/comments`), { body: doc(para('x')) }).expect(404);
    });
  });

  describe('dosya ekleri (ADR-056)', () => {
    it('yüklenir, listelenir, indirilir; resim satır içi, diğerleri indirme olarak', async () => {
      const { itemId } = await makeItem();
      const res = await owner
        .upload(api(`/items/${itemId}/attachments`), PNG, 'ekran görüntüsü.png')
        .expect(201);
      const id = (res.body as Created).id;
      await owner.upload(api(`/items/${itemId}/attachments`), PDF, 'rapor.pdf').expect(201);
      await owner
        .upload(api(`/items/${itemId}/attachments`), Buffer.from('a,b\n1,2\n'), 'veri.csv')
        .expect(201);

      const detail = (await owner.get(api(`/items/${itemId}`)).expect(200)).body as WorkItemDetail;
      expect(detail.attachments.map((a) => [a.fileName, a.previewable])).toEqual([
        ['ekran görüntüsü.png', true],
        ['rapor.pdf', true],
        ['veri.csv', false],
      ]);

      const inline = await owner
        .download(api(`/items/${itemId}/attachments/${id}?preview=1`))
        .expect(200);
      expect(inline.headers['content-type']).toContain('image/png');
      expect(inline.headers['content-disposition']).toContain('inline');
      expect(inline.headers['x-content-type-options']).toBe('nosniff');
      expect(inline.headers['content-security-policy']).toContain('sandbox');
      const pdf = await owner
        .download(api(`/items/${itemId}/attachments/${detail.attachments[1]!.id}?preview=1`))
        .expect(200);
      expect(pdf.headers['content-disposition']).toContain('inline');
      expect(pdf.headers['content-security-policy'] ?? '').not.toContain('sandbox');
      expect((inline.body as Buffer).equals(PNG)).toBe(true);

      const download = await owner.download(api(`/items/${itemId}/attachments/${id}`)).expect(200);
      expect(download.headers['content-disposition']).toContain('attachment');
      expect(download.headers['content-disposition']).toContain(
        encodeURIComponent('ekran görüntüsü.png'),
      );

      // CSV önizleme istense de satır içi gösterilmez.
      const csvId = detail.attachments[2]!.id;
      const csv = await owner
        .download(api(`/items/${itemId}/attachments/${csvId}?preview=1`))
        .expect(200);
      expect(csv.headers['content-disposition']).toContain('attachment');
    });

    it('yasaklı uzantı, sahte içerik, boş ve büyük dosya reddedilir', async () => {
      const { itemId } = await makeItem();
      const upload = (buf: Buffer, name: string) =>
        owner.upload(api(`/items/${itemId}/attachments`), buf, name);

      expect((await upload(Buffer.from('MZ'), 'kurulum.exe').expect(422)).body).toEqual({
        code: 'ATTACHMENT_TYPE_BLOCKED',
      });
      expect((await upload(Buffer.from('düz metin'), 'sahte.png').expect(422)).body).toEqual({
        code: 'ATTACHMENT_INVALID',
      });
      // Test ortamında sınır 1 MB.
      const big = Buffer.alloc(1024 * 1024 + 1, 1);
      expect((await upload(big, 'buyuk.zip').expect(413)).body).toEqual({
        code: 'ATTACHMENT_TOO_LARGE',
      });
      await owner.post(api(`/items/${itemId}/attachments`)).expect(400);
      const detail = (await owner.get(api(`/items/${itemId}`)).expect(200)).body as WorkItemDetail;
      expect(detail.attachments).toEqual([]);
    });

    it('silinince dosya da gider; yetki: Stakeholder indirir ama yükleyemez/silemez', async () => {
      const { itemId } = await makeItem();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const id = (
        (await owner.upload(api(`/items/${itemId}/attachments`), PDF, 'a.pdf').expect(201))
          .body as Created
      ).id;
      const row = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id } });
      const storage = ctx.app.get(StorageService);
      expect(await storage.exists(row.storageKey)).toBe(true);

      await elif.download(api(`/items/${itemId}/attachments/${id}`)).expect(200);
      await elif.upload(api(`/items/${itemId}/attachments`), PDF, 'b.pdf').expect(403);
      await elif.delete(api(`/items/${itemId}/attachments/${id}`)).expect(403);

      await owner.delete(api(`/items/${itemId}/attachments/${id}`)).expect(204);
      expect(await storage.exists(row.storageKey)).toBe(false);
      await owner.download(api(`/items/${itemId}/attachments/${id}`)).expect(404);
    });

    it("depolama anahtarı istemci adını içermez; özel Space'te üye olmayan indiremez", async () => {
      const { itemId } = await makeItem({ isPrivate: true });
      const id = (
        (
          await owner
            .upload(api(`/items/${itemId}/attachments`), PDF, '../../etc/passwd.pdf')
            .expect(201)
        ).body as Created
      ).id;
      const row = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id } });
      expect(row.storageKey).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
      expect(row.fileName).toBe('passwd.pdf'); // yol bileşenleri atılır

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.download(api(`/items/${itemId}/attachments/${id}`)).expect(404);
      const res = await owner.download(api(`/items/${itemId}/attachments/${id}`)).expect(200);
      expect(res.headers['content-disposition']).not.toContain('..');
    });
  });

  describe('aktivite akışı (ADR-057)', () => {
    it('öğe akışı kimlikleri adlara çevirir, yeniden eskiye sıralar ve sayfalar', async () => {
      const { itemId, spaceId } = await makeItem();
      const space = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as {
        statuses: Array<{ id: string; name: string }>;
      };
      const doing = space.statuses.find((s) => s.name === 'Devam ediyor')!;
      await owner
        .patch(api(`/items/${itemId}`), { statusId: doing.id, priority: 'HIGH' })
        .expect(204);
      await owner.post(api(`/items/${itemId}/comments`), { body: doc(para('not')) }).expect(201);

      const feed = (await owner.get(api(`/items/${itemId}/activity`)).expect(200))
        .body as ActivityResponse;
      expect(feed.events.map((e) => e.action)).toEqual([
        'item.commented',
        'item.updated',
        'item.created',
      ]);
      const updated = feed.events[1]!;
      expect(updated.actor?.name).toBe('Zeynep Kaya');
      const byField = Object.fromEntries(updated.changes.map((c) => [c.field, c]));
      expect(byField.statusId?.to).toBe('Devam ediyor');
      expect(typeof byField.statusId?.from).toBe('string'); // kimlik değil, eski durumun adı
      expect(byField.statusId?.from).not.toMatch(/^[0-9a-f-]{36}$/);
      expect(byField.priority).toEqual({ field: 'priority', from: 'NORMAL', to: 'HIGH' });
      expect(feed.next).toBeNull();

      for (let i = 0; i < 35; i++) {
        await owner.patch(api(`/items/${itemId}`), { title: `Başlık ${i}` }).expect(204);
      }
      const first = (await owner.get(api(`/items/${itemId}/activity`)).expect(200))
        .body as ActivityResponse;
      expect(first.events).toHaveLength(30);
      expect(first.next).not.toBeNull();
      const second = (
        await owner.get(api(`/items/${itemId}/activity?before=${first.next}`)).expect(200)
      ).body as ActivityResponse;
      expect(second.events.length).toBeGreaterThan(0);
      const ids = new Set([...first.events, ...second.events].map((e) => e.id));
      expect(ids.size).toBe(first.events.length + second.events.length);
    });

    it("genel akış yalnızca görülebilen Space'lerin olaylarını içerir", async () => {
      await makeItem();
      await makeItem({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);

      const all = (await owner.get(api('/activity')).expect(200)).body as ActivityResponse;
      expect(all.events.map((e) => e.item?.key).sort()).toEqual(['GIZ-1', 'MOB-1']);
      const mine = (await elif.get(api('/activity')).expect(200)).body as ActivityResponse;
      expect(mine.events.map((e) => e.item?.key)).toEqual(['MOB-1']);
    });
  });

  describe('profil fotoğrafı (ADR-059)', () => {
    it('yüklenir, workspace arkadaşlarına sunulur; silinince 404 olur', async () => {
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const ownerId = await userId('zeynep@example.com');

      const res = await owner.upload('/api/users/me/avatar', PNG, 'ben.png').expect(200);
      const me = res.body as MeResponse;
      expect(me.user.avatarVersion).toMatch(/^[0-9a-f]{12}$/);

      const seen = await elif.download(`/api/users/${ownerId}/avatar`).expect(200);
      expect(seen.headers['content-type']).toContain('image/png');
      expect(seen.headers['x-content-type-options']).toBe('nosniff');

      const removed = (await owner.delete('/api/users/me/avatar').expect(200)).body as MeResponse;
      expect(removed.user.avatarVersion).toBeNull();
      await elif.download(`/api/users/${ownerId}/avatar`).expect(404);
    });

    it('PNG/JPEG/WebP dışı, sahte ve eksik içerik reddedilir', async () => {
      const res = await owner.upload('/api/users/me/avatar', PDF, 'sahte.png').expect(422);
      expect(res.body).toEqual({ code: 'AVATAR_INVALID' });
      await owner.upload('/api/users/me/avatar', Buffer.from('metin'), 'x.png').expect(422);
      await owner.post('/api/users/me/avatar').expect(422);
    });
  });
});
