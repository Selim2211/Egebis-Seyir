import type {
  Conversation,
  Created,
  CreatedItem,
  HierarchyResponse,
  MembersResponse,
  MessagesResponse,
  SpaceDetail,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Client,
  createTestApp,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass-123' };
const CAN = { email: 'can@example.com', name: 'Can Aksoy', password: 'can-pass-1234' };

/** Yönetici 3. tur notları (ADR-167…): davet rolü, üye kilidi, PO/SM, gönderen listesi, askıya alma, silme, mesaj eki. */
describe('Yönetici 3. tur', () => {
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

  async function project() {
    const spaceId = (
      (await owner.post(api('/spaces'), { name: 'MOB', key: 'MOB', color: '#7C3AED' }).expect(201))
        .body as Created
    ).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === spaceId)!.lists[0]!.id;
    return { spaceId, listId };
  }
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

  it('davetle Admin verilmez; Member ve Guest verilebilir', async () => {
    const res = await owner
      .post(api('/invitations'), { emails: ['x@example.com'], role: 'ADMIN' })
      .expect(403);
    expect((res.body as { code: string }).code).toBe('INVITE_ROLE_NOT_ALLOWED');
    await owner
      .post(api('/invitations'), { emails: ['y@example.com'], role: 'MEMBER' })
      .expect(204);
  });

  it('üye kilitlenince workspace’e erişemez, kilit açılınca döner; kendini kilitleyemez', async () => {
    const { spaceId } = await project();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const elifId = await userId(ELIF.email);
    await elif.get(api('/spaces/' + spaceId)).expect(200);

    await owner.patch(api(`/members/${elifId}/lock`), { locked: true }).expect(204);
    const blocked = await elif.get(api('/spaces/' + spaceId)).expect(403);
    expect((blocked.body as { code: string }).code).toBe('MEMBER_LOCKED');
    const list = (await owner.get(api('/members')).expect(200)).body as MembersResponse;
    expect(list.members.find((m) => m.userId === elifId)?.locked).toBe(true);

    await owner.patch(api(`/members/${elifId}/lock`), { locked: false }).expect(204);
    await elif.get(api('/spaces/' + spaceId)).expect(200);

    const ownerId = (
      await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'zeynep@example.com' } })
    ).id;
    await owner.patch(api(`/members/${ownerId}/lock`), { locked: true }).expect(403);
    // Üye, başka üyeyi kilitleyemez.
    await elif.patch(api(`/members/${ownerId}/lock`), { locked: true }).expect(403);
  });

  it('Product Owner/Scrum Master üye olmalı; Epik ve Task’ın sahibi PO olur, Bug’ın değil', async () => {
    const { spaceId, listId } = await project();
    await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const elifId = await userId(ELIF.email);
    await inviteAndAccept(ctx, owner, ws, CAN, 'MEMBER', []);
    const canId = await userId(CAN.email);

    // Projeye üye olmayan PO/SM olamaz.
    await owner
      .put(api(`/spaces/${spaceId}/scrum-roles`), { productOwnerId: canId, scrumMasterId: null })
      .expect(403);
    await owner
      .put(api(`/spaces/${spaceId}/scrum-roles`), { productOwnerId: elifId, scrumMasterId: elifId })
      .expect(204);
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    expect(detail.productOwner?.id).toBe(elifId);
    expect(detail.scrumMaster?.id).toBe(elifId);

    const make = async (type: string, extra: object = {}) =>
      (
        (
          await owner
            .post(api(`/lists/${listId}/items`), { type, title: `${type} işi`, ...extra })
            .expect(201)
        ).body as CreatedItem
      ).id;
    const epic = await make('EPIC');
    const task = await make('TASK');
    const bug = await make('BUG', { severity: 'MAJOR' });
    const reporter = async (id: string) =>
      (await ctx.prisma.workItem.findUniqueOrThrow({ where: { id } })).reporterId;
    expect(await reporter(epic)).toBe(elifId);
    expect(await reporter(task)).toBe(elifId);
    expect(await reporter(bug)).not.toBe(elifId);

    // Projeden çıkarılan PO görevi bırakır.
    await owner.delete(api(`/spaces/${spaceId}/members/${elifId}`), {}).expect(204);
    const after = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    expect(after.productOwner).toBeNull();
    expect(after.scrumMaster).toBeNull();
  });

  it('Bug gönderen listesi: geçerli kalıplar kaydedilir, geçersizi reddedilir', async () => {
    const { spaceId } = await project();
    await owner
      .put(api(`/spaces/${spaceId}/bug-senders`), {
        senders: ['Destek*@Firma.com', 'rapor?@firma.com'],
      })
      .expect(204);
    const detail = (await owner.get(api(`/spaces/${spaceId}`)).expect(200)).body as SpaceDetail;
    expect(detail.bugSenders).toEqual(['destek*@firma.com', 'rapor?@firma.com']);
    await owner.put(api(`/spaces/${spaceId}/bug-senders`), { senders: ['firma.com'] }).expect(400);
    await owner.put(api(`/spaces/${spaceId}/bug-senders`), { senders: ['a@*.com'] }).expect(400);
  });

  it('sprint: yalnızca Super Admin ve Scrum Master askıya alır/siler; askıdaki sprintte işlem yapılamaz', async () => {
    const { spaceId, listId } = await project();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const elifId = await userId(ELIF.email);
    // Elif Proje Yöneticisi (sprint yetkisi var) ama Scrum Master değil.
    const manager = await ctx.prisma.role.findFirstOrThrow({
      where: { workspaceId: ws, scope: 'SPACE', key: 'PROJECT_MANAGER' },
    });
    await ctx.prisma.spaceMember.updateMany({
      where: { spaceId, userId: elifId },
      data: { roleId: manager.id },
    });

    const sprintId = (
      (
        await owner
          .post(api(`/spaces/${spaceId}/sprints`), {
            name: 'S1',
            startDate: '2026-11-02',
            endDate: '2026-11-13',
          })
          .expect(201)
      ).body as Created
    ).id;
    const itemId = (
      (
        await owner
          .post(api(`/lists/${listId}/items`), { type: 'TASK', title: 'Askıdaki iş' })
          .expect(201)
      ).body as CreatedItem
    ).id;
    await owner
      .post(api(`/spaces/${spaceId}/backlog/move`), { itemIds: [itemId], sprintId })
      .expect(204);

    const refused = await elif.post(api(`/sprints/${sprintId}/suspend`)).expect(403);
    expect((refused.body as { code: string }).code).toBe('SPRINT_SCRUM_MASTER_ONLY');
    await elif.delete(api(`/sprints/${sprintId}`)).expect(403);

    // Elif Scrum Master olunca yapabilir.
    await owner
      .put(api(`/spaces/${spaceId}/scrum-roles`), { productOwnerId: null, scrumMasterId: elifId })
      .expect(204);
    await elif.post(api(`/sprints/${sprintId}/suspend`)).expect(204);
    expect((await ctx.prisma.sprint.findUniqueOrThrow({ where: { id: sprintId } })).status).toBe(
      'SUSPENDED',
    );

    // Askıda: işteki değişiklik, sprint güncelleme ve başlatma reddedilir.
    const blocked = await owner.patch(api(`/items/${itemId}`), { title: 'Yeni ad' }).expect(409);
    expect((blocked.body as { code: string }).code).toBe('SPRINT_SUSPENDED');
    await owner.patch(api(`/sprints/${sprintId}`), { name: 'S1b' }).expect(409);
    await owner.post(api(`/sprints/${sprintId}/start`)).expect(409);

    await elif.post(api(`/sprints/${sprintId}/resume`)).expect(204);
    expect((await ctx.prisma.sprint.findUniqueOrThrow({ where: { id: sprintId } })).status).toBe(
      'PLANNED',
    );
    await owner.patch(api(`/items/${itemId}`), { title: 'Yeni ad' }).expect(204);
    await elif.delete(api(`/sprints/${sprintId}`)).expect(204);
  });

  it('Proje silme: yalnızca Super Admin ve son 7 günde yedek alınmışsa', async () => {
    const { spaceId } = await project();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const elifId = await userId(ELIF.email);
    const manager = await ctx.prisma.role.findFirstOrThrow({
      where: { workspaceId: ws, scope: 'SPACE', key: 'PROJECT_MANAGER' },
    });
    await ctx.prisma.spaceMember.updateMany({
      where: { spaceId, userId: elifId },
      data: { roleId: manager.id },
    });

    const denied = await elif.delete(api(`/spaces/${spaceId}`)).expect(403);
    expect((denied.body as { code: string }).code).toBe('SPACE_DELETE_SUPER_ADMIN');

    const noBackup = await owner.delete(api(`/spaces/${spaceId}`)).expect(409);
    expect((noBackup.body as { code: string }).code).toBe('SPACE_DELETE_BACKUP_REQUIRED');

    await owner.get(api(`/spaces/${spaceId}/backup.zip`)).expect(200);
    await owner.delete(api(`/spaces/${spaceId}`)).expect(204);
  });

  it('mesaja en çok 5 dosya ve toplam 16 MB eklenir; yalnızca taraflar indirir', async () => {
    const { spaceId } = await project();
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF, 'MEMBER', [spaceId]);
    const outsider = await inviteAndAccept(ctx, owner, ws, CAN, 'MEMBER', [spaceId]);
    const elifId = await userId(ELIF.email);

    const conv = (await owner.post(api('/conversations'), { userId: elifId }).expect(201))
      .body as Created;
    const file = (n: number) => ({ buffer: Buffer.from(`içerik ${n}`), name: `not-${n}.txt` });
    const sent = (
      await owner
        .uploadMany(api(`/conversations/${conv.id}/messages/upload`), [file(1), file(2)], {
          body: 'Ekleri gönderdim',
        })
        .expect(201)
    ).body as Created;

    const thread = (await elif.get(api(`/conversations/${conv.id}/messages`)).expect(200))
      .body as MessagesResponse;
    const message = thread.messages.find((m) => m.id === sent.id)!;
    expect(message.body).toBe('Ekleri gönderdim');
    expect(message.attachments.map((a) => a.fileName)).toEqual(['not-1.txt', 'not-2.txt']);
    const att = message.attachments[0]!;
    const url = api(`/conversations/${conv.id}/messages/${message.id}/attachments/${att.id}`);
    const got = (await elif.download(url).expect(200)).body as Buffer;
    expect(got.toString()).toBe('içerik 1');
    // Konuşmanın tarafı olmayan indiremez.
    await outsider.get(url).expect(404);

    // Metinsiz, yalnız dosyalı mesaj olur; boş mesaj olmaz.
    await owner.uploadMany(api(`/conversations/${conv.id}/messages/upload`), [file(3)]).expect(201);
    await owner.uploadMany(api(`/conversations/${conv.id}/messages/upload`), []).expect(400);

    // 6 dosya: reddedilir.
    const six = [1, 2, 3, 4, 5, 6].map(file);
    const tooMany = await owner
      .uploadMany(api(`/conversations/${conv.id}/messages/upload`), six, { body: 'çok' })
      .expect(422);
    expect((tooMany.body as { code: string }).code).toBe('MESSAGE_ATTACHMENTS_LIMIT');
    // Toplam 16 MB üstü: reddedilir.
    const big = Buffer.alloc(9 * 1024 * 1024, 1);
    const tooBig = await owner
      .uploadMany(
        api(`/conversations/${conv.id}/messages/upload`),
        [
          { buffer: big, name: 'a.zip' },
          { buffer: big, name: 'b.zip' },
        ],
        { body: 'büyük' },
      )
      .expect(413);
    expect((tooBig.body as { code: string }).code).toBe('MESSAGE_ATTACHMENTS_TOO_BIG');

    const list = (await owner.get(api('/conversations')).expect(200)).body as {
      conversations: Conversation[];
    };
    expect(list.conversations).toHaveLength(1);
  });
});
