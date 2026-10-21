import type {
  BacklogResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  SprintDetail,
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

/** ADR-124: Task'ları Epic altında gruplama, Epic'e dönüştürürken ad değiştirme, Space'ler arası taşıma. */
describe("Gruplama, Epic'e dönüştürme ve Space'ler arası taşıma", () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (key: string, name = key) => {
    const res = await owner.post(api('/spaces'), { name, key, color: '#7C3AED' }).expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const sprint = async (spaceId: string, name: string) =>
    (
      await owner
        .post(api(`/spaces/${spaceId}/sprints`), {
          name,
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
  const toSprint = (spaceId: string, itemIds: string[], sprintId: string | null) =>
    owner.post(api(`/spaces/${spaceId}/backlog/move`), { itemIds, sprintId }).expect(204);
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const sprintKeys = async (id: string) =>
    ((await owner.get(api(`/sprints/${id}`)).expect(200)).body as SprintDetail).items.map(
      (i) => i.key,
    );
  const group = (spaceId: string, itemIds: string[], epicId: string, client = owner) =>
    client.post(api(`/spaces/${spaceId}/items/group`), { itemIds, epicId });

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

  it("farklı sprint'lerdeki bağımsız Task'lar aynı Epic altında toplanır; sprint üyelikleri korunur", async () => {
    const s = await space('MOB');
    const epic = await item(s.listId, { type: 'EPIC', title: 'Hesap' });
    const a = await item(s.listId, { type: 'TASK', title: 'Giriş' });
    const b = await item(s.listId, { type: 'TASK', title: 'Kayıt' });
    const one = await sprint(s.id, 'Sprint 1');
    const two = await sprint(s.id, 'Sprint 2');
    await toSprint(s.id, [a.id], one.id);
    await toSprint(s.id, [b.id], two.id);

    await group(s.id, [a.id, b.id], epic.id).expect(204);

    for (const [task, sprintId] of [
      [a, one.id],
      [b, two.id],
    ] as const) {
      const d = await detail(task.id);
      expect(d.parentId).toBe(epic.id);
      expect(d.type).toBe('TASK');
      expect(d.sprintId).toBe(sprintId);
    }
  });

  it("alt öğeli Task Epic'e alınınca Sub-Task'ları onunla birlikte gelir", async () => {
    const s = await space('MOB');
    const epic = await item(s.listId, { type: 'EPIC', title: 'Ödeme' });
    const task = await item(s.listId, { type: 'TASK', title: 'Kart ekle' });
    const sub = await item(s.listId, { type: 'SUBTASK', title: 'Form', parentId: task.id });

    await group(s.id, [task.id], epic.id).expect(204);

    expect((await detail(task.id)).parentId).toBe(epic.id);
    const child = await detail(sub.id);
    expect(child.parentId).toBe(task.id);
    expect(child.type).toBe('SUBTASK');
  });

  it('uygun olmayan öğe varsa hiçbiri taşınmaz; Epic olmayan hedef ve başka Space reddedilir', async () => {
    const s = await space('MOB');
    const other = await space('OTH');
    const epic = await item(s.listId, { type: 'EPIC', title: 'Hedef' });
    const task = await item(s.listId, { type: 'TASK', title: 'İş' });
    const parent = await item(s.listId, { type: 'TASK', title: 'Üst' });
    const sub = await item(s.listId, { type: 'SUBTASK', title: 'Alt', parentId: parent.id });

    // Sub-Task doğrudan Epic'in altında olamaz: tüm istek reddedilir, Task da taşınmaz.
    await group(s.id, [task.id, sub.id], epic.id).expect(422);
    expect((await detail(task.id)).parentId).toBeNull();

    await group(s.id, [task.id], parent.id).expect(404);
    const foreign = await item(other.listId, { type: 'EPIC', title: 'Başka' });
    await group(s.id, [task.id], foreign.id).expect(404);
  });

  it('yazma yetkisi olmayan kullanıcı gruplayamaz', async () => {
    const s = await space('MOB');
    const epic = await item(s.listId, { type: 'EPIC', title: 'Hedef' });
    const task = await item(s.listId, { type: 'TASK', title: 'İş' });
    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    await group(s.id, [task.id], epic.id, elif).expect(403);
    expect((await detail(task.id)).parentId).toBeNull();
  });

  it("alt öğeli Task Epic'e dönüştürülürken adı değiştirilebilir; Sub-Task'lar Task olur", async () => {
    const s = await space('MOB');
    const task = await item(s.listId, { type: 'TASK', title: 'Ödeme akışı' });
    const sub = await item(s.listId, { type: 'SUBTASK', title: 'Kart', parentId: task.id });

    await owner
      .post(api(`/items/${task.id}/convert-to-epic`), { title: 'Ödeme altyapısı' })
      .expect(204);

    const epic = await detail(task.id);
    expect(epic.type).toBe('EPIC');
    expect(epic.title).toBe('Ödeme altyapısı');
    const child = await detail(sub.id);
    expect(child.type).toBe('TASK');
    expect(child.parentId).toBe(task.id);
  });

  it('ad verilmezse Epic aynı adı korur (eski davranış)', async () => {
    const s = await space('MOB');
    const task = await item(s.listId, { type: 'TASK', title: 'Aynı kalsın' });
    await owner.post(api(`/items/${task.id}/convert-to-epic`)).expect(204);
    expect((await detail(task.id)).title).toBe('Aynı kalsın');
  });

  it("başka Proje'ye taşınan Task sprint'inden çıkar; hedefte yeni sprint'e alınabilir (Epic'te alt Task'lar birlikte)", async () => {
    const a = await space('MOB');
    const b = await space('WEB');
    const sprintA = await sprint(a.id, 'Sprint A');
    const sprintB = await sprint(b.id, 'Sprint B');
    const task = await item(a.listId, { type: 'TASK', title: 'Taşınacak' });
    await toSprint(a.id, [task.id], sprintA.id);

    await owner.post(api(`/items/${task.id}/move`), { listId: b.listId }).expect(204);
    const moved = await detail(task.id);
    expect(moved.sprintId).toBeNull();
    expect(await sprintKeys(sprintA.id)).toEqual([]);

    await toSprint(b.id, [task.id], sprintB.id);
    expect(await sprintKeys(sprintB.id)).toEqual([task.key]);

    // Epic taşınınca altındaki Task'lar da gelir.
    const epic = await item(a.listId, { type: 'EPIC', title: 'Büyük hedef' });
    const child = await item(a.listId, { type: 'TASK', title: 'Alt Task', parentId: epic.id });
    await toSprint(a.id, [child.id], sprintA.id);
    await owner.post(api(`/items/${epic.id}/move`), { listId: b.listId }).expect(204);
    const movedChild = await detail(child.id);
    expect(movedChild.sprintId).toBeNull();
    expect(movedChild.parentId).toBe(epic.id);
    const backlog = (await owner.get(api(`/spaces/${b.id}/backlog`)).expect(200))
      .body as BacklogResponse;
    expect(backlog.items.map((i) => i.id)).toContain(child.id);
  });
});
