import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  RestoreResult,
  WorkItemDetail,
} from '@scrum/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decryptBackup } from '../src/modules/backup/backup-crypto';
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
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const para = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

type Tables = Record<string, Array<Record<string, unknown>>>;

/** Projeyi yedeğe döndürme (ADR-173): yedekteki her şey eksiksiz geri gelir, sonrası silinir. */
describe('Projeyi yedeğe döndürme (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let elif: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;
  const userId = async (email: string) =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email } })).id;

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

  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const detail = async (id: string) =>
    (await owner.get(api(`/items/${id}`)).expect(200)).body as WorkItemDetail;

  /** İndirilen şifreli yedeği açar ve ham dosyayı + tabloları döner. */
  async function backup(spaceId: string) {
    const raw = (await owner.download(api(`/spaces/${spaceId}/backup.zip`)).expect(200))
      .body as Buffer;
    const { key } = (await owner.get(api('/backup-key/reveal')).expect(200)).body as {
      key: string;
    };
    const zip = unzipSync(new Uint8Array(decryptBackup(raw, key)!));
    const data = JSON.parse(strFromU8(zip['data.json']!)) as {
      space: Record<string, unknown>;
      tables: Tables;
    };
    return { raw, zip, data };
  }
  /** Satırları kimliğe göre sıralı karşılaştırılabilir metne çevirir; depolama anahtarı dosya yolu olduğundan karşılaştırılmaz. */
  const sorted = (rows: Array<Record<string, unknown>>) =>
    [...rows]
      .map((r) => {
        const { storageKey: _ignored, ...rest } = r;
        return JSON.stringify(rest, Object.keys(rest).sort());
      })
      .sort();

  const rollback = (spaceId: string, file: Buffer, confirmKey: string, c: Client = owner) =>
    c.upload(api(`/spaces/${spaceId}/rollback`), file, 'yedek.zip.enc', { confirmKey });

  /** Zengin bir Proje: durumlar, öğeler, ilişkiler, yorumlar, ek, sprint, doküman, zaman, retro… */
  async function seed() {
    const created = (
      await owner.post(api('/spaces'), { name: 'Mobil', key: 'MOB', color: '#7C3AED' }).expect(201)
    ).body as Created;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    const listId = tree.spaces.find((s) => s.id === created.id)!.lists[0]!.id;
    const elifId = await userId(ELIF.email);
    await owner
      .put(api(`/spaces/${created.id}/members/${elifId}`), { role: 'PROJECT_MEMBER' })
      .expect(204);
    const label = (
      await owner
        .post(api(`/spaces/${created.id}/labels`), { name: 'Acil', color: '#DC2626' })
        .expect(201)
    ).body as Created;
    const story = await item(listId, {
      type: 'TASK',
      title: 'Kartla ödeme',
      points: 5,
      assigneeIds: [elifId],
      labelIds: [label.id],
    });
    const sub = await item(listId, { type: 'SUBTASK', title: 'Form', parentId: story.id });
    const other = await item(listId, { type: 'TASK', title: 'Servis', estimateHours: 3 });
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
        .post(api(`/spaces/${created.id}/sprints`), {
          name: 'Sprint 1',
          goal: 'Ödeme — ekip bu sprintte kapsamı uçtan uca teslim edip demoya hazır hale getirecek',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${created.id}/backlog/move`), { itemIds: [story.id], sprintId: sprint.id })
      .expect(204);
    const doc = (
      await owner.post(api(`/spaces/${created.id}/docs`), { title: 'Mimari' }).expect(201)
    ).body as Created;

    // API'den üretilmeyen bağlı veriler doğrudan yazılır: yedek her tabloyu taşımalı.
    await ctx.prisma.timeEntry.create({
      data: {
        workspaceId: ws,
        workItemId: story.id,
        userId: elifId,
        day: new Date('2026-10-06'),
        minutes: 90,
        note: 'kod',
        source: 'MANUAL',
      },
    });
    await ctx.prisma.sprintSnapshot.create({
      data: {
        workspaceId: ws,
        sprintId: sprint.id,
        date: new Date('2026-10-06'),
        totalPoints: 5,
        donePoints: 0,
        remainingPoints: 5,
        totalItems: 1,
        doneItems: 0,
      },
    });
    const retro = await ctx.prisma.retroItem.create({
      data: {
        workspaceId: ws,
        sprintId: sprint.id,
        column: 'IMPROVE',
        text: 'Daha az toplantı',
        authorId: elifId,
      },
    });
    await ctx.prisma.retroVote.create({
      data: { workspaceId: ws, retroItemId: retro.id, userId: elifId },
    });
    await ctx.prisma.workItemWatcher.createMany({
      data: [{ workspaceId: ws, workItemId: story.id, userId: elifId }],
      skipDuplicates: true,
    });
    await ctx.prisma.docItemLink.create({
      data: { workspaceId: ws, docId: doc.id, workItemId: story.id },
    });
    return { spaceId: created.id, listId, story, sub, other, label, att, sprint, doc, elifId };
  }

  /** Yedekten sonra Projede her türden değişiklik yapar. */
  async function mutate(s: Awaited<ReturnType<typeof seed>>) {
    await owner.patch(api(`/items/${s.story.id}`), { title: 'DEĞİŞTİ' }).expect(204);
    // Atananlar kaldırılır (API atananı tamamen kaldırmaya izin vermez, ADR-176).
    await ctx.prisma.workItemAssignee.deleteMany({ where: { workItemId: s.story.id } });
    await ctx.prisma.workItem.update({ where: { id: s.story.id }, data: { points: 13 } });
    await owner.delete(api(`/items/${s.sub.id}`)).expect(204);
    await ctx.prisma.workItem.deleteMany({ where: { id: s.other.id } }); // kalıcı silinmiş öğe
    const added = await item(s.listId, { type: 'TASK', title: 'Yedekten sonra eklendi' });
    await owner
      .post(api(`/items/${added.id}/comments`), { body: para('sonradan yorum') })
      .expect(201);
    await owner
      .post(api(`/items/${s.story.id}/comments`), { body: para('ikinci yorum') })
      .expect(201);
    await owner.delete(api(`/items/${s.story.id}/attachments/${s.att.id}`)).expect(204);
    await owner
      .upload(api(`/items/${added.id}/attachments`), Buffer.from('yeni-dosya'), 'yeni.txt')
      .expect(201);
    await owner.delete(api(`/labels/${s.label.id}`)).expect(204);
    await owner
      .patch(api(`/spaces/${s.spaceId}`), { name: 'Yeni ad', description: 'değişti' })
      .expect(204);
    await ctx.prisma.timeEntry.create({
      data: {
        workspaceId: ws,
        workItemId: added.id,
        userId: s.elifId,
        day: new Date('2026-11-01'),
        minutes: 30,
        source: 'MANUAL',
      },
    });
    await ctx.prisma.retroItem.deleteMany({ where: { sprintId: s.sprint.id } });
    await owner.delete(api(`/docs/${s.doc.id}`)).expect(204);
    return added;
  }

  it('yedekten sonra yapılan her değişiklik geri alınır; yedek tabloları birebir aynıya döner', async () => {
    const s = await seed();
    const A = await backup(s.spaceId);
    expect(Object.keys(A.zip).sort()).toEqual(['data.json', `files/${s.att.id}`, 'manifest.json']);

    const added = await mutate(s);
    // Değişiklik gerçekten uygulanmış olmalı.
    expect((await detail(s.story.id)).title).toBe('DEĞİŞTİ');

    const res = (await rollback(s.spaceId, A.raw, 'mob').expect(200)).body as RestoreResult;
    expect(res.spaceId).toBe(s.spaceId);

    // 1) Yeni yedek, eskisiyle tablo tablo birebir aynı.
    const B = await backup(s.spaceId);
    for (const name of Object.keys(A.data.tables)) {
      expect(sorted(B.data.tables[name] ?? []), `tablo: ${name}`).toEqual(
        sorted(A.data.tables[name]!),
      );
    }
    for (const field of [
      'name',
      'description',
      'color',
      'scrumEnabled',
      'estimationScale',
      'sprintLengthWeeks',
    ]) {
      expect(B.data.space[field], `space.${field}`).toEqual(A.data.space[field]);
    }

    // 2) Somut kontroller.
    const story = await detail(s.story.id);
    expect(story.title).toBe('Kartla ödeme');
    expect(story.points).toBe(5);
    expect(story.assignees.map((a) => a.id)).toEqual([s.elifId]);
    expect((await detail(s.sub.id)).title).toBe('Form'); // silinmişti, geri geldi
    expect((await detail(s.other.id)).title).toBe('Servis'); // kalıcı silinmişti, geri geldi
    await owner.get(api(`/items/${added.id}`)).expect(404); // yedekten sonra eklenen gitti
    expect(await ctx.prisma.comment.count({ where: { workItemId: s.story.id } })).toBe(1);
    expect(await ctx.prisma.label.count({ where: { spaceId: s.spaceId, name: 'Acil' } })).toBe(1);
    expect(await ctx.prisma.timeEntry.count({ where: { workItem: { spaceId: s.spaceId } } })).toBe(
      1,
    );
    expect(await ctx.prisma.retroItem.count({ where: { sprintId: s.sprint.id } })).toBe(1);
    expect(await ctx.prisma.doc.count({ where: { id: s.doc.id, deletedAt: null } })).toBe(1);

    // 3) Ek dosyası geri geldi ve baytları aynı.
    const bytes = (
      await owner.download(api(`/items/${s.story.id}/attachments/${s.att.id}`)).expect(200)
    ).body as Buffer;
    expect(Buffer.compare(bytes, PNG)).toBe(0);
  });

  it('dönüşten sonra Proje sorunsuz çalışır: liste, backlog, sprint, yeni öğe, yorum, durum', async () => {
    const s = await seed();
    const A = await backup(s.spaceId);
    await mutate(s);
    await rollback(s.spaceId, A.raw, 'MOB').expect(200);

    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    expect(tree.spaces.find((x) => x.id === s.spaceId)!.name).toBe(
      'Space MOB'.replace('Space ', '') === 'MOB' ? 'Mobil' : 'Mobil',
    );
    await owner.get(api(`/spaces/${s.spaceId}`)).expect(200);
    await owner.get(api(`/spaces/${s.spaceId}/backlog`)).expect(200);
    await owner.get(api(`/spaces/${s.spaceId}/sprints`)).expect(200);
    await owner.get(api(`/sprints/${s.sprint.id}`)).expect(200);

    // Yeni öğe: numara geri sarılmaz (silinen anahtarlar yeniden kullanılmaz), yeni iş normal çalışır.
    const fresh = await item(s.listId, { type: 'TASK', title: 'Dönüşten sonra' });
    const freshDetail = await detail(fresh.id);
    const used = (
      await ctx.prisma.workItem.findMany({
        where: { spaceId: s.spaceId },
        select: { number: true },
      })
    ).map((w) => w.number);
    expect(new Set(used).size).toBe(used.length);
    expect(freshDetail.key.startsWith('MOB-')).toBe(true);
    await owner.post(api(`/items/${fresh.id}/comments`), { body: para('çalışıyor') }).expect(201);
    const statuses = await ctx.prisma.status.findMany({
      where: { spaceId: s.spaceId },
      orderBy: { rank: 'asc' },
    });
    await owner.patch(api(`/items/${fresh.id}`), { statusId: statuses[1]!.id }).expect(204);
    await owner.patch(api(`/items/${s.story.id}`), { title: 'Yeniden düzenlendi' }).expect(204);
    // Sprint hâlâ planlanabilir/başlatılabilir.
    await owner.post(api(`/sprints/${s.sprint.id}/start`), {}).expect(204);
    // İkinci bir yedek alınıp yine yedeğe dönülebilir (tekrarlanabilir).
    const A2 = await backup(s.spaceId);
    await owner.patch(api(`/items/${s.story.id}`), { title: 'bir daha' }).expect(204);
    await rollback(s.spaceId, A2.raw, 'MOB').expect(200);
    expect((await detail(s.story.id)).title).toBe('Yeniden düzenlendi');
  });

  it('güvenlik: yalnızca Super Admin; anahtar onayı; başka Projenin yedeği ve bozuk dosya reddedilir, hiçbir şey değişmez', async () => {
    const s = await seed();
    const A = await backup(s.spaceId);
    await owner.patch(api(`/items/${s.story.id}`), { title: 'Sonraki hâl' }).expect(204);

    // Üye yapamaz.
    const forbidden = await rollback(s.spaceId, A.raw, 'MOB', elif);
    expect([403, 404]).toContain(forbidden.status);
    // Yanlış onay anahtarı.
    const wrong = await rollback(s.spaceId, A.raw, 'XYZ').expect(400);
    expect((wrong.body as { code: string }).code).toBe('ROLLBACK_CONFIRM_MISMATCH');
    // Başka Projenin yedeği.
    const other = (
      await owner.post(api('/spaces'), { name: 'Diğer', key: 'DIG', color: '#2563EB' }).expect(201)
    ).body as Created;
    const B = await backup(other.id);
    const mismatch = await rollback(s.spaceId, B.raw, 'MOB').expect(422);
    expect((mismatch.body as { code: string }).code).toBe('BACKUP_WRONG_SPACE');
    // Bozuk dosya.
    await rollback(s.spaceId, Buffer.from('bozuk dosya'), 'MOB').expect(422);

    expect((await detail(s.story.id)).title).toBe('Sonraki hâl');

    // Anahtarı değişmiş (eski anahtarla alınmış) yedek: açıklayıcı hata, veri değişmez.
    await owner.put(api('/backup-key'), { acknowledgeOldBackups: true }).expect(200);
    const stale = await rollback(s.spaceId, A.raw, 'MOB').expect(422);
    expect((stale.body as { code: string }).code).toBe('BACKUP_KEY_MISMATCH');
    expect((await detail(s.story.id)).title).toBe('Sonraki hâl');
  });

  it('can yetkisiz kullanıcı Projeye hiç erişemez (CAN üye değil)', async () => {
    const s = await seed();
    const can = await inviteAndAccept(ctx, owner, ws, CAN, 'MEMBER', []);
    const A = await backup(s.spaceId);
    const res = await rollback(s.spaceId, A.raw, 'MOB', can);
    expect([403, 404]).toContain(res.status);
  });
});
