import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  NotificationPreferences,
  NotificationsResponse,
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
const MERT = { email: 'mert@example.com', name: 'Mert Aydın', password: 'mert-pass' };

const doc = (...content: object[]) => ({ type: 'doc', content });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const mention = (id: string, label: string) => ({ type: 'mention', attrs: { id, label } });

describe('Bildirimler (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let elif: Client;
  let ws: string;
  let ownerId: string;
  let elifId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

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
  const item = async (listId: string, body: Record<string, unknown> = {}, client = owner) =>
    (
      await client
        .post(api(`/lists/${listId}/items`), { type: 'STORY', title: 'Ödeme', ...body })
        .expect(201)
    ).body as CreatedItem;
  const inbox = async (client: Client, query = '') =>
    (await client.get(api(`/notifications${query}`)).expect(200)).body as NotificationsResponse;
  const mailsTo = (email: string) => ctx.mail.outbox.filter((m) => m.to === email);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    ownerId = await userId('owner@example.com').catch(async () => {
      const u = await ctx.prisma.user.findFirstOrThrow();
      return u.id;
    });
    elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    elifId = await userId(ELIF.email);
    ctx.mail.outbox.length = 0;
  });

  /** Elif'i Space'e Developer olarak ekler. */
  const addElif = (spaceId: string) =>
    owner.put(api(`/spaces/${spaceId}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);

  describe('atama (ASSIGNED)', () => {
    it('atanan kişi uygulama içi bildirim ve e-posta alır; atayan almaz', async () => {
      const s = await space();
      const it1 = await item(s.listId);
      await owner.patch(api(`/items/${it1.id}`), { assigneeIds: [elifId] }).expect(204);

      const box = await inbox(elif);
      expect(box.unreadCount).toBe(1);
      expect(box.items[0]).toMatchObject({
        type: 'ASSIGNED',
        read: false,
        actor: { name: 'Zeynep Kaya' },
        item: { key: 'MOB-1', title: 'Ödeme' },
      });
      expect((await inbox(owner)).items).toHaveLength(0);

      const [mail] = mailsTo(ELIF.email);
      expect(mail!.subject).toContain('MOB-1');
      expect(mail!.text).toContain('/items/MOB-1');
    });

    it('oluştururken atama da bildirir; kendine atama bildirmez', async () => {
      const s = await space();
      await item(s.listId, { assigneeIds: [elifId] });
      expect((await inbox(elif)).items.map((n) => n.type)).toEqual(['ASSIGNED']);

      await item(s.listId, { title: 'Kendime', assigneeIds: [ownerId] });
      expect((await inbox(owner)).items).toHaveLength(0);
    });

    it('zaten atanmış kişi tekrar bildirilmez', async () => {
      const s = await space();
      const it1 = await item(s.listId, { assigneeIds: [elifId] });
      await owner.patch(api(`/items/${it1.id}`), { assigneeIds: [elifId, ownerId] }).expect(204);
      expect((await inbox(elif)).items).toHaveLength(1);
    });
  });

  describe('yorum ve etiketleme', () => {
    it('etiketlenen MENTIONED, diğer izleyiciler COMMENTED alır; yazan almaz; çift bildirim yok', async () => {
      const s = await space();
      await addElif(s.id);
      const it1 = await item(s.listId, { assigneeIds: [elifId] });
      ctx.mail.outbox.length = 0;
      await ctx.prisma.notification.deleteMany();

      // Elif etiketler, owner izleyici (oluşturan) olarak COMMENTED yerine MENTIONED alır.
      await elif
        .post(api(`/items/${it1.id}/comments`), {
          body: doc({
            type: 'paragraph',
            content: [{ type: 'text', text: 'Bakar mısın ' }, mention(ownerId, 'Zeynep Kaya')],
          }),
        })
        .expect(201);
      const ownerBox = await inbox(owner);
      expect(ownerBox.items.map((n) => n.type)).toEqual(['MENTIONED']);
      expect((await inbox(elif)).items).toHaveLength(0);

      // Mention'sız yorum: owner izleyici olarak COMMENTED alır.
      await elif
        .post(api(`/items/${it1.id}/comments`), { body: doc(para('Bitti sayılır')) })
        .expect(201);
      expect((await inbox(owner)).items.map((n) => n.type)).toEqual(['COMMENTED', 'MENTIONED']);
    });

    it('düzenlemede yalnızca yeni etiketlenenler bildirilir', async () => {
      const s = await space();
      await addElif(s.id);
      const it1 = await item(s.listId);
      const created = (
        await owner
          .post(api(`/items/${it1.id}/comments`), {
            body: doc({
              type: 'paragraph',
              content: [mention(elifId, 'Elif Demir')],
            }),
          })
          .expect(201)
      ).body as Created;
      expect((await inbox(elif)).items.filter((n) => n.type === 'MENTIONED')).toHaveLength(1);

      // Aynı kişi + metin eklenirse yeniden bildirilmez.
      await owner
        .patch(api(`/items/${it1.id}/comments/${created.id}`), {
          body: doc({
            type: 'paragraph',
            content: [{ type: 'text', text: 'Ek not ' }, mention(elifId, 'Elif Demir')],
          }),
        })
        .expect(204);
      expect((await inbox(elif)).items.filter((n) => n.type === 'MENTIONED')).toHaveLength(1);
    });
  });

  describe('durum değişikliği (STATUS_CHANGED)', () => {
    it('atanan ve izleyiciler yeni durum adıyla bilgilendirilir; değiştiren almaz', async () => {
      const s = await space();
      await addElif(s.id);
      const it1 = await item(s.listId, { assigneeIds: [elifId] });
      await ctx.prisma.notification.deleteMany();
      const active = s.statuses.find((x) => x.category === 'ACTIVE')!;

      await owner.patch(api(`/items/${it1.id}`), { statusId: active.id }).expect(204);
      const [n] = (await inbox(elif)).items;
      expect(n).toMatchObject({
        type: 'STATUS_CHANGED',
        detail: active.name,
        item: { key: 'MOB-1' },
      });
      expect((await inbox(owner)).items).toHaveLength(0);

      // Durum değişmediyse bildirim yok.
      await owner.patch(api(`/items/${it1.id}`), { title: 'Yeni ad' }).expect(204);
      expect((await inbox(elif)).items).toHaveLength(1);
    });
  });

  describe('sprint (SPRINT_STARTED / SPRINT_COMPLETED)', () => {
    it('Space üyeleri başlatma ve tamamlamada bilgilendirilir', async () => {
      const s = await space();
      await addElif(s.id);
      const { id } = (
        await owner
          .post(api(`/spaces/${s.id}/sprints`), {
            name: 'Sprint 1',
            goal: 'Hedef',
            startDate: '2026-10-05',
            endDate: '2026-10-16',
          })
          .expect(201)
      ).body as Created;
      await owner.post(api(`/sprints/${id}/start`), {}).expect(204);
      await owner.post(api(`/sprints/${id}/complete`), { unfinished: 'BACKLOG' }).expect(204);

      const box = await inbox(elif);
      expect(box.items.map((n) => n.type)).toEqual(['SPRINT_COMPLETED', 'SPRINT_STARTED']);
      expect(box.items[0]!.sprint).toMatchObject({ id, name: 'Sprint 1', spaceId: s.id });
      expect(mailsTo(ELIF.email).map((m) => m.subject)).toEqual([
        'Sprint 1 başladı',
        'Sprint 1 tamamlandı',
      ]);
      expect((await inbox(owner)).items).toHaveLength(0);
    });
  });

  describe('kutu', () => {
    it('okundu işaretlenir, tümü okundu yapılır, yalnızca okunmamış süzülür', async () => {
      const s = await space();
      for (const title of ['A', 'B', 'C']) {
        await item(s.listId, { title, assigneeIds: [elifId] });
      }
      const all = await inbox(elif);
      expect(all.unreadCount).toBe(3);

      await elif.post(api(`/notifications/${all.items[0]!.id}/read`), {}).expect(204);
      const rest = await inbox(elif, '?unread=true');
      expect(rest.items).toHaveLength(2);
      expect(rest.unreadCount).toBe(2);

      await elif.post(api('/notifications/read-all'), {}).expect(204);
      expect((await inbox(elif)).unreadCount).toBe(0);
      expect((await inbox(elif, '?unread=true')).items).toHaveLength(0);
      expect((await inbox(elif)).items).toHaveLength(3); // okunmuşlar duruyor
    });

    it('başkasının bildirimi okunamaz', async () => {
      const s = await space();
      await item(s.listId, { assigneeIds: [elifId] });
      const [n] = (await inbox(elif)).items;
      await owner.post(api(`/notifications/${n!.id}/read`), {}).expect(204);
      expect((await inbox(elif)).unreadCount).toBe(1);
    });

    it('sayfalama: 30’dan çoğunda hasMore ve before ile devam', async () => {
      const s = await space();
      const it1 = await item(s.listId);
      for (let i = 0; i < 32; i += 1) {
        await ctx.prisma.notification.create({
          data: {
            workspaceId: ws,
            userId: elifId,
            actorId: ownerId,
            type: 'COMMENTED',
            spaceId: s.id,
            workItemId: it1.id,
            data: { actorName: 'Zeynep Kaya', itemKey: it1.key, itemTitle: 'Ödeme' },
            createdAt: new Date(Date.UTC(2026, 9, 1, 10, 0, i)),
          },
        });
      }
      const first = await inbox(elif);
      expect(first.items).toHaveLength(30);
      expect(first.hasMore).toBe(true);
      const next = await inbox(elif, `?before=${encodeURIComponent(first.items.at(-1)!.at)}`);
      expect(next.items).toHaveLength(2);
      expect(next.hasMore).toBe(false);
    });

    it('çalışma alanı dışından erişim yok', async () => {
      await owner
        .get('/api/workspaces/00000000-0000-7000-8000-000000000000/notifications')
        .expect(404);
    });
  });

  describe('tercihler (tür × kanal)', () => {
    it('varsayılan olarak tüm türler ve kanallar açık', async () => {
      const prefs = (await elif.get(api('/notifications/preferences')).expect(200))
        .body as NotificationPreferences;
      expect(prefs.preferences).toHaveLength(6);
      expect(prefs.preferences.every((p) => p.inApp && p.email)).toBe(true);
    });

    it('e-posta kapalıysa yalnızca uygulama içi; uygulama içi kapalıysa yalnızca e-posta', async () => {
      const s = await space();
      await elif
        .put(api('/notifications/preferences'), {
          preferences: [{ type: 'ASSIGNED', inApp: true, email: false }],
        })
        .expect(204);
      await item(s.listId, { assigneeIds: [elifId] });
      expect((await inbox(elif)).items).toHaveLength(1);
      expect(mailsTo(ELIF.email)).toHaveLength(0);

      await elif
        .put(api('/notifications/preferences'), {
          preferences: [{ type: 'ASSIGNED', inApp: false, email: true }],
        })
        .expect(204);
      await item(s.listId, { title: 'İkinci', assigneeIds: [elifId] });
      expect((await inbox(elif)).items).toHaveLength(1); // yeni kayıt yok
      expect(mailsTo(ELIF.email)).toHaveLength(1);
    });

    it('tercihler kişiye özeldir ve gönderilmeyen türleri değiştirmez', async () => {
      await elif
        .put(api('/notifications/preferences'), {
          preferences: [{ type: 'COMMENTED', inApp: false, email: false }],
        })
        .expect(204);
      const mine = (await elif.get(api('/notifications/preferences')).expect(200))
        .body as NotificationPreferences;
      expect(mine.preferences.find((p) => p.type === 'COMMENTED')).toMatchObject({
        inApp: false,
        email: false,
      });
      expect(mine.preferences.find((p) => p.type === 'ASSIGNED')).toMatchObject({
        inApp: true,
        email: true,
      });
      const others = (await owner.get(api('/notifications/preferences')).expect(200))
        .body as NotificationPreferences;
      expect(others.preferences.every((p) => p.inApp && p.email)).toBe(true);
    });

    it('geçersiz tür reddedilir', async () => {
      await elif
        .put(api('/notifications/preferences'), {
          preferences: [{ type: 'BILINMEYEN', inApp: true, email: true }],
        })
        .expect(400);
    });
  });

  describe('görünürlük', () => {
    it('Space’i göremeyen kişi bildirim almaz (özel Space)', async () => {
      const res = await owner
        .post(api('/spaces'), { name: 'Gizli', key: 'GIZ', color: '#7C3AED', isPrivate: true })
        .expect(201);
      const spaceId = (res.body as Created).id;
      const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
      const listId = tree.spaces.find((x) => x.id === spaceId)!.lists[0]!.id;
      const mert = await inviteAndAccept(ctx, owner, ws, MERT);
      const mertId = await userId(MERT.email);
      const it1 = await item(listId);

      // Mert özel Space'te üye değil: elle atanmış gibi bildirim denemesi servis düzeyinde süzülür.
      await ctx.prisma.workItemWatcher.create({
        data: { workItemId: it1.id, userId: mertId, workspaceId: ws },
      });
      await owner
        .post(api(`/items/${it1.id}/comments`), { body: doc(para('Gizli not')) })
        .expect(201);
      expect((await inbox(mert)).items).toHaveLength(0);
    });
  });
});
