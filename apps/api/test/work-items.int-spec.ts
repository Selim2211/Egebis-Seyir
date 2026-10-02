import type {
  ArchiveResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  SpaceDetail,
  WorkItemDetail,
  WorkItemsResponse,
} from '@scrum/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LifecycleService } from '../src/modules/spaces/lifecycle.service';
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

describe('İş öğeleri (gerçek veritabanı)', () => {
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
    const listId = tree.spaces.find((s) => s.id === id)!.lists[0]!.id;
    return { id, listId, statuses: detail.statuses };
  };

  const create = async (listId: string, body: Record<string, unknown>, client = owner) =>
    (await client.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const item = async (id: string, client = owner) =>
    (await client.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const itemsOf = async (listId: string) =>
    (await owner.get(api(`/lists/${listId}/items`)).expect(200)).body as WorkItemsResponse;

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

  describe('oluşturma ve okunabilir ID (ADR-033, ADR-044)', () => {
    it("ID'ler Space sayacıyla artar; öğe ilk durumla, oluşturanı bildiren olarak açılır", async () => {
      const s = await space();
      const a = await create(s.listId, { type: 'STORY', title: 'Giriş ekranı' });
      const b = await create(s.listId, { type: 'TASK', title: 'API' });
      expect([a.key, b.key]).toEqual(['MOB-1', 'MOB-2']);

      const detail = await item(a.id);
      expect(detail).toMatchObject({
        key: 'MOB-1',
        type: 'STORY',
        title: 'Giriş ekranı',
        priority: 'NORMAL',
        statusId: s.statuses[0]!.id,
        reporter: { name: 'Zeynep Kaya' },
        completedAt: null,
        archived: false,
      });
      const events = await ctx.prisma.activityEvent.findMany({ where: { entityId: a.id } });
      expect(events.map((e) => e.action)).toEqual(['item.created']);
    });

    it("anahtar değişse de eski ID'ler sabit, sayaç kaldığı yerden sürer", async () => {
      const s = await space();
      const a = await create(s.listId, { type: 'TASK', title: 'A' });
      await owner.patch(api(`/spaces/${s.id}`), { key: 'APP' }).expect(204);
      const b = await create(s.listId, { type: 'TASK', title: 'B' });
      expect([a.key, b.key]).toEqual(['MOB-1', 'APP-2']);

      // Anahtarla çözümleme Space'ten bağımsız, büyük/küçük harf duyarsız.
      const res = await owner.get(api('/items/key/mob-1')).expect(200);
      expect((res.body as WorkItemDetail).id).toBe(a.id);
      await owner.get(api('/items/key/MOB-99')).expect(404);
      const bad = await owner.get(api('/items/key/gecersiz')).expect(400);
      expect(bad.body).toEqual({ code: 'WORK_ITEM_KEY_INVALID' });
    });

    it("farklı Space'lerin sayaçları bağımsızdır", async () => {
      const mob = await space();
      const web = await space({ name: 'Web', key: 'WEB' });
      expect((await create(mob.listId, { type: 'TASK', title: 'x' })).key).toBe('MOB-1');
      expect((await create(web.listId, { type: 'TASK', title: 'x' })).key).toBe('WEB-1');
    });

    it('eşzamanlı oluşturmada ID çakışmaz', async () => {
      const s = await space();
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => create(s.listId, { type: 'TASK', title: `T${i}` })),
      );
      expect(new Set(results.map((r) => r.key)).size).toBe(8);
    });
  });

  describe('hiyerarşi ve tipe özel kurallar (brief §6.2)', () => {
    it('Story → Epic, Task → Story, Sub-task → Task bağlanır; bozuk bağ reddedilir', async () => {
      const s = await space();
      const epic = await create(s.listId, {
        type: 'EPIC',
        title: 'E',
        goal: 'Hedef',
        tshirtSize: 'L',
      });
      const story = await create(s.listId, { type: 'STORY', title: 'S', parentId: epic.id });
      const task = await create(s.listId, { type: 'TASK', title: 'T', parentId: story.id });
      await create(s.listId, { type: 'SUBTASK', title: 'ST', parentId: task.id });

      const bad = await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'X', parentId: epic.id })
        .expect(422);
      expect(bad.body).toEqual({ code: 'WORK_ITEM_PARENT_NOT_ALLOWED' });
      const orphan = await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'SUBTASK', title: 'X' })
        .expect(422);
      expect(orphan.body).toEqual({ code: 'WORK_ITEM_PARENT_REQUIRED' });

      const detail = await item(task.id);
      expect(detail.ancestors.map((a) => a.key)).toEqual(['MOB-1', 'MOB-2']);
      expect(detail.children.map((c) => c.type)).toEqual(['SUBTASK']);
      // Üst öğe değiştirirken de kural geçerli.
      const res = await owner.patch(api(`/items/${task.id}`), { parentId: epic.id }).expect(422);
      expect(res.body).toEqual({ code: 'WORK_ITEM_PARENT_NOT_ALLOWED' });
    });

    it("üst öğe başka Space'te olamaz", async () => {
      const a = await space();
      const b = await space({ name: 'Web', key: 'WEB' });
      const epic = await create(a.listId, { type: 'EPIC', title: 'E' });
      const res = await owner
        .post(api(`/lists/${b.listId}/items`), { type: 'STORY', title: 'S', parentId: epic.id })
        .expect(422);
      expect(res.body).toEqual({ code: 'WORK_ITEM_PARENT_SPACE' });
    });

    it('Story Point yalnızca Story/Bug/Epic, saat yalnızca Task/Sub-task; ölçeğe uymalı', async () => {
      const s = await space();
      await create(s.listId, { type: 'STORY', title: 'S', points: 5 });
      await create(s.listId, { type: 'TASK', title: 'T', estimateHours: 3.5 });

      const taskPoints = await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'T', points: 3 })
        .expect(422);
      expect(taskPoints.body).toEqual({ code: 'WORK_ITEM_ESTIMATE_NOT_ALLOWED' });
      const storyHours = await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'STORY', title: 'S', estimateHours: 2 })
        .expect(422);
      expect(storyHours.body).toEqual({ code: 'WORK_ITEM_ESTIMATE_NOT_ALLOWED' });
      const notFibonacci = await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'STORY', title: 'S', points: 4 })
        .expect(422);
      expect(notFibonacci.body).toEqual({ code: 'WORK_ITEM_ESTIMATE_INVALID' });
    });

    it("Bug alanları yalnızca Bug'da; basit liste Space'inde Epic/Story yok", async () => {
      const s = await space();
      await create(s.listId, {
        type: 'BUG',
        title: 'Çökme',
        severity: 'CRITICAL',
        stepsToReproduce: '1. Aç',
        points: 3,
      });
      const res = await owner
        .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'T', severity: 'MAJOR' })
        .expect(422);
      expect(res.body).toEqual({ code: 'WORK_ITEM_FIELD_NOT_ALLOWED' });

      const simple = await space({ name: 'Basit', key: 'BAS', scrumEnabled: false });
      await create(simple.listId, { type: 'TASK', title: 'T' });
      const epic = await owner
        .post(api(`/lists/${simple.listId}/items`), { type: 'EPIC', title: 'E' })
        .expect(422);
      expect(epic.body).toEqual({ code: 'WORK_ITEM_TYPE_NOT_ALLOWED' });
    });

    it('bitiş tarihi başlangıçtan önce olamaz', async () => {
      const s = await space();
      await owner
        .post(api(`/lists/${s.listId}/items`), {
          type: 'TASK',
          title: 'T',
          startDate: '2026-10-10',
          dueDate: '2026-10-01',
        })
        .expect(400);
      const ok = await create(s.listId, {
        type: 'TASK',
        title: 'T',
        startDate: '2026-10-01',
        dueDate: '2026-10-10',
      });
      expect(await item(ok.id)).toMatchObject({ startDate: '2026-10-01', dueDate: '2026-10-10' });
      await owner.patch(api(`/items/${ok.id}`), { dueDate: '2026-09-01' }).expect(400);
    });

    it("Epic ilerlemesi point ağırlıklı, saat rollup'u alt öğelerden gelir", async () => {
      const s = await space();
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const epic = await create(s.listId, { type: 'EPIC', title: 'E' });
      const s1 = await create(s.listId, {
        type: 'STORY',
        title: 'S1',
        parentId: epic.id,
        points: 8,
      });
      await create(s.listId, { type: 'STORY', title: 'S2', parentId: epic.id, points: 2 });
      await owner.patch(api(`/items/${s1.id}`), { statusId: done.id }).expect(204);
      expect((await item(epic.id)).progress).toBe(80);

      const story = await create(s.listId, { type: 'STORY', title: 'S3' });
      await create(s.listId, { type: 'TASK', title: 'T1', parentId: story.id, estimateHours: 2 });
      await create(s.listId, { type: 'TASK', title: 'T2', parentId: story.id, estimateHours: 3.5 });
      expect((await item(story.id)).rolledUpHours).toBe(5.5);
      expect((await item(story.id)).progress).toBeNull();
    });
  });

  describe('güncelleme, durum ve tamamlanma (ADR-046)', () => {
    it("Done'a geçince completedAt yazılır, geri alınınca silinir; hepsi loglanır", async () => {
      const s = await space();
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const active = s.statuses.find((x) => x.category === 'ACTIVE')!;
      const t = await create(s.listId, { type: 'TASK', title: 'T' });

      await owner.patch(api(`/items/${t.id}`), { statusId: done.id }).expect(204);
      expect((await item(t.id)).completedAt).not.toBeNull();
      await owner.patch(api(`/items/${t.id}`), { statusId: active.id }).expect(204);
      expect((await item(t.id)).completedAt).toBeNull();

      const events = await ctx.prisma.activityEvent.findMany({
        where: { entityId: t.id, action: 'item.updated' },
        orderBy: { createdAt: 'asc' },
      });
      expect(events).toHaveLength(2);
      expect(events[0]!.changes).toMatchObject({
        statusId: { to: done.id },
        completedAt: { from: null },
      });
    });

    it("açık alt öğesi olan öğe Done'a çekilirken uyarılır; force ile geçer", async () => {
      const s = await space();
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const story = await create(s.listId, { type: 'STORY', title: 'S' });
      await create(s.listId, { type: 'TASK', title: 'T', parentId: story.id });

      const res = await owner.patch(api(`/items/${story.id}`), { statusId: done.id }).expect(409);
      expect(res.body).toEqual({ code: 'WORK_ITEM_OPEN_CHILDREN', details: { count: 1 } });
      await owner.patch(api(`/items/${story.id}`), { statusId: done.id, force: true }).expect(204);
    });

    it('atananlar ve etiketler değişir; geçersiz atanan/etiket reddedilir', async () => {
      const s = await space();
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      const label = (
        (await owner.post(api(`/spaces/${s.id}/labels`), { name: 'ön yüz' }).expect(201))
          .body as Created
      ).id;
      const t = await create(s.listId, {
        type: 'TASK',
        title: 'T',
        assigneeIds: [elifId],
        labelIds: [label],
      });

      expect(await item(t.id, elif)).toMatchObject({
        assignees: [{ id: elifId, name: 'Elif Demir' }],
        labels: [{ id: label, name: 'ön yüz' }],
      });
      await owner.patch(api(`/items/${t.id}`), { assigneeIds: [], labelIds: [] }).expect(204);
      expect(await item(t.id)).toMatchObject({ assignees: [], labels: [] });

      const stranger = '019a0000-0000-7000-8000-000000000000';
      await owner.patch(api(`/items/${t.id}`), { assigneeIds: [stranger] }).expect(404);
      await owner.patch(api(`/items/${t.id}`), { labelIds: [stranger] }).expect(404);
    });

    it('değişiklik yoksa aktivite kaydı oluşmaz', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'TASK', title: 'T' });
      await owner.patch(api(`/items/${t.id}`), { title: 'T' }).expect(204);
      expect(await ctx.prisma.activityEvent.count({ where: { entityId: t.id } })).toBe(1);
    });
  });

  describe('yetkiler (brief §7.2)', () => {
    it('Developer yazar, kendi öğesinin durumunu değiştirir; Stakeholder yalnızca okur', async () => {
      const s = await space({ isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const mert = await inviteAndAccept(ctx, owner, ws, MERT);
      const ids = Object.fromEntries(
        await Promise.all(
          [ELIF, MERT].map(async (p) => [
            p.email,
            (await ctx.prisma.user.findUniqueOrThrow({ where: { email: p.email } })).id,
          ]),
        ),
      ) as Record<string, string>;
      await owner
        .put(api(`/spaces/${s.id}/members/${ids[ELIF.email]}`), { role: 'DEVELOPER' })
        .expect(204);
      await owner
        .put(api(`/spaces/${s.id}/members/${ids[MERT.email]}`), { role: 'STAKEHOLDER' })
        .expect(204);

      const active = s.statuses.find((x) => x.category === 'ACTIVE')!;
      const mine = await create(
        s.listId,
        { type: 'TASK', title: "Elif'in", assigneeIds: [ids[ELIF.email]!] },
        elif,
      );
      const other = await create(s.listId, { type: 'TASK', title: 'Başkasının' }, owner);

      // Stakeholder görür ama yazamaz.
      expect((await item(mine.id, mert)).title).toBe("Elif'in");
      await mert.post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'x' }).expect(403);
      await mert.patch(api(`/items/${mine.id}`), { title: 'değişti' }).expect(403);
      await mert.patch(api(`/items/${mine.id}`), { statusId: active.id }).expect(403);
      await mert.delete(api(`/items/${mine.id}`)).expect(403);

      // Developer'ın WORK_ITEM_WRITE izni vardır: başkasının öğesini de düzenler.
      await elif.patch(api(`/items/${other.id}`), { statusId: active.id }).expect(204);
      await elif.patch(api(`/items/${mine.id}`), { estimateHours: 4 }).expect(204);
    });

    it("özel Space'in öğeleri üye olmayana 404; ID ile de bulunamaz", async () => {
      const s = await space({ isPrivate: true });
      const t = await create(s.listId, { type: 'TASK', title: 'Gizli' });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      await elif.get(api(`/items/${t.id}`)).expect(404);
      await elif.get(api('/items/key/MOB-1')).expect(404);
      await elif.get(api(`/lists/${s.listId}/items`)).expect(404);
    });

    it('çalışma alanı dışından erişim 404 (ADR-012)', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'TASK', title: 'T' });
      const other = await ctx.prisma.workspace.create({ data: { name: 'Başka' } });
      await owner.get(`/api/workspaces/${other.id}/items/${t.id}`).expect(404);
    });
  });

  describe('sıralama, taşıma ve kopyalama (ADR-047)', () => {
    it("List'te rank sırasıyla gelir; taşıma sırayı ve listeyi değiştirir", async () => {
      const s = await space();
      const second = (
        (await owner.post(api(`/spaces/${s.id}/lists`), { name: 'Hatalar' }).expect(201))
          .body as Created
      ).id;
      const a = await create(s.listId, { type: 'TASK', title: 'A' });
      const b = await create(s.listId, { type: 'TASK', title: 'B' });
      const c = await create(s.listId, { type: 'TASK', title: 'C' });
      expect((await itemsOf(s.listId)).items.map((i) => i.title)).toEqual(['A', 'B', 'C']);

      await owner.post(api(`/items/${c.id}/move`), { listId: s.listId, afterId: null }).expect(204);
      expect((await itemsOf(s.listId)).items.map((i) => i.title)).toEqual(['C', 'A', 'B']);
      await owner.post(api(`/items/${a.id}/move`), { listId: s.listId, afterId: b.id }).expect(204);
      expect((await itemsOf(s.listId)).items.map((i) => i.title)).toEqual(['C', 'B', 'A']);

      await owner.post(api(`/items/${b.id}/move`), { listId: second, afterId: null }).expect(204);
      expect((await itemsOf(second)).items.map((i) => i.key)).toEqual(['MOB-2']);
    });

    it("başka Space'e taşıma: ID sabit, durum ve etiket eşlenir, alt öğeler gelir", async () => {
      const a = await space();
      const b = await space({ name: 'Web', key: 'WEB' });
      const done = a.statuses.find((x) => x.category === 'DONE')!;
      const label = (
        (await owner.post(api(`/spaces/${a.id}/labels`), { name: 'acil' }).expect(201))
          .body as Created
      ).id;
      await owner
        .post(api(`/spaces/${b.id}/labels`), { name: 'Acil', color: '#BE123C' })
        .expect(201);

      const story = await create(a.listId, { type: 'STORY', title: 'S', labelIds: [label] });
      const task = await create(a.listId, { type: 'TASK', title: 'T', parentId: story.id });
      await owner.patch(api(`/items/${task.id}`), { statusId: done.id }).expect(204);

      await owner
        .post(api(`/items/${story.id}/move`), { listId: b.listId, afterId: null })
        .expect(204);
      const moved = await item(story.id);
      expect(moved).toMatchObject({ key: 'MOB-1', spaceId: b.id, listId: b.listId });
      expect(moved.labels.map((l) => l.name)).toEqual(['Acil']);
      const movedTask = await item(task.id);
      expect(movedTask).toMatchObject({ key: 'MOB-2', spaceId: b.id, parentId: story.id });
      expect(b.statuses.find((x) => x.id === movedTask.statusId)!.category).toBe('DONE');
      expect(movedTask.completedAt).not.toBeNull();

      // Eski Space artık kendi içinde boş; yeni öğe eski sayaçla devam eder.
      expect((await itemsOf(a.listId)).items).toEqual([]);
      expect((await create(a.listId, { type: 'TASK', title: 'Yeni' })).key).toBe('MOB-3');
    });

    it("Sub-task tek başına başka Space'e taşınamaz; hedefte yazma izni gerekir", async () => {
      const a = await space();
      const b = await space({ name: 'Web', key: 'WEB' });
      const task = await create(a.listId, { type: 'TASK', title: 'T' });
      const sub = await create(a.listId, { type: 'SUBTASK', title: 'ST', parentId: task.id });
      const res = await owner
        .post(api(`/items/${sub.id}/move`), { listId: b.listId, afterId: null })
        .expect(422);
      expect(res.body).toEqual({ code: 'WORK_ITEM_PARENT_REQUIRED' });

      const privateSpace = await space({ name: 'Gizli', key: 'GIZ', isPrivate: true });
      const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
      const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
      await owner.put(api(`/spaces/${a.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
      await elif
        .post(api(`/items/${task.id}/move`), { listId: privateSpace.listId, afterId: null })
        .expect(404);
    });

    it('kopya yeni ID alır, başlangıç durumuna döner; alt öğeler isteğe bağlı kopyalanır', async () => {
      const s = await space();
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const story = await create(s.listId, { type: 'STORY', title: 'S', points: 3 });
      const task = await create(s.listId, { type: 'TASK', title: 'T', parentId: story.id });
      await owner.patch(api(`/items/${story.id}`), { statusId: done.id, force: true }).expect(204);
      await owner.patch(api(`/items/${task.id}`), { statusId: done.id }).expect(204);

      const shallow = (
        await owner.post(api(`/items/${story.id}/copy`), { includeChildren: false }).expect(201)
      ).body as CreatedItem;
      expect(shallow.key).toBe('MOB-3');
      expect(await item(shallow.id)).toMatchObject({
        title: 'S',
        points: 3,
        statusId: s.statuses[0]!.id,
        completedAt: null,
        children: [],
      });

      const deep = (
        await owner.post(api(`/items/${story.id}/copy`), { includeChildren: true }).expect(201)
      ).body as CreatedItem;
      expect(deep.key).toBe('MOB-4');
      const copy = await item(deep.id);
      expect(copy.children).toHaveLength(1);
      expect(copy.children[0]).toMatchObject({ key: 'MOB-5', title: 'T', parentId: deep.id });
    });
  });

  describe('arşiv, çöp kutusu ve toplu düzenleme', () => {
    it('silme alt öğelerle birlikte; geri getirme hepsini döndürür; çöp listesinde yalnızca kök', async () => {
      const s = await space();
      const story = await create(s.listId, { type: 'STORY', title: 'S' });
      const task = await create(s.listId, { type: 'TASK', title: 'T', parentId: story.id });

      await owner.delete(api(`/items/${story.id}`)).expect(204);
      expect((await itemsOf(s.listId)).items).toEqual([]);
      await owner.get(api(`/items/${task.id}`)).expect(404);
      await owner.delete(api(`/items/${story.id}`)).expect(404);

      const archive = (await owner.get(api('/archive')).expect(200)).body as ArchiveResponse;
      expect(archive.trash).toMatchObject([{ type: 'ITEM', id: story.id, by: 'Zeynep Kaya' }]);
      expect(archive.trash[0]!.name).toBe('MOB-1 S');

      // Alt öğe tek başına geri getirilemez (üst öğe de çöpte).
      await owner.post(api(`/items/${task.id}/restore`)).expect(404);
      await owner.post(api(`/items/${story.id}/restore`)).expect(204);
      expect((await itemsOf(s.listId)).items.map((i) => i.key)).toEqual(['MOB-1', 'MOB-2']);
    });

    it('arşivlenen öğe listeden kalkar, ID ile açılır ve geri gelir', async () => {
      const s = await space();
      const t = await create(s.listId, { type: 'TASK', title: 'T' });
      await owner.post(api(`/items/${t.id}/archive`)).expect(204);
      expect((await itemsOf(s.listId)).items).toEqual([]);
      expect((await item(t.id)).archived).toBe(true);
      const archive = (await owner.get(api('/archive')).expect(200)).body as ArchiveResponse;
      expect(archive.archived).toMatchObject([{ type: 'ITEM', id: t.id }]);
      await owner.post(api(`/items/${t.id}/unarchive`)).expect(204);
      expect((await itemsOf(s.listId)).items).toHaveLength(1);
    });

    it("30 günden eski çöp kalıcı silinir; kalıcı silinen öğenin ID'si yeniden kullanılmaz", async () => {
      const s = await space();
      const a = await create(s.listId, { type: 'TASK', title: 'A' });
      await owner.delete(api(`/items/${a.id}`)).expect(204);
      await ctx.prisma.workItem.update({
        where: { id: a.id },
        data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
      });
      expect(await ctx.app.get(LifecycleService).purgeExpired()).toBe(1);
      expect(await ctx.prisma.workItem.count()).toBe(0);
      expect((await create(s.listId, { type: 'TASK', title: 'B' })).key).toBe('MOB-2');
    });

    it('toplu düzenleme: durum, öncelik, atanan ve etiket; yabancı öğe 404', async () => {
      const s = await space();
      const other = await space({ name: 'Web', key: 'WEB' });
      const done = s.statuses.find((x) => x.category === 'DONE')!;
      const elifId = (
        await (async () => {
          await inviteAndAccept(ctx, owner, ws, ELIF);
          return ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } });
        })()
      ).id;
      const label = (
        (await owner.post(api(`/spaces/${s.id}/labels`), { name: 'sprint-3' }).expect(201))
          .body as Created
      ).id;
      const a = await create(s.listId, { type: 'TASK', title: 'A' });
      const b = await create(s.listId, { type: 'TASK', title: 'B' });
      const foreign = await create(other.listId, { type: 'TASK', title: 'Z' });

      await owner
        .post(api(`/spaces/${s.id}/items/bulk`), {
          ids: [a.id, b.id],
          patch: {
            statusId: done.id,
            priority: 'URGENT',
            addAssigneeIds: [elifId],
            addLabelIds: [label],
          },
        })
        .expect(204);
      for (const id of [a.id, b.id]) {
        expect(await item(id)).toMatchObject({
          priority: 'URGENT',
          statusId: done.id,
          assignees: [{ id: elifId }],
          labels: [{ id: label }],
        });
        expect((await item(id)).completedAt).not.toBeNull();
      }
      await owner
        .post(api(`/spaces/${s.id}/items/bulk`), {
          ids: [a.id],
          patch: { removeAssigneeIds: [elifId], removeLabelIds: [label] },
        })
        .expect(204);
      expect(await item(a.id)).toMatchObject({ assignees: [], labels: [] });

      await owner
        .post(api(`/spaces/${s.id}/items/bulk`), {
          ids: [a.id, foreign.id],
          patch: { priority: 'LOW' },
        })
        .expect(404);
      await owner.post(api(`/spaces/${s.id}/items/bulk`), { ids: [a.id], patch: {} }).expect(400);
    });
  });

  describe('etiketler', () => {
    it('Space içinde ad benzersiz (harf duyarsız); silinen etiket öğelerden kalkar', async () => {
      const s = await space();
      const id = (
        (await owner.post(api(`/spaces/${s.id}/labels`), { name: 'Acil' }).expect(201))
          .body as Created
      ).id;
      const dup = await owner.post(api(`/spaces/${s.id}/labels`), { name: 'acil' }).expect(409);
      expect(dup.body).toEqual({ code: 'LABEL_NAME_TAKEN' });

      const t = await create(s.listId, { type: 'TASK', title: 'T', labelIds: [id] });
      await owner.patch(api(`/labels/${id}`), { color: '#BE123C' }).expect(204);
      await owner.delete(api(`/labels/${id}`)).expect(204);
      expect((await item(t.id)).labels).toEqual([]);
      expect((await itemsOf(s.listId)).labels).toEqual([]);
    });
  });
});
