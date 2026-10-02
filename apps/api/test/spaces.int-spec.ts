import type {
  ArchiveResponse,
  Created,
  FolderDetail,
  HierarchyResponse,
  ListDetail,
  SpaceDetail,
  SpaceMembersResponse,
  WorkspaceSettings,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccessService } from '../src/modules/access/access.service';
import { LifecycleService } from '../src/modules/spaces/lifecycle.service';
import {
  Client,
  createTestApp,
  INVITE_LINK,
  inviteAndAccept,
  resetState,
  setupOwner,
  type TestContext,
  tokenFromMail,
} from './helpers';

const ELIF = { email: 'elif@example.com', name: 'Elif Demir', password: 'elif-pass' };
const MERT = { email: 'mert@example.com', name: 'Mert Aydın', password: 'mert-pass' };
const GUEST = { email: 'misafir@example.com', name: 'Misafir Kişi', password: 'guest-pass' };

describe('Space / Folder / List (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const createSpace = async (client: Client, body: Record<string, unknown> = {}) => {
    const res = await client
      .post(api('/spaces'), { name: 'Mobil Uygulama', key: 'MOB', color: '#7C3AED', ...body })
      .expect(201);
    return (res.body as Created).id;
  };
  const tree = async (client: Client) =>
    (await client.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;

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

  describe('Space oluşturma', () => {
    it('Türkçe durumlar, varsayılan liste ve Product Owner olarak oluşturan ile açılır', async () => {
      const id = await createSpace(owner);
      const space = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
      expect(space).toMatchObject({
        name: 'Mobil Uygulama',
        key: 'MOB',
        isPrivate: false,
        scrumEnabled: true,
        sprintLengthWeeks: 2,
        estimationScale: 'FIBONACCI',
        myRole: 'PRODUCT_OWNER',
        archived: false,
      });
      expect(space.statuses.map((s) => [s.name, s.category])).toEqual([
        ['Backlog', 'NOT_STARTED'],
        ['Yapılacak', 'NOT_STARTED'],
        ['Devam ediyor', 'ACTIVE'],
        ['İncelemede', 'ACTIVE'],
        ['Tamamlandı', 'DONE'],
      ]);

      const { spaces } = await tree(owner);
      expect(spaces).toHaveLength(1);
      expect(spaces[0]!.lists.map((l) => l.name)).toEqual(['Görevler']);

      const events = await ctx.prisma.activityEvent.findMany({ where: { entityId: id } });
      expect(events.map((e) => e.action)).toEqual(['space.created']);
    });

    it('anahtar biçimi doğrulanır, küçük harf büyütülür', async () => {
      await owner.post(api('/spaces'), { name: 'X', key: '1AB', color: '#7C3AED' }).expect(400);
      const id = await createSpace(owner, { key: 'web' });
      const space = (await owner.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
      expect(space.key).toBe('WEB');
    });

    it("kullanılmış anahtar başka Space'e verilemez; eski anahtar da rezerve kalır (ADR-033)", async () => {
      const mob = await createSpace(owner);
      const res = await owner
        .post(api('/spaces'), { name: 'Başka', key: 'MOB', color: '#4F46E5' })
        .expect(409);
      expect(res.body).toEqual({ code: 'SPACE_KEY_TAKEN' });

      await owner.patch(api(`/spaces/${mob}`), { key: 'APP' }).expect(204);
      await owner.post(api('/spaces'), { name: 'Başka', key: 'MOB', color: '#4F46E5' }).expect(409);
      // Space kendi eski anahtarına dönebilir.
      await owner.patch(api(`/spaces/${mob}`), { key: 'MOB' }).expect(204);
    });

    it('Member Space oluşturabilir; ayar kapatılınca oluşturamaz (ADR-042)', async () => {
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await createSpace(elif);

      await owner.patch(api('/settings'), { membersCanCreateSpaces: false }).expect(204);
      const settings = (await owner.get(api('/settings')).expect(200)).body as WorkspaceSettings;
      expect(settings.membersCanCreateSpaces).toBe(false);
      await elif.post(api('/spaces'), { name: 'Ops', key: 'OPS', color: '#4F46E5' }).expect(403);
      await elif.get(api('/settings')).expect(403);
    });

    it("Guest Space'e yalnızca Stakeholder olarak eklenebilir", async () => {
      const id = await createSpace(owner);
      await owner
        .post(api('/invitations'), { emails: [GUEST.email], role: 'GUEST', spaceIds: [id] })
        .expect(204);
      const token = tokenFromMail(ctx, INVITE_LINK);
      const guest = await Client.create(ctx.app);
      await guest
        .post(`/api/invitations/${token}/accept`, { name: GUEST.name, password: GUEST.password })
        .expect(200);
      const guestId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: GUEST.email } }))
        .id;

      const res = await owner
        .put(api(`/spaces/${id}/members/${guestId}`), { role: 'DEVELOPER' })
        .expect(403);
      expect(res.body).toEqual({ code: 'GUEST_STAKEHOLDER_ONLY' });
    });
  });

  describe('görünürlük ve izinler (ADR-039)', () => {
    it('açık Space: üye olmayan Member görür ama yapı değiştiremez', async () => {
      const id = await createSpace(owner);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);

      const { spaces } = await tree(elif);
      expect(spaces.map((s) => s.id)).toEqual([id]);
      expect(spaces[0]!.permissions).toContain('comment.write');
      expect(spaces[0]!.permissions).not.toContain('space.lists.manage');
      const space = (await elif.get(api(`/spaces/${id}`)).expect(200)).body as SpaceDetail;
      expect(space.myRole).toBeNull();

      await elif.post(api(`/spaces/${id}/lists`), { name: 'Yeni' }).expect(403);
      await elif.patch(api(`/spaces/${id}`), { name: 'Değişti' }).expect(403);
    });

    it('özel Space: üye olmayana 404, eklenen Developer liste oluşturur', async () => {
      const id = await createSpace(owner, { isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      expect((await tree(elif)).spaces).toEqual([]);
      await elif.get(api(`/spaces/${id}`)).expect(404);

      await owner.put(api(`/spaces/${id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      const members = (await elif.get(api(`/spaces/${id}/members`)).expect(200))
        .body as SpaceMembersResponse;
      expect(members.members.map((m) => [m.name, m.role])).toEqual([
        ['Zeynep Kaya', 'PRODUCT_OWNER'],
        ['Elif Demir', 'DEVELOPER'],
      ]);
      await elif.post(api(`/spaces/${id}/lists`), { name: 'Hatalar' }).expect(201);
      // Developer Space ayarlarını değiştiremez.
      await elif.patch(api(`/spaces/${id}`), { isPrivate: false }).expect(403);
    });

    it("Guest yalnızca davette paylaşılan Space'i Stakeholder olarak görür (ADR-035)", async () => {
      const shared = await createSpace(owner);
      await createSpace(owner, { name: 'Web', key: 'WEB' });

      const res = await owner
        .post(api('/invitations'), { emails: [GUEST.email], role: 'GUEST' })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });

      const guest = await inviteGuest(shared);
      const { spaces } = await tree(guest);
      expect(spaces.map((s) => s.key)).toEqual(['MOB']);
      expect(spaces[0]!.permissions).not.toContain('workItem.write');
      await guest.post(api(`/spaces/${shared}/folders`), { name: 'X' }).expect(403);
    });

    it("üye Guest'e düşürülünce Space rolleri Stakeholder olur; çıkarılınca Space üyeliği silinir", async () => {
      const id = await createSpace(owner, { isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);

      await owner.patch(api(`/members/${elifId}`), { role: 'GUEST' }).expect(204);
      const members = (await owner.get(api(`/spaces/${id}/members`)).expect(200))
        .body as SpaceMembersResponse;
      expect(members.members.find((m) => m.userId === elifId)?.role).toBe('STAKEHOLDER');
      await elif.post(api(`/spaces/${id}/lists`), { name: 'X' }).expect(403);

      await owner.delete(api(`/members/${elifId}`)).expect(204);
      expect(await ctx.prisma.spaceMember.count({ where: { userId: elifId } })).toBe(0);
    });

    it("başka workspace'in Space/List kayıtları 404 döner (ADR-012)", async () => {
      const other = await ctx.prisma.$transaction(async (tx) => {
        const w = await tx.workspace.create({ data: { name: 'Başka Kurum' } });
        await ctx.app.get(AccessService).createSystemRoles(tx, w.id);
        const s = await tx.space.create({
          data: { workspaceId: w.id, name: 'Gizli', key: 'GIZ', color: '#000000', rank: 'a0' },
        });
        const l = await tx.list.create({
          data: { workspaceId: w.id, spaceId: s.id, name: 'Liste', rank: 'a0' },
        });
        return { space: s.id, list: l.id };
      });
      await owner.get(api(`/spaces/${other.space}`)).expect(404);
      await owner.get(api(`/lists/${other.list}`)).expect(404);
      await owner.patch(api(`/lists/${other.list}`), { name: 'Ele geçir' }).expect(404);
      await owner.put(api(`/favorites/LIST/${other.list}`)).expect(404);
    });
  });

  describe('Folder ve List', () => {
    it("oluşturur, yeniden adlandırır, sıralar ve Folder'lar arasında taşır", async () => {
      const space = await createSpace(owner);
      const folder = (
        (await owner.post(api(`/spaces/${space}/folders`), { name: 'Sürüm 2.0' }).expect(201))
          .body as Created
      ).id;
      const dev = (
        (
          await owner
            .post(api(`/spaces/${space}/lists`), { name: 'Geliştirme', folderId: folder })
            .expect(201)
        ).body as Created
      ).id;
      const bugs = (
        (
          await owner
            .post(api(`/spaces/${space}/lists`), { name: 'Hatalar', folderId: folder })
            .expect(201)
        ).body as Created
      ).id;

      await owner.patch(api(`/lists/${bugs}`), { name: 'Hata Kayıtları' }).expect(204);
      await owner.post(api(`/lists/${bugs}/move`), { folderId: folder, afterId: null }).expect(204);
      let s = (await tree(owner)).spaces[0]!;
      expect(s.folders[0]!.lists.map((l) => l.name)).toEqual(['Hata Kayıtları', 'Geliştirme']);

      // Köke taşı: "Görevler"in arkasına.
      const root = s.lists[0]!.id;
      await owner.post(api(`/lists/${dev}/move`), { folderId: null, afterId: root }).expect(204);
      s = (await tree(owner)).spaces[0]!;
      expect(s.lists.map((l) => l.name)).toEqual(['Görevler', 'Geliştirme']);
      expect(s.folders[0]!.lists.map((l) => l.name)).toEqual(['Hata Kayıtları']);

      const detail = (await owner.get(api(`/lists/${bugs}`)).expect(200)).body as ListDetail;
      expect(detail).toMatchObject({
        name: 'Hata Kayıtları',
        folder: { id: folder, name: 'Sürüm 2.0' },
        space: { id: space, name: 'Mobil Uygulama' },
        archived: false,
      });
      const folderDetail = (await owner.get(api(`/folders/${folder}`)).expect(200))
        .body as FolderDetail;
      expect(folderDetail.lists.map((l) => l.name)).toEqual(['Hata Kayıtları']);

      const actions = (
        await ctx.prisma.activityEvent.findMany({
          where: { entityType: 'list', entityId: { in: [dev, bugs] } },
          orderBy: { createdAt: 'asc' },
        })
      ).map((e) => e.action);
      expect(actions).toEqual(['list.created', 'list.created', 'list.renamed', 'list.moved']);
    });

    it("başka Space'in Folder'ına liste oluşturulamaz veya taşınamaz", async () => {
      const a = await createSpace(owner);
      const b = await createSpace(owner, { name: 'Web', key: 'WEB' });
      const folderB = (
        (await owner.post(api(`/spaces/${b}/folders`), { name: 'F' }).expect(201)).body as Created
      ).id;
      await owner.post(api(`/spaces/${a}/lists`), { name: 'X', folderId: folderB }).expect(404);
      const listA = (await tree(owner)).spaces.find((s) => s.id === a)!.lists[0]!.id;
      await owner
        .post(api(`/lists/${listA}/move`), { folderId: folderB, afterId: null })
        .expect(404);
    });

    it('Space sırasını yalnızca Owner/Admin değiştirir', async () => {
      const mob = await createSpace(owner);
      const web = await createSpace(owner, { name: 'Web', key: 'WEB' });
      await owner.post(api(`/spaces/${web}/move`), { afterId: null }).expect(204);
      expect((await tree(owner)).spaces.map((s) => s.id)).toEqual([web, mob]);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.post(api(`/spaces/${mob}/move`), { afterId: null }).expect(403);
    });
  });

  describe('arşiv, çöp kutusu ve favoriler (ADR-041)', () => {
    it('arşivlenen liste ağaçtan kalkar, bağlantıyla açılır ve geri gelir', async () => {
      const space = await createSpace(owner);
      const list = (await tree(owner)).spaces[0]!.lists[0]!.id;

      await owner.post(api(`/lists/${list}/archive`)).expect(204);
      expect((await tree(owner)).spaces[0]!.lists).toEqual([]);
      const detail = (await owner.get(api(`/lists/${list}`)).expect(200)).body as ListDetail;
      expect(detail.archived).toBe(true);
      const archive = (await owner.get(api('/archive')).expect(200)).body as ArchiveResponse;
      expect(archive.archived).toMatchObject([
        { type: 'LIST', id: list, location: 'Mobil Uygulama' },
      ]);

      // Arşivdeki Space'e liste eklenemez.
      await owner.post(api(`/spaces/${space}/archive`)).expect(204);
      const res = await owner.post(api(`/spaces/${space}/lists`), { name: 'X' }).expect(409);
      expect(res.body).toEqual({ code: 'CONTAINER_ARCHIVED' });
      await owner.post(api(`/spaces/${space}/unarchive`)).expect(204);

      await owner.post(api(`/lists/${list}/unarchive`)).expect(204);
      expect((await tree(owner)).spaces[0]!.lists.map((l) => l.id)).toEqual([list]);
    });

    it('silinen Folder alt listeleriyle gizlenir, geri getirilince hepsi döner', async () => {
      const space = await createSpace(owner);
      const folder = (
        (await owner.post(api(`/spaces/${space}/folders`), { name: 'F' }).expect(201))
          .body as Created
      ).id;
      const list = (
        (
          await owner
            .post(api(`/spaces/${space}/lists`), { name: 'L', folderId: folder })
            .expect(201)
        ).body as Created
      ).id;

      await owner.delete(api(`/folders/${folder}`)).expect(204);
      expect((await tree(owner)).spaces[0]!.folders).toEqual([]);
      await owner.get(api(`/lists/${list}`)).expect(404);
      const archive = (await owner.get(api('/archive')).expect(200)).body as ArchiveResponse;
      expect(archive.trash).toMatchObject([{ type: 'FOLDER', id: folder, by: 'Zeynep Kaya' }]);
      expect(archive.retentionDays).toBe(30);

      // Çöpteki öğe yeniden silinemez; çöpte olmayan geri getirilemez.
      await owner.delete(api(`/folders/${folder}`)).expect(404);
      await owner.post(api(`/lists/${list}/restore`)).expect(404);

      await owner.post(api(`/folders/${folder}/restore`)).expect(204);
      expect((await tree(owner)).spaces[0]!.folders[0]!.lists.map((l) => l.id)).toEqual([list]);
    });

    it('30 günden eski çöp kalıcı silinir, yenisi kalır', async () => {
      const space = await createSpace(owner);
      const old = await createSpace(owner, { name: 'Eski', key: 'OLD' });
      await owner.delete(api(`/spaces/${old}`)).expect(204);
      await owner.delete(api(`/spaces/${space}`)).expect(204);
      await ctx.prisma.space.update({
        where: { id: old },
        data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
      });

      const purged = await ctx.app.get(LifecycleService).purgeExpired();
      expect(purged).toBe(1);
      expect(await ctx.prisma.space.count()).toBe(1);
      // Silinen Space'in anahtarı rezerve kalır (ADR-033).
      await owner.post(api('/spaces'), { name: 'Yeni', key: 'OLD', color: '#4F46E5' }).expect(409);
    });

    it('favoriler eklenir, çıkarılır; silinen öğe favorilerde görünmez', async () => {
      const space = await createSpace(owner);
      const list = (await tree(owner)).spaces[0]!.lists[0]!.id;
      await owner.put(api(`/favorites/LIST/${list}`)).expect(204);
      await owner.put(api(`/favorites/SPACE/${space}`)).expect(204);
      await owner.put(api(`/favorites/LIST/${list}`)).expect(204);
      expect((await tree(owner)).favorites.map((f) => [f.type, f.name])).toEqual([
        ['LIST', 'Görevler'],
        ['SPACE', 'Mobil Uygulama'],
      ]);

      await owner.delete(api(`/lists/${list}`)).expect(204);
      expect((await tree(owner)).favorites.map((f) => f.type)).toEqual(['SPACE']);
      await owner.delete(api(`/favorites/SPACE/${space}`)).expect(204);
      expect((await tree(owner)).favorites).toEqual([]);
      await owner.put(api(`/favorites/FOO/${space}`)).expect(400);
    });

    it('Stakeholder arşiv sayfasında hiçbir şey görmez', async () => {
      const space = await createSpace(owner);
      await owner.post(api(`/spaces/${space}/archive`)).expect(204);
      const mert = await inviteAndAccept(ctx, owner, ws, MERT);
      const archive = (await mert.get(api('/archive')).expect(200)).body as ArchiveResponse;
      expect(archive).toMatchObject({ archived: [], trash: [] });
    });
  });

  async function inviteGuest(spaceId: string): Promise<Client> {
    await owner
      .post(api('/invitations'), { emails: [GUEST.email], role: 'GUEST', spaceIds: [spaceId] })
      .expect(204);
    const token = tokenFromMail(ctx, INVITE_LINK);
    const guest = await Client.create(ctx.app);
    await guest
      .post(`/api/invitations/${token}/accept`, { name: GUEST.name, password: GUEST.password })
      .expect(200);
    return guest;
  }
});
