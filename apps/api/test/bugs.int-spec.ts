import type {
  BugsResponse,
  Created,
  CreatedItem,
  HierarchyResponse,
  NotificationsResponse,
  WorkItemsResponse,
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

describe('Bug ekranı: açma, atama, durum ve bildirimler (ADR-117)', () => {
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
  const person = async (who: typeof ELIF, spaceId: string, role: string) => {
    const client = await inviteAndAccept(ctx, owner, ws, who);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: who.email } });
    await owner.put(api(`/spaces/${spaceId}/members/${user.id}`), { role }).expect(204);
    return { client, id: user.id };
  };
  const bugs = async (client: Client, spaceId: string) =>
    ((await client.get(api(`/spaces/${spaceId}/bugs`)).expect(200)).body as BugsResponse).bugs;
  const inbox = async (client: Client) =>
    ((await client.get(api('/notifications')).expect(200)).body as NotificationsResponse).items;

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

  it('Stakeholder Bug açar (sahibi olur); yöneticiye bildirim ve e-posta gider', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'STAKEHOLDER');
    const mailsBefore = ctx.mail.outbox.length;
    const created = (
      await elif.client
        .post(api(`/spaces/${s.id}/bugs`), {
          title: 'Giriş butonu çalışmıyor',
          severity: 'CRITICAL',
          stepsToReproduce: '1. Giriş sayfasını aç 2. Butona bas',
          expectedResult: 'Giriş yapılır',
          actualResult: 'Hiçbir şey olmaz',
          environment: 'Chrome 140, Windows',
        })
        .expect(201)
    ).body as CreatedItem;

    const [bug] = await bugs(owner, s.id);
    expect(bug).toMatchObject({
      id: created.id,
      title: 'Giriş butonu çalışmıyor',
      bugStatus: 'UNASSIGNED',
      severity: 'CRITICAL',
      reporter: { id: elif.id },
      assignee: null,
      environment: 'Chrome 140, Windows',
    });
    // Owner (atayacak kişi) bildirimi ve e-postayı alır.
    expect((await inbox(owner)).map((n) => n.type)).toContain('BUG_REPORTED');
    expect(ctx.mail.outbox.slice(mailsBefore).some((m) => m.subject.includes('Yeni bug'))).toBe(
      true,
    );

    // Bug'lar liste görünümünde de API'de döner (gizleme arayüzde); tip BUG.
    const list = (await owner.get(api(`/lists/${s.listId}/items`)).expect(200))
      .body as WorkItemsResponse;
    expect(list.items.find((i) => i.id === created.id)).toMatchObject({
      type: 'BUG',
      bugStatus: 'UNASSIGNED',
    });
  });

  it('yalnızca bug.assign atar; atanınca ASSIGNED ve atanan bildirim alır', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'DEVELOPER');
    const mehmet = await person(MEHMET, s.id, 'DEVELOPER');
    const bug = (
      await elif.client.post(api(`/spaces/${s.id}/bugs`), { title: 'Çöküyor' }).expect(201)
    ).body as CreatedItem;

    // Developer atayamaz (ne Bug ekranından ne genel güncellemeden).
    await elif.client.put(api(`/items/${bug.id}/bug-assignee`), { userId: mehmet.id }).expect(403);
    await elif.client.patch(api(`/items/${bug.id}`), { assigneeIds: [mehmet.id] }).expect(403);

    await owner.put(api(`/items/${bug.id}/bug-assignee`), { userId: mehmet.id }).expect(204);
    expect((await bugs(owner, s.id))[0]).toMatchObject({
      bugStatus: 'ASSIGNED',
      assignee: { id: mehmet.id },
    });
    expect((await inbox(mehmet.client)).map((n) => n.type)).toContain('ASSIGNED');

    // Atama kaldırılınca tekrar atanmadı.
    await owner.put(api(`/items/${bug.id}/bug-assignee`), { userId: null }).expect(204);
    expect((await bugs(owner, s.id))[0]).toMatchObject({ bugStatus: 'UNASSIGNED', assignee: null });
  });

  it('atanan işleniyor ve çözüldü yapar; pano durumu eşlenir; sahibe bildirim gider', async () => {
    const s = await space();
    const elif = await person(ELIF, s.id, 'STAKEHOLDER');
    const mehmet = await person(MEHMET, s.id, 'STAKEHOLDER');
    const bug = (
      await elif.client.post(api(`/spaces/${s.id}/bugs`), { title: 'Yavaş' }).expect(201)
    ).body as CreatedItem;
    await owner.put(api(`/items/${bug.id}/bug-assignee`), { userId: mehmet.id }).expect(204);

    // Atanmamış Stakeholder durumu değiştiremez.
    expect(
      (
        await elif.client
          .put(api(`/items/${bug.id}/bug-status`), { status: 'RESOLVED' })
          .expect(403)
      ).body,
    ).toEqual({ code: 'BUG_STATUS_FORBIDDEN' });

    await mehmet.client
      .put(api(`/items/${bug.id}/bug-status`), { status: 'IN_PROGRESS' })
      .expect(204);
    let row = await ctx.prisma.workItem.findUniqueOrThrow({
      where: { id: bug.id },
      include: { status: true },
    });
    expect([row.bugStatus, row.status.category]).toEqual(['IN_PROGRESS', 'ACTIVE']);

    await mehmet.client.put(api(`/items/${bug.id}/bug-status`), { status: 'RESOLVED' }).expect(204);
    row = await ctx.prisma.workItem.findUniqueOrThrow({
      where: { id: bug.id },
      include: { status: true },
    });
    expect([row.bugStatus, row.status.category]).toEqual(['RESOLVED', 'DONE']);
    expect(row.completedAt).not.toBeNull();

    const notes = await inbox(elif.client);
    expect(notes.filter((n) => n.type === 'BUG_STATUS').map((n) => n.detail)).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'RESOLVED']),
    );
  });

  it('panoda durum değişince Bug durumu eşitlenir', async () => {
    const s = await space();
    const bug = (await owner.post(api(`/spaces/${s.id}/bugs`), { title: 'Pano' }).expect(201))
      .body as CreatedItem;
    const done = await ctx.prisma.status.findFirstOrThrow({
      where: { spaceId: s.id, category: 'DONE' },
    });
    await owner.patch(api(`/items/${bug.id}`), { statusId: done.id, force: true }).expect(204);
    expect((await bugs(owner, s.id))[0]!.bugStatus).toBe('RESOLVED');
  });
});
