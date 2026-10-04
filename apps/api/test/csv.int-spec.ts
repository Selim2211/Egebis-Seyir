import type {
  Created,
  CustomFieldsResponse,
  ExportResponse,
  ImportPreview,
  ImportResult,
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

describe('CSV içe/dışa aktarma (gerçek veritabanı)', () => {
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
  const preview = (
    listId: string,
    csv: string,
    mapping?: Record<string, string | null>,
    client = owner,
  ) => client.post(api(`/lists/${listId}/import/preview`), { csv, ...(mapping && { mapping }) });
  const importCsv = (
    listId: string,
    csv: string,
    mapping: Record<string, string | null>,
    client = owner,
  ) => client.post(api(`/lists/${listId}/import`), { csv, mapping });
  const titles = async (listId: string) =>
    (await ctx.prisma.workItem.findMany({ where: { listId }, orderBy: { number: 'asc' } })).map(
      (i) => i.title,
    );

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

  it('dışa aktarma: başlık, öğe değerleri, üst öğe ve özel alan sütunları', async () => {
    const s = await space();
    const field = (
      (
        await owner
          .post(api(`/spaces/${s.id}/custom-fields`), { name: 'Müşteri', type: 'TEXT' })
          .expect(201)
      ).body as Created
    ).id;
    const story = (
      (
        await owner
          .post(api(`/lists/${s.listId}/items`), { type: 'STORY', title: 'Üst hikaye', points: 5 })
          .expect(201)
      ).body as Created
    ).id;
    await owner
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: '=1+1', parentId: story })
      .expect(201);
    await owner.patch(api(`/items/${story}`), { customFields: { [field]: 'Acme' } }).expect(204);

    const { rows } = (await owner.get(api(`/lists/${s.listId}/export`)).expect(200))
      .body as ExportResponse;
    expect(rows[0]).toEqual(expect.arrayContaining(['ID', 'Title', 'Status', 'Müşteri']));
    const idx = (name: string) => rows[0]!.indexOf(name);
    const first = rows[1]!;
    expect(first[idx('ID')]).toBe('MOB-1');
    expect(first[idx('Title')]).toBe('Üst hikaye');
    expect(first[idx('Points')]).toBe(5);
    expect(first[idx('Müşteri')]).toBe('Acme');
    const child = rows[2]!;
    expect(child[idx('Parent')]).toBe('MOB-1');
    expect(child[idx('Title')]).toBe('=1+1');
  });

  it('önizleme: başlıklardan eşleme önerir, hatalı satırları bildirir', async () => {
    const s = await space();
    const csv = [
      'Başlık;Durum;Öncelik;Bitiş',
      'İyi satır;Yapılacak;Yüksek;15.12.2026',
      ';Yapılacak;;',
      'Kötü durum;Yokdurum;;',
      'Kötü tarih;;;31.02.2026',
    ].join('\n');
    const res = (await preview(s.listId, csv).expect(200)).body as ImportPreview;
    expect(res.mapping).toMatchObject({
      title: 'Başlık',
      status: 'Durum',
      priority: 'Öncelik',
      dueDate: 'Bitiş',
    });
    expect(res.totalRows).toBe(4);
    expect(res.validRows).toBe(1);
    expect(res.issues.map((i) => [i.row, i.code])).toEqual([
      [3, 'TITLE_REQUIRED'],
      [4, 'STATUS_UNKNOWN'],
      [5, 'DATE_INVALID'],
    ]);
    expect(res.sample).toHaveLength(4);
    expect(await titles(s.listId)).toEqual([]);
  });

  it('içe aktarma: durum, öncelik, tarih, atanan, etiket, özel alan ve üst öğe', async () => {
    const s = await space();
    await inviteAndAccept(ctx, owner, ws, ELIF);
    const field = (
      (
        await owner
          .post(api(`/spaces/${s.id}/custom-fields`), {
            name: 'Risk',
            type: 'DROPDOWN',
            options: [{ label: 'Düşük' }, { label: 'Yüksek' }],
          })
          .expect(201)
      ).body as Created
    ).id;
    const csv = [
      'ID,Tip,Başlık,Durum,Öncelik,Atanan,Etiketler,Puan,Bitiş,Üst,Risk,Açıklama',
      'A1,Hikaye,Ödeme akışı,Devam ediyor,Acil,elif@example.com,"acil; ödeme",5,15.12.2026,,Yüksek,"Satır 1\nSatır 2"',
      'A2,Görev,Form tasarla,,,,,,,A1,,',
    ].join('\r\n');
    const mapping = {
      externalId: 'ID',
      type: 'Tip',
      title: 'Başlık',
      status: 'Durum',
      priority: 'Öncelik',
      assignees: 'Atanan',
      labels: 'Etiketler',
      points: 'Puan',
      dueDate: 'Bitiş',
      parent: 'Üst',
      description: 'Açıklama',
      [`cf:${field}`]: 'Risk',
    };
    const res = (await importCsv(s.listId, csv, mapping).expect(200)).body as ImportResult;
    expect(res).toMatchObject({ created: 2, updated: 0, skipped: 0, issues: [] });

    const items = await ctx.prisma.workItem.findMany({
      where: { listId: s.listId },
      include: { assignees: true, labels: { include: { label: true } }, status: true },
      orderBy: { number: 'asc' },
    });
    const [story, task] = items;
    expect(story).toMatchObject({
      title: 'Ödeme akışı',
      type: 'STORY',
      priority: 'URGENT',
      points: 5,
      externalSource: 'csv',
      externalId: 'A1',
    });
    expect(story!.status.name).toBe('Devam ediyor');
    expect(story!.dueDate?.toISOString().slice(0, 10)).toBe('2026-12-15');
    expect(story!.assignees).toHaveLength(1);
    expect(story!.labels.map((l) => l.label.name).sort()).toEqual(['acil', 'ödeme']);
    expect(story!.descriptionText).toContain('Satır 2');
    const risk = (await owner.get(api(`/spaces/${s.id}/custom-fields`)).expect(200))
      .body as CustomFieldsResponse;
    expect(story!.customFields).toEqual({
      [field]: risk.fields[0]!.options.find((o) => o.label === 'Yüksek')!.id,
    });
    expect(task!.parentId).toBe(story!.id);
    expect(task!.type).toBe('TASK');
  });

  it('aynı dış kimlikle yeniden içe aktarma günceller, çoğaltmaz', async () => {
    const s = await space();
    const mapping = { externalId: 'ID', title: 'Başlık', priority: 'Öncelik' };
    await importCsv(s.listId, 'ID,Başlık,Öncelik\nX1,İlk,Düşük\nX2,İkinci,', mapping).expect(200);
    const again = (
      await importCsv(s.listId, 'ID,Başlık,Öncelik\nX1,Yeni ad,Acil\nX3,Üçüncü,', mapping).expect(
        200,
      )
    ).body as ImportResult;
    expect(again).toMatchObject({ created: 1, updated: 1 });
    expect(await titles(s.listId)).toEqual(['Yeni ad', 'İkinci', 'Üçüncü']);
    const first = await ctx.prisma.workItem.findFirstOrThrow({ where: { externalId: 'X1' } });
    expect(first.priority).toBe('URGENT');
  });

  it('dışa aktarılan dosya aynı Space e geri aktarılınca anahtarla eşleşip günceller', async () => {
    const s = await space();
    await owner
      .post(api(`/lists/${s.listId}/items`), { type: 'TASK', title: 'Eski ad' })
      .expect(201);
    const { rows } = (await owner.get(api(`/lists/${s.listId}/export`)).expect(200))
      .body as ExportResponse;
    const titleIndex = rows[0]!.indexOf('Title');
    rows[1]![titleIndex] = 'Yeni ad';
    const csv = rows
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const res = (await preview(s.listId, csv).expect(200)).body as ImportPreview;
    const done = (await importCsv(s.listId, csv, res.mapping).expect(200)).body as ImportResult;
    expect(done).toMatchObject({ created: 0, updated: 1 });
    expect(await titles(s.listId)).toEqual(['Yeni ad']);
  });

  it('hatalı satırlar atlanır ve bildirilir; üstü bulunamayan satır hata verir', async () => {
    const s = await space();
    const csv = 'Başlık,Tip,Üst\nTamam,Görev,\nHatalı tip,uzaylı,\nYetim,Görev,YOK-9';
    const res = (
      await importCsv(s.listId, csv, { title: 'Başlık', type: 'Tip', parent: 'Üst' }).expect(200)
    ).body as ImportResult;
    expect(res).toMatchObject({ created: 1, skipped: 2 });
    expect(res.issues.map((i) => [i.row, i.code])).toEqual([
      [3, 'TYPE_INVALID'],
      [4, 'PARENT_NOT_FOUND'],
    ]);
  });

  it('boş dosya, eşlenmemiş başlık ve yetki reddedilir; büyük gövde kabul edilir', async () => {
    const s = await space();
    const empty = await preview(s.listId, 'Başlık').expect(422);
    expect(empty.body).toEqual({ code: 'IMPORT_EMPTY' });
    const noTitle = await importCsv(s.listId, 'A\n1', { title: null }).expect(422);
    expect(noTitle.body).toEqual({ code: 'IMPORT_TITLE_UNMAPPED' });

    const elif = await inviteAndAccept(ctx, owner, ws, ELIF);
    const elifId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ELIF.email } })).id;
    await owner.put(api(`/spaces/${s.id}/members/${elifId}`), { role: 'STAKEHOLDER' }).expect(204);
    await importCsv(s.listId, 'Başlık\nA', { title: 'Başlık' }, elif).expect(403);
    await elif.get(api(`/lists/${s.listId}/export`)).expect(200);

    const long = 'x'.repeat(190);
    const rows = Array.from({ length: 700 }, (_, i) => `${long} ${i}`);
    const big = ['Başlık', ...rows].join('\n');
    expect(big.length).toBeGreaterThan(100_000);
    const res = (await preview(s.listId, big).expect(200)).body as ImportPreview;
    expect(res.totalRows).toBe(700);
    const tooMany = ['Başlık', ...Array.from({ length: 501 }, (_, i) => `S${i}`)].join('\n');
    const rejected = await importCsv(s.listId, tooMany, { title: 'Başlık' }).expect(422);
    expect(rejected.body).toEqual({ code: 'IMPORT_TOO_LARGE' });
  });
});
