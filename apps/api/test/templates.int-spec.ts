import type { Created, CustomFieldsResponse, SpaceDetail, TemplatesResponse } from '@scrum/shared';
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

describe('Şablonlar (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (key = 'MOB') => {
    const res = await owner
      .post(api('/spaces'), { name: `Space ${key}`, key, color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as {
      spaces: Array<{ id: string; lists: Array<{ id: string }> }>;
    };
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const addItem = async (listId: string, body: Record<string, unknown>) =>
    ((await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as Created).id;
  const saveTemplate = (spaceId: string, body: Record<string, unknown>, client = owner) =>
    client.post(api(`/spaces/${spaceId}/templates`), body);
  const apply = (spaceId: string, templateId: string, body: Record<string, unknown>) =>
    owner.post(api(`/spaces/${spaceId}/templates/${templateId}/apply`), body);
  const templates = async (spaceId: string) =>
    (await owner.get(api(`/spaces/${spaceId}/templates`)).expect(200)).body as TemplatesResponse;

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

  it('iş öğesi şablonu: alt öğe, etiket, açıklama, checklist ve özel alan gelir', async () => {
    const s = await space();
    await owner.post(api(`/spaces/${s.id}/labels`), { name: 'Acil', color: '#EF4444' }).expect(201);
    const field = (
      (
        await owner
          .post(api(`/spaces/${s.id}/custom-fields`), { name: 'Müşteri', type: 'TEXT' })
          .expect(201)
      ).body as Created
    ).id;
    const labelId = await ctx.prisma.label
      .findFirstOrThrow({ where: { spaceId: s.id, name: 'Acil' } })
      .then((l) => l.id);
    const story = await addItem(s.listId, {
      type: 'STORY',
      title: 'Giriş akışı',
      priority: 'HIGH',
      points: 5,
      labelIds: [labelId],
    });
    await addItem(s.listId, { type: 'TASK', title: 'Form', parentId: story });
    await owner
      .patch(api(`/items/${story}`), {
        description: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Açıklama metni' }] }],
        },
        customFields: { [field]: 'Acme' },
      })
      .expect(204);
    const checklist = await ctx.prisma.checklist.create({
      data: {
        workspaceId: ws,
        workItemId: story,
        kind: 'CHECKLIST',
        title: 'Yapılacaklar',
        rank: 'a',
      },
    });
    await ctx.prisma.checklistItem.create({
      data: { workspaceId: ws, checklistId: checklist.id, text: 'Test et', rank: 'a' },
    });

    const tpl = (
      await saveTemplate(s.id, { kind: 'ITEM', name: 'Standart story', sourceId: story }).expect(
        201,
      )
    ).body as Created;
    expect((await templates(s.id)).templates[0]).toMatchObject({
      kind: 'ITEM',
      name: 'Standart story',
    });

    const made = (await apply(s.id, tpl.id, { listId: s.listId, title: 'Kayıt akışı' }).expect(201))
      .body as Created & { key: string };
    const copy = await ctx.prisma.workItem.findUniqueOrThrow({
      where: { id: made.id },
      include: {
        labels: true,
        children: true,
        checklists: { include: { items: true } },
      },
    });
    expect(copy).toMatchObject({
      title: 'Kayıt akışı',
      type: 'STORY',
      priority: 'HIGH',
      points: 5,
    });
    expect(copy.labels.map((l) => l.labelId)).toEqual([labelId]);
    expect(copy.children.map((c) => c.title)).toEqual(['Form']);
    expect(copy.customFields).toEqual({ [field]: 'Acme' });
    expect(copy.descriptionText).toContain('Açıklama metni');
    expect(copy.checklists[0]!.items.map((i) => i.text)).toEqual(['Test et']);
    expect(copy.statusId).not.toBeNull();
  });

  it('List şablonu: öğeleriyle yeni List oluşturur', async () => {
    const s = await space();
    await addItem(s.listId, { type: 'STORY', title: 'Birinci' });
    await addItem(s.listId, { type: 'TASK', title: 'İkinci' });
    const tpl = (
      await saveTemplate(s.id, {
        kind: 'LIST',
        name: 'Başlangıç listesi',
        sourceId: s.listId,
      }).expect(201)
    ).body as Created;
    const list = (await apply(s.id, tpl.id, { title: 'Yeni liste' }).expect(201)).body as Created;
    const items = await ctx.prisma.workItem.findMany({
      where: { listId: list.id },
      orderBy: { rank: 'asc' },
    });
    expect(items.map((i) => i.title).sort()).toEqual(['Birinci', 'İkinci']);
    const row = await ctx.prisma.list.findUniqueOrThrow({ where: { id: list.id } });
    expect(row.name).toBe('Yeni liste');
  });

  it('Sprint şablonu: hedef ve süre ile yeni sprint', async () => {
    const s = await space();
    const sprint = (
      await owner
        .post(api(`/spaces/${s.id}/sprints`), {
          name: 'Sprint 1',
          goal: 'Ödeme akışı',
          startDate: '2026-11-02',
          endDate: '2026-11-15',
        })
        .expect(201)
    ).body as Created;
    const tpl = (
      await saveTemplate(s.id, { kind: 'SPRINT', name: '2 haftalık', sourceId: sprint.id }).expect(
        201,
      )
    ).body as Created;
    const made = (
      await apply(s.id, tpl.id, { title: 'Sprint 2', startDate: '2026-11-16' }).expect(201)
    ).body as Created;
    const row = await ctx.prisma.sprint.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.name).toBe('Sprint 2');
    expect(row.goal).toBe('Ödeme akışı');
    expect(row.startDate.toISOString().slice(0, 10)).toBe('2026-11-16');
    expect(row.endDate.toISOString().slice(0, 10)).toBe('2026-11-29');
    await apply(s.id, tpl.id, { title: 'Sprint 3' }).expect(422);
  });

  it('Doküman şablonu: içerikle yeni sayfa', async () => {
    const s = await space();
    const doc = (
      await owner
        .post(api(`/spaces/${s.id}/docs`), {
          title: 'Toplantı notu',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gündem' }] }],
          },
        })
        .expect(201)
    ).body as Created;
    const tpl = (
      await saveTemplate(s.id, { kind: 'DOC', name: 'Toplantı', sourceId: doc.id }).expect(201)
    ).body as Created;
    const made = (await apply(s.id, tpl.id, { title: 'Pazartesi toplantısı' }).expect(201))
      .body as Created;
    const row = await ctx.prisma.doc.findUniqueOrThrow({ where: { id: made.id } });
    expect(row.title).toBe('Pazartesi toplantısı');
    expect(row.plainText).toContain('Gündem');
  });

  it('Space şablonu: durumlar, özel alanlar, DoD ve List adları yeni Space e taşınır', async () => {
    const a = await space('AAA');
    const status = (await owner.get(api(`/spaces/${a.id}`)).expect(200)).body as SpaceDetail;
    await owner
      .post(api(`/spaces/${a.id}/statuses`), { name: 'Test', color: '#112233', category: 'ACTIVE' })
      .expect(201);
    await owner
      .post(api(`/spaces/${a.id}/custom-fields`), {
        name: 'Risk',
        type: 'DROPDOWN',
        options: [{ label: 'Düşük' }, { label: 'Yüksek' }],
      })
      .expect(201);
    await owner.patch(api(`/spaces/${a.id}`), { dodItems: ['Kod gözden geçirildi'] }).expect(204);
    expect(status.statuses.length).toBe(5);

    const tpl = (
      await owner
        .post(api('/space-templates'), { name: 'Yazılım ekibi', sourceSpaceId: a.id })
        .expect(201)
    ).body as Created;
    expect(
      ((await owner.get(api('/space-templates')).expect(200)).body as TemplatesResponse).templates,
    ).toHaveLength(1);

    const made = (
      await owner
        .post(api('/spaces/from-template'), {
          name: 'Yeni ürün',
          key: 'NEW',
          color: '#7C3AED',
          templateId: tpl.id,
        })
        .expect(201)
    ).body as Created;
    const detail = (await owner.get(api(`/spaces/${made.id}`)).expect(200)).body as SpaceDetail;
    expect(detail.statuses.map((s) => s.name)).toContain('Test');
    expect(detail.statuses).toHaveLength(6);
    expect(detail.dodItems).toEqual(['Kod gözden geçirildi']);
    const fields = (await owner.get(api(`/spaces/${made.id}/custom-fields`)).expect(200))
      .body as CustomFieldsResponse;
    expect(fields.fields.map((f) => [f.name, f.options.length])).toEqual([['Risk', 2]]);
  });

  it('ad çakışır, yetki tür bazlıdır ve silinebilir', async () => {
    const s = await space();
    const item = await addItem(s.listId, { type: 'TASK', title: 'Görev' });
    const first = (
      await saveTemplate(s.id, { kind: 'ITEM', name: 'Şablon', sourceId: item }).expect(201)
    ).body as Created;
    const dup = await saveTemplate(s.id, { kind: 'ITEM', name: 'şablon', sourceId: item }).expect(
      409,
    );
    expect(dup.body).toEqual({ code: 'TEMPLATE_NAME_TAKEN' });

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'DEVELOPER' }).expect(204);
    await saveTemplate(s.id, { kind: 'ITEM', name: 'Elif', sourceId: item }, elif).expect(201);
    await saveTemplate(s.id, { kind: 'LIST', name: 'Liste', sourceId: s.listId }, elif).expect(403);

    await owner.delete(api(`/spaces/${s.id}/templates/${first.id}`)).expect(204);
    expect((await templates(s.id)).templates.map((t) => t.name)).toEqual(['Elif']);
  });
});
