import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  MyWorkResponse,
  SearchResponse,
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

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('Global arama ve Benim işlerim (gerçek veritabanı)', () => {
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
  const search = async (q: string, client = owner) =>
    (
      (await client.get(api(`/search?q=${encodeURIComponent(q)}`)).expect(200))
        .body as SearchResponse
    ).items.map((i) => i.key);
  const myWork = async (scope: string, client = owner, includeDone = false) =>
    (
      (await client.get(api(`/my-work?scope=${scope}&includeDone=${includeDone}`)).expect(200))
        .body as MyWorkResponse
    ).items.map((i) => i.key);

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

  describe('global arama (ADR-053)', () => {
    it('başlık, ön ek, açıklama ve kimlikle bulur; satır bağlamı döner', async () => {
      const s = await space();
      const a = await create(s.listId, { type: 'TASK', title: 'Ödeme ekranı tasarımı' });
      await create(s.listId, { type: 'TASK', title: 'Rapor' });
      await owner
        .patch(api(`/items/${a.id}`), { description: doc('Kredi kartı doğrulaması eklenecek') })
        .expect(204);

      expect(await search('ödeme')).toEqual(['MOB-1']);
      expect(await search('ödem')).toEqual(['MOB-1']); // ön ek
      expect(await search('kredi kartı')).toEqual(['MOB-1']); // açıklamada
      expect(await search('mob-2')).toEqual(['MOB-2']); // kimlik
      expect(await search('bulunmayan')).toEqual([]);
      expect(await search('   ')).toEqual([]);

      const res = (await owner.get(api('/search?q=rapor')).expect(200)).body as SearchResponse;
      expect(res.items[0]).toMatchObject({
        key: 'MOB-2',
        space: { key: 'MOB', name: 'Mobil Uygulama' },
        list: { name: 'Görevler' },
        status: { category: 'NOT_STARTED' },
      });
    });

    it('doküman sayfalarını başlık ve metinden bulur; görünmeyen Space ve silinen sayfa çıkmaz', async () => {
      const s = await space();
      const page = (
        await owner
          .post(api(`/spaces/${s.id}/docs`), {
            title: 'Dağıtım rehberi',
            content: doc('Sunucuya kurulum adımları'),
          })
          .expect(201)
      ).body as Created;
      const gone = (
        await owner.post(api(`/spaces/${s.id}/docs`), { title: 'Silinecek rehber' }).expect(201)
      ).body as Created;
      await owner.delete(api(`/docs/${gone.id}`)).expect(204);

      const docs = async (q: string, client = owner) =>
        (
          (await client.get(api(`/search?q=${encodeURIComponent(q)}`)).expect(200))
            .body as SearchResponse
        ).docs.map((d) => d.id);
      expect(await docs('rehber')).toEqual([page.id]); // başlık, silinen yok
      expect(await docs('kurulum')).toEqual([page.id]); // metin
      expect(await docs('kurul')).toEqual([page.id]); // ön ek
      expect(await docs('bulunmayan')).toEqual([]);

      const hidden = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      await owner.post(api(`/spaces/${hidden.id}/docs`), { title: 'Gizli rehber' }).expect(201);
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      expect(await docs('rehber', elif)).toEqual([page.id]);
    });

    it('% ve _ düz karakterdir; tırnak ve SQL parçaları zarar vermez', async () => {
      const s = await space();
      await create(s.listId, { type: 'TASK', title: 'Yüzde %50 indirim' });
      await create(s.listId, { type: 'TASK', title: 'Normal iş' });
      expect(await search('%50')).toEqual(['MOB-1']);
      expect(await search('%')).toEqual(['MOB-1']);
      expect(await search("'; DROP TABLE work_items; --")).toEqual([]);
      expect(await search('normal & | ! ( )')).toEqual(['MOB-2']);
    });

    it('görünmeyen Space, silinen ve arşivlenen öğeler sonuçta yok', async () => {
      const open = await space();
      const hidden = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      await create(open.listId, { type: 'TASK', title: 'Sprint planı' });
      await create(hidden.listId, { type: 'TASK', title: 'Sprint gizli' });
      const gone = await create(open.listId, { type: 'TASK', title: 'Sprint silinen' });
      const old = await create(open.listId, { type: 'TASK', title: 'Sprint arşiv' });
      await owner.delete(api(`/items/${gone.id}`)).expect(204);
      await owner.post(api(`/items/${old.id}/archive`)).expect(204);

      expect((await search('sprint')).sort()).toEqual(['GIZ-1', 'MOB-1']);

      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      expect(await search('sprint', elif)).toEqual(['MOB-1']);
      expect(await search('giz-1', elif)).toEqual([]);
    });

    it('çalışma alanı dışından erişim 404', async () => {
      const other = await ctx.prisma.workspace.create({ data: { name: 'Başka' } });
      await owner.get(`/api/workspaces/${other.id}/search?q=x`).expect(404);
    });
  });

  describe('Benim işlerim (ADR-054)', () => {
    it('atanan, oluşturduğum ve izlediğim ayrı listelenir; tamamlananlar varsayılan gizli', async () => {
      const s = await space();
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;

      const mine = await create(s.listId, { type: 'TASK', title: 'Benim', dueDate: '2026-11-01' });
      await create(s.listId, { type: 'TASK', title: "Elif'in", assigneeIds: [elifId] });
      const finished = await create(s.listId, { type: 'TASK', title: 'Biten' });
      await owner.patch(api(`/items/${finished.id}`), { statusId: done.id }).expect(204);
      const noDue = await create(s.listId, { type: 'TASK', title: 'Tarihsiz' });
      await owner.patch(api(`/items/${noDue.id}`), { dueDate: null }).expect(204);

      // Oluşturduklarım: owner'ın açtıkları (tamamlanan hariç), bitiş tarihi yakın olan önce.
      expect(await myWork('created')).toEqual([mine.key, 'MOB-4', 'MOB-2']);
      expect(await myWork('created', owner, true)).toContain('MOB-3');
      expect(await myWork('assigned')).toEqual([]);
      // Elif atanmış ve otomatik izleyici.
      expect(await myWork('assigned', elif)).toEqual(['MOB-2']);
      expect(await myWork('watching', elif)).toEqual(['MOB-2']);
      expect(await myWork('created', elif)).toEqual([]);

      await owner.get(api('/my-work?scope=bilinmeyen')).expect(400);
    });

    it("görmediği Space'teki atanan öğe listelenmez", async () => {
      const hidden = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await create(hidden.listId, { type: 'TASK', title: 'Gizli iş', assigneeIds: [elifId] });
      expect(await myWork('assigned', elif)).toEqual([]);
      expect(await myWork('created')).toEqual(['GIZ-1']);
    });
  });
});
