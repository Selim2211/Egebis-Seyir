import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  RestoreResult,
  SprintDetail,
  WorkItemDetail,
} from '@scrum/shared';
import { unzipSync } from 'fflate';
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
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const para = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** Faz 8.5 (ADR-105): Space ve Sprint zip yedeği, geri yükleme. */
describe('Space/Sprint yedek ve geri yükleme (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let elif: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (key: string) => {
    const id = (
      await owner.post(api('/spaces'), { name: `Space ${key}`, key, color: '#7C3AED' }).expect(201)
    ).body as Created;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id: id.id, listId: tree.spaces.find((s) => s.id === id.id)!.lists[0]!.id };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;
  const download = async (path: string) =>
    (await owner.download(api(path)).expect(200)).body as Buffer;
  const restoreSpace = (file: Buffer, fields: Record<string, string>, expected = 200) =>
    owner.upload(api('/restore/space'), file, 'yedek.zip', fields).expect(expected);

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
  });

  /** MOB: etiket, Story + alt Task + Task, bağımlılık, yorum, checklist, ek, sprint, doküman. */
  const seed = async () => {
    const mob = await space('MOB');
    const elifId = (
      (await owner.get(api('/members')).expect(200)).body as {
        members: Array<{ userId: string; email: string }>;
      }
    ).members.find((m) => m.email === ELIF.email)!.userId;
    const label = (
      await owner
        .post(api(`/spaces/${mob.id}/labels`), { name: 'Acil', color: '#DC2626' })
        .expect(201)
    ).body as Created;
    const story = await item(mob.listId, {
      type: 'STORY',
      title: 'Kartla ödeme',
      points: 5,
      assigneeIds: [elifId],
      labelIds: [label.id],
    });
    const task = await item(mob.listId, { type: 'TASK', title: 'Form', parentId: story.id });
    const other = await item(mob.listId, { type: 'TASK', title: 'Servis', estimateHours: 3 });
    await owner
      .post(api(`/items/${other.id}/links`), { targetId: story.id, relation: 'BLOCKS' })
      .expect(201);
    await owner.post(api(`/items/${story.id}/comments`), { body: para('İlk yorum') }).expect(201);
    await owner
      .post(api(`/items/${story.id}/checklists/acceptance/entries`), { text: 'Kart geçerli' })
      .expect(201);
    const att = (
      await owner.upload(api(`/items/${story.id}/attachments`), PNG, 'ekran.png').expect(201)
    ).body as Created;
    const sprint = (
      await owner
        .post(api(`/spaces/${mob.id}/sprints`), {
          name: 'Sprint 1',
          goal: 'Ödeme',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${mob.id}/backlog/move`), { itemIds: [story.id], sprintId: sprint.id })
      .expect(204);
    const doc = (await owner.post(api(`/spaces/${mob.id}/docs`), { title: 'Mimari' }).expect(201))
      .body as Created;
    return { mob, story, task, other, sprint, doc, att, elifId };
  };

  it('yedek ZIP: manifest, data.json ve ek dosyaları içerir', async () => {
    const { mob, att } = await seed();
    const zip = unzipSync(new Uint8Array(await download(`/spaces/${mob.id}/backup.zip`)));
    expect(Object.keys(zip).sort()).toEqual(['data.json', `files/${att.id}`, 'manifest.json']);
    const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json'])) as {
      format: string;
      kind: string;
      counts: Record<string, number>;
    };
    expect(manifest).toMatchObject({ format: 'egebis-seyir-backup', kind: 'space' });
    expect(manifest.counts).toMatchObject({ workItem: 3, sprint: 1, comment: 1, attachment: 1 });
  });

  it('Space geri yükleme: yeni Space, kimlikler yenilenir, ilişkiler ve ek korunur', async () => {
    const { mob, story, other } = await seed();
    const file = await download(`/spaces/${mob.id}/backup.zip`);

    const res = (await restoreSpace(file, { key: 'MOB2', name: 'Mobil Kopya' }))
      .body as RestoreResult;
    expect(res.spaceId).not.toBe(mob.id);
    expect(res.skipped.workItemAssignee ?? 0).toBe(0);

    // Yeni Space'te anahtarlar MOB2-n; eskisi dokunulmamış.
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const copy = tree.spaces.find((s) => s.id === res.spaceId)!;
    expect(copy.name).toBe('Mobil Kopya');
    const backlog = (await owner.get(api(`/spaces/${res.spaceId}/backlog`)).expect(200)).body as {
      items: Array<{ id: string; key: string; title: string }>;
      sprints: Array<{ id: string; name: string }>;
    };
    const keys = backlog.items.map((i) => i.key);
    expect(keys.every((k) => k.startsWith('MOB2-'))).toBe(true);
    expect(backlog.sprints.map((s) => s.name)).toEqual(['Sprint 1']);

    const sprintItems = (await owner.get(api(`/sprints/${backlog.sprints[0]!.id}`)).expect(200))
      .body as SprintDetail;
    const newStory = sprintItems.items.find((i) => i.title === 'Kartla ödeme')!;
    expect(newStory.id).not.toBe(story.id);
    expect(newStory.assignees.map((a) => a.name)).toEqual(['Elif Demir']);

    const full = await detail(newStory.id);
    expect(full.children.map((c) => c.title)).toEqual(['Form']);
    expect(full.links.map((l) => [l.relation, l.item.title])).toEqual([['BLOCKED_BY', 'Servis']]);
    expect(full.attachments.map((a) => a.fileName)).toEqual(['ekran.png']);
    const bytes = (
      await owner
        .download(api(`/items/${newStory.id}/attachments/${full.attachments[0]!.id}`))
        .expect(200)
    ).body as Buffer;
    expect(bytes.equals(PNG)).toBe(true);
    const comments = (await owner.get(api(`/items/${newStory.id}/comments`)).expect(200)).body as {
      comments: Array<{ author: { name: string } | null }>;
    };
    expect(comments.comments).toHaveLength(1);

    // Kaynak Space aynen duruyor.
    expect((await detail(other.id)).title).toBe('Servis');
    // Yeni öğe numaraları kaldığı yerden devam eder.
    const added = await item(res.spaceId === copy.id ? copy.lists[0]!.id : '', {
      type: 'TASK',
      title: 'Yeni',
    });
    expect(added.key).toBe('MOB2-4'); // 3 öğe geri yüklendi, sayaç kaldığı yerden sürer
  });

  it('sayfadaki görseller geri yüklemede yeni sayfa ve ek kimliklerine bağlanır', async () => {
    const { mob, doc } = await seed();
    const attachment = (
      await owner.upload(api(`/docs/${doc.id}/attachments`), PNG, 'sema.png').expect(201)
    ).body as Created;
    const src = `/api/workspaces/${ws}/docs/${doc.id}/attachments/${attachment.id}?preview=1`;
    await owner
      .patch(api(`/docs/${doc.id}`), {
        revision: 1,
        content: { type: 'doc', content: [{ type: 'image', attrs: { src, alt: 'Şema' } }] },
      })
      .expect(200);

    const res = (
      await restoreSpace(await download(`/spaces/${mob.id}/backup.zip`), { key: 'MOB3' })
    ).body as RestoreResult;
    const docs = (await owner.get(api(`/spaces/${res.spaceId}/docs`)).expect(200)).body as {
      docs: Array<{ id: string; title: string }>;
    };
    const copy = docs.docs.find((d) => d.title === 'Mimari')!;
    const full = (await owner.get(api(`/docs/${copy.id}`)).expect(200)).body as {
      content: { content: Array<{ attrs: { src: string } }> };
      attachments: Array<{ id: string }>;
    };
    const copied = full.content.content[0]!.attrs.src;
    expect(copied).toBe(
      `/api/workspaces/${ws}/docs/${copy.id}/attachments/${full.attachments[0]!.id}?preview=1`,
    );
    expect(copied).not.toBe(src);
    const bytes = (await owner.download(copied).expect(200)).body as Buffer;
    expect(bytes.equals(PNG)).toBe(true);
  });

  it('Space geri yükleme: kullanılmış anahtar 409, Üye 403, bozuk dosya 422', async () => {
    const { mob } = await seed();
    const file = await download(`/spaces/${mob.id}/backup.zip`);
    await restoreSpace(file, { key: 'MOB' }, 409);
    await elif.upload(api('/restore/space'), file, 'yedek.zip', { key: 'NEW' }).expect(403);
    await restoreSpace(Buffer.from('zip değil'), { key: 'NEW' }, 422);
    await restoreSpace(Buffer.alloc(0), { key: 'NEW' }, 422);
    await restoreSpace(file, { key: 'küçük' }, 400);
  });

  it("Sprint yedeği: öğeleri alt öğeleriyle başka Space'e yeni sprint olarak yükler", async () => {
    const { sprint } = await seed();
    const zip = unzipSync(new Uint8Array(await download(`/sprints/${sprint.id}/backup.zip`)));
    const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json'])) as {
      kind: string;
      counts: Record<string, number>;
    };
    expect(manifest.kind).toBe('sprint');
    expect(manifest.counts).toMatchObject({ sprint: 1, workItem: 2, attachment: 1 }); // Story + alt Task

    const target = await space('IOS');
    const res = (
      await owner
        .upload(
          api(`/spaces/${target.id}/restore/sprint`),
          await download(`/sprints/${sprint.id}/backup.zip`),
          'sprint.zip',
          {
            listId: target.listId,
          },
        )
        .expect(200)
    ).body as RestoreResult;
    expect(res.sprintId).not.toBeNull();
    const restored = (await owner.get(api(`/sprints/${res.sprintId}`)).expect(200))
      .body as SprintDetail;
    expect(restored.sprint).toMatchObject({ name: 'Sprint 1', goal: 'Ödeme', status: 'PLANNED' });
    expect(restored.items.map((i) => [i.key.startsWith('IOS-'), i.title])).toEqual([
      [true, 'Kartla ödeme'],
    ]);
    const full = await detail(restored.items[0]!.id);
    expect(full.children.map((c) => c.title)).toEqual(['Form']);
    expect(full.attachments).toHaveLength(1);
  });
});
