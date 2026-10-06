import type { ConversationsResponse, Created, MeResponse, MessagesResponse } from '@scrum/shared';
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
const CAN = { email: 'can@example.com', name: 'Can Aydın', password: 'can-pass-12' };

describe('Birebir mesajlaşma (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  let elif: Client;
  let elifId: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const open = async (client: Client, userId: string) =>
    (await client.post(api('/conversations'), { userId }).expect(201)).body as Created;
  const convs = async (client: Client) =>
    (await client.get(api('/conversations')).expect(200)).body as ConversationsResponse;
  const thread = async (client: Client, id: string) =>
    (await client.get(api(`/conversations/${id}/messages`)).expect(200)).body as MessagesResponse;
  const ownerId = async () =>
    (await ctx.prisma.user.findFirstOrThrow({ where: { email: 'zeynep@example.com' } })).id;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    ({ owner, workspaceId: ws } = await setupOwner(ctx));
    elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
  });

  it('konuşma açılır (aynı çift tek konuşma), mesajlar iki yönde akar', async () => {
    const a = await open(owner, elifId);
    const b = await open(elif, await ownerId());
    expect(b.id).toBe(a.id);

    // İlk mesaja kadar liste boş.
    expect((await convs(owner)).conversations).toEqual([]);

    await owner.post(api(`/conversations/${a.id}/messages`), { body: 'Merhaba Elif' }).expect(201);
    await elif.post(api(`/conversations/${a.id}/messages`), { body: 'Merhaba!' }).expect(201);

    const asOwner = await thread(owner, a.id);
    expect(asOwner.with.name).toBe('Elif Demir');
    expect(asOwner.messages.map((m) => [m.body, m.mine])).toEqual([
      ['Merhaba Elif', true],
      ['Merhaba!', false],
    ]);
    const asElif = await thread(elif, a.id);
    expect(asElif.messages.map((m) => m.mine)).toEqual([false, true]);
  });

  it('okunmamış sayısı gelen mesajla artar, okununca sıfırlanır; kendi mesajı saymaz', async () => {
    const c = await open(owner, elifId);
    await owner.post(api(`/conversations/${c.id}/messages`), { body: 'bir' }).expect(201);
    await owner.post(api(`/conversations/${c.id}/messages`), { body: 'iki' }).expect(201);

    expect((await convs(owner)).unreadCount).toBe(0);
    const inbox = await convs(elif);
    expect(inbox.unreadCount).toBe(2);
    expect(inbox.conversations[0]).toMatchObject({
      unreadCount: 2,
      with: { name: 'Zeynep Kaya' },
      lastMessage: { body: 'iki', mine: false },
    });

    await elif.post(api(`/conversations/${c.id}/read`)).expect(204);
    expect((await convs(elif)).unreadCount).toBe(0);

    // Cevap yazmak da konuşmayı okunmuş sayar.
    await owner.post(api(`/conversations/${c.id}/messages`), { body: 'üç' }).expect(201);
    expect((await convs(elif)).unreadCount).toBe(1);
    await elif.post(api(`/conversations/${c.id}/messages`), { body: 'tamam' }).expect(201);
    expect((await convs(elif)).unreadCount).toBe(0);
  });

  it('yalnızca taraflar okur ve yazar; üçüncü kişi için konuşma yoktur', async () => {
    const can = await inviteAndAccept(ctx, owner, ws, CAN);
    const c = await open(owner, elifId);
    await owner.post(api(`/conversations/${c.id}/messages`), { body: 'gizli' }).expect(201);
    await can.get(api(`/conversations/${c.id}/messages`)).expect(404);
    await can.post(api(`/conversations/${c.id}/messages`), { body: 'x' }).expect(404);
    await can.post(api(`/conversations/${c.id}/read`)).expect(404);
    expect((await convs(can)).conversations).toEqual([]);
  });

  it('kendine mesaj, boş/uzun mesaj ve bilinmeyen kişi reddedilir', async () => {
    const self = await owner.post(api('/conversations'), { userId: await ownerId() }).expect(422);
    expect(self.body).toMatchObject({ code: 'MESSAGE_SELF' });
    await owner
      .post(api('/conversations'), { userId: '0194ba6a-0001-7000-8000-000000000001' })
      .expect(404);
    const c = await open(owner, elifId);
    await owner.post(api(`/conversations/${c.id}/messages`), { body: '   ' }).expect(400);
    await owner
      .post(api(`/conversations/${c.id}/messages`), { body: 'a'.repeat(4001) })
      .expect(400);
  });

  it('kendi mesajını siler; içerik gizlenir, başkasınınki silinemez', async () => {
    const c = await open(owner, elifId);
    const m = (
      await owner
        .post(api(`/conversations/${c.id}/messages`), { body: 'yanlış kişiye' })
        .expect(201)
    ).body as Created;
    await elif.delete(api(`/conversations/${c.id}/messages/${m.id}`)).expect(404);
    await owner.delete(api(`/conversations/${c.id}/messages/${m.id}`)).expect(204);
    const view = await thread(elif, c.id);
    expect(view.messages).toEqual([expect.objectContaining({ id: m.id, body: '', deleted: true })]);
    // Silinen mesaj okunmamış sayılmaz.
    expect((await convs(elif)).unreadCount).toBe(0);
  });

  it('geçmiş sayfalanır; Guest mesajlaşamaz ve Guest ile konuşma açılamaz', async () => {
    const c = await open(owner, elifId);
    for (let i = 1; i <= 55; i++) {
      await owner.post(api(`/conversations/${c.id}/messages`), { body: `m${i}` }).expect(201);
    }
    const first = await thread(owner, c.id);
    expect(first.messages).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.messages.at(-1)?.body).toBe('m55');
    const older = (
      await owner
        .get(
          api(
            `/conversations/${c.id}/messages?before=${encodeURIComponent(first.messages[0]!.at)}`,
          ),
        )
        .expect(200)
    ).body as MessagesResponse;
    expect(older.messages.map((m) => m.body)).toEqual(
      ['m1', 'm2', 'm3', 'm4', 'm5'].slice(0, older.messages.length),
    );
    expect(older.hasMore).toBe(false);

    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'S', key: 'SPC', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const guest = await inviteAndAccept(
      ctx,
      owner,
      ws,
      { email: 'misafir@example.com', name: 'Misafir', password: 'misafir-pass' },
      'GUEST',
      [spaceId],
    );
    await guest.get(api('/conversations')).expect(403);
    const guestId = (
      await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'misafir@example.com' } })
    ).id;
    await owner.post(api('/conversations'), { userId: guestId }).expect(404);
    void ({} as MeResponse);
  });
});
