import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  ItemAccess,
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
const MEHMET = { email: 'mehmet@example.com', name: 'Mehmet Kaya', password: 'mehmet-pass' };

describe('Öğe bazlı erişim: miras, ekleme, gizli öğe (ADR-113)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async () => {
    const res = await owner
      .post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const item = async (client: Client, listId: string, body: Record<string, unknown>) =>
    (await client.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const detail = (client: Client, id: string) => client.get(api(`/items/${id}`));
  const person = async (
    who: typeof ELIF,
    spaceId: string,
    role: string | null,
  ): Promise<{ client: Client; id: string }> => {
    const client = await inviteAndAccept(ctx, owner, ws, who);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: who.email } });
    if (role) {
      await owner.put(api(`/spaces/${spaceId}/members/${user.id}`), { role }).expect(204);
    }
    return { client, id: user.id };
  };
  const root = async (id: string) =>
    (await ctx.prisma.workItem.findUniqueOrThrow({ where: { id }, select: { accessRootId: true } }))
      .accessRootId;
  const share = (client: Client, id: string, body: Record<string, unknown>) =>
    client.put(api(`/items/${id}/access`), body);

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

  it('erişim kökü alt ağaca iner; taşıma ve silme kökü yeniden hesaplar (tetikleyici)', async () => {
    const s = await space();
    const epicA = await item(owner, s.listId, { type: 'EPIC', title: 'A' });
    const epicB = await item(owner, s.listId, { type: 'EPIC', title: 'B' });
    const task = await item(owner, s.listId, { type: 'TASK', title: 'T', parentId: epicA.id });
    const sub = await item(owner, s.listId, { type: 'SUBTASK', title: 'S', parentId: task.id });
    expect(await root(sub.id)).toBeNull();

    await share(owner, epicA.id, { isPrivate: false, entries: [] }).expect(204);
    expect([await root(epicA.id), await root(task.id), await root(sub.id)]).toEqual([
      epicA.id,
      epicA.id,
      epicA.id,
    ]);
    // Yeni alt öğe de miras alır.
    const late = await item(owner, s.listId, { type: 'TASK', title: 'L', parentId: epicA.id });
    expect(await root(late.id)).toBe(epicA.id);

    // Alt öğenin kendi kaydı varsa o kök olur; alt ağacı da.
    await share(owner, task.id, { isPrivate: false, entries: [] }).expect(204);
    expect([await root(task.id), await root(sub.id)]).toEqual([task.id, task.id]);

    // Başka Epic'e taşıma: kök, yeni üstün köküne (B'nin kaydı yok → null) değil kendi kaydına bağlı.
    await owner.patch(api(`/items/${task.id}`), { parentId: epicB.id }).expect(204);
    expect(await root(task.id)).toBe(task.id);

    // Kayıt silinince üstten miras döner.
    await owner.delete(api(`/items/${task.id}/access`)).expect(204);
    expect([await root(task.id), await root(sub.id)]).toEqual([null, null]);
    await owner.delete(api(`/items/${epicA.id}/access`)).expect(204);
    expect(await root(late.id)).toBeNull();
  });

  it('ekleme modu: Stakeholder, Epic ve altında Developer olur; başka öğede olmaz', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'STAKEHOLDER');
    const epic = await item(owner, s.listId, { type: 'EPIC', title: 'Ortak Epic' });
    const task = await item(owner, s.listId, { type: 'TASK', title: 'Alt', parentId: epic.id });
    const other = await item(owner, s.listId, { type: 'TASK', title: 'Başka' });

    await elif.client.patch(api(`/items/${epic.id}`), { title: 'x' }).expect(403);
    await share(owner, epic.id, {
      isPrivate: false,
      entries: [{ userId: elif.id, roleKey: 'DEVELOPER' }],
    }).expect(204);

    await elif.client.patch(api(`/items/${epic.id}`), { title: 'Yeni ad' }).expect(204);
    await elif.client.patch(api(`/items/${task.id}`), { title: 'Alt güncel' }).expect(204);
    await elif.client.patch(api(`/items/${other.id}`), { title: 'x' }).expect(403);
    // Epic'in altına yeni öğe açabilir (yalnızca üst öğe olarak bu Epic verilirse).
    await elif.client
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'Yeni alt', parentId: epic.id })
      .expect(201);
    await elif.client
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'Serbest' })
      .expect(403);
    expect(((await detail(elif.client, epic.id).expect(200)).body as WorkItemDetail).title).toBe(
      'Yeni ad',
    );
  });

  it('gizli öğe: dışarıdakine 404, listede/aramada/akışta yok; listedekiler ve Owner görür', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'DEVELOPER');
    const mehmet = await person(MEHMET, s.id, 'DEVELOPER');
    const epic = await item(owner, s.listId, { type: 'EPIC', title: 'Gizli Epic' });
    const task = await item(owner, s.listId, {
      type: 'TASK',
      title: 'Gizli iş',
      parentId: epic.id,
    });
    await item(owner, s.listId, { type: 'TASK', title: 'Açık iş' });
    const keyOf = async (id: string) => {
      const row = await ctx.prisma.workItem.findUniqueOrThrow({ where: { id } });
      return `${row.keyPrefix}-${row.number}`;
    };
    const epicKey = await keyOf(epic.id);

    await share(owner, epic.id, {
      isPrivate: true,
      entries: [{ userId: mehmet.id, roleKey: 'DEVELOPER' }],
    }).expect(204);

    const endpoints = [
      `/lists/${s.listId}/items`,
      `/spaces/${s.id}/backlog`,
      `/spaces/${s.id}/epics`,
      `/spaces/${s.id}/kanban`,
      `/spaces/${s.id}/gantt`,
      `/search?q=Gizli`,
      `/items/search?q=Gizli`,
      `/activity`,
      `/items/${epic.id}`,
      `/items/${task.id}`,
      `/items/key/${epicKey}`,
      `/items/${epic.id}/comments`,
      `/items/${epic.id}/activity`,
      `/items/${epic.id}/access`,
    ];
    for (const path of endpoints) {
      const res = await elif.client.get(api(path));
      const text = JSON.stringify(res.body);
      expect(text, path).not.toContain('Gizli');
      expect(text, path).not.toContain(epic.id);
      expect(text, path).not.toContain(task.id);
      if (/\/items\/(key\/|[0-9a-f-]{36})/.test(path)) expect(res.status, path).toBe(404);
    }
    // Açık iş görünmeye devam eder.
    const list = (await elif.client.get(api(`/lists/${s.listId}/items`)).expect(200)).body as {
      items: Array<{ title: string }>;
    };
    expect(list.items.map((i) => i.title)).toEqual(['Açık iş']);
    // Yazma da engellenir.
    await elif.client.patch(api(`/items/${epic.id}`), { title: 'x' }).expect(404);

    // Listedeki Developer ve Owner görür.
    for (const client of [mehmet.client, owner]) {
      await detail(client, epic.id).expect(200);
      await detail(client, task.id).expect(200);
    }
    const seen = (await mehmet.client.get(api(`/lists/${s.listId}/items`)).expect(200)).body as {
      items: Array<{ title: string }>;
    };
    expect(seen.items.map((i) => i.title).sort()).toEqual(['Açık iş', 'Gizli Epic', 'Gizli iş']);

    // Gizlilik kaldırılınca herkes görür.
    await owner.delete(api(`/items/${epic.id}/access`)).expect(204);
    await detail(elif.client, epic.id).expect(200);
  });

  it('takım üyesi gizli öğeyi görür; gizliyi oluşturan kendini dışarıda bırakmaz', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'DEVELOPER');
    const mehmet = await person(MEHMET, s.id, 'SCRUM_MASTER');
    const team = (
      await owner
        .post(api('/teams'), { name: 'Mobil Takım', color: '#2563EB', memberIds: [elif.id] })
        .expect(201)
    ).body as Created;

    // Scrum Master kendi oluşturduğu öğeyi gizler, listeye kendini koymaz.
    const epic = await item(mehmet.client, s.listId, { type: 'EPIC', title: 'Takım Epic' });
    await share(mehmet.client, epic.id, {
      isPrivate: true,
      entries: [{ teamId: team.id, roleKey: 'DEVELOPER' }],
    }).expect(204);
    await detail(elif.client, epic.id).expect(200); // takım üzerinden
    await detail(mehmet.client, epic.id).expect(200); // kendini kilitlemedi
    const access = (await mehmet.client.get(api(`/items/${epic.id}/access`)).expect(200))
      .body as ItemAccess;
    expect(access).toMatchObject({ own: true, isPrivate: true });
    expect(access.entries.map((e) => e.name)).toContain('Mobil Takım');
  });

  it('yükseltme yok, yetkisiz kişi yönetemez, geçersiz kişi/rol reddedilir', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'DEVELOPER');
    const mehmet = await person(MEHMET, s.id, 'SCRUM_MASTER');
    const epic = await item(owner, s.listId, { type: 'EPIC', title: 'E' });

    // Developer erişim yönetemez.
    await share(elif.client, epic.id, { isPrivate: false, entries: [] }).expect(403);
    // Scrum Master, sahip olmadığı izinleri (Product Owner) veremez.
    expect(
      (
        await share(mehmet.client, epic.id, {
          isPrivate: false,
          entries: [{ userId: elif.id, roleKey: 'PRODUCT_OWNER' }],
        }).expect(403)
      ).body,
    ).toEqual({ code: 'ITEM_ACCESS_ESCALATION' });
    // Kendi izinleri kadarını verebilir.
    await share(mehmet.client, epic.id, {
      isPrivate: false,
      entries: [{ userId: elif.id, roleKey: 'DEVELOPER' }],
    }).expect(204);
    // Workspace üyesi olmayan kişi, olmayan rol, yinelenen giriş.
    const stranger = '0190c0de-0000-7000-8000-000000000000';
    await share(owner, epic.id, {
      isPrivate: false,
      entries: [{ userId: stranger, roleKey: 'DEVELOPER' }],
    }).expect(403);
    await share(owner, epic.id, {
      isPrivate: false,
      entries: [{ userId: elif.id, roleKey: 'YOK' }],
    }).expect(404);
    await share(owner, epic.id, {
      isPrivate: false,
      entries: [
        { userId: elif.id, roleKey: 'DEVELOPER' },
        { userId: elif.id, roleKey: 'STAKEHOLDER' },
      ],
    }).expect(403);
  });
});
