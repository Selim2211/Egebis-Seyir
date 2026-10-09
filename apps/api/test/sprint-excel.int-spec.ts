import type {
  Created,
  CreatedItem,
  HierarchyResponse,
  SprintDetail,
  SprintImportResult,
  WorkItemDetail,
} from '@scrum/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestApp, resetState, setupOwner, type TestContext } from './helpers';

/** Faz 8.4 (ADR-104): Sprint Excel dışa/içe aktarma, bağımlılıklarla. */
describe('Sprint Excel dışa/içe aktarma (gerçek veritabanı)', () => {
  let ctx: TestContext;
  let owner: Client;
  let ws: string;
  const api = (path: string) => `/api/workspaces/${ws}${path}`;

  const space = async (key: string) => {
    const res = await owner
      .post(api('/spaces'), { name: `Space ${key}`, key, color: '#7C3AED' })
      .expect(201);
    const id = (res.body as Created).id;
    const tree = (await owner.get(api('/hierarchy')).expect(200)).body as HierarchyResponse;
    return { id, listId: tree.spaces.find((s) => s.id === id)!.lists[0]!.id };
  };
  const item = async (listId: string, body: Record<string, unknown>) =>
    (await owner.post(api(`/lists/${listId}/items`), body).expect(201)).body as CreatedItem;
  const sheetRows = (wb: ExcelJS.Workbook, name: string) => {
    const rows: Array<Array<ExcelJS.CellValue>> = [];
    wb.getWorksheet(name)!.eachRow((row) =>
      rows.push((row.values as ExcelJS.CellValue[]).slice(1)),
    );
    return rows;
  };
  const load = async (buffer: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    return wb;
  };
  const exportSprint = async (id: string) =>
    (await owner.download(api(`/sprints/${id}/export.xlsx`)).expect(200)).body as Buffer;
  const importXlsx = (
    spaceId: string,
    file: Buffer,
    fields: Record<string, string>,
    expected = 200,
  ) =>
    owner
      .upload(api(`/spaces/${spaceId}/sprints/import`), file, 'sprint.xlsx', fields)
      .expect(expected);

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

  /** MOB: Story (5 puan) + alt Task + Task; Task ↔ Story bağımlılığı; hepsi Sprint 1'de. */
  const seed = async () => {
    const mob = await space('MOB');
    const story = await item(mob.listId, {
      type: 'STORY',
      title: 'Kartla ödeme',
      points: 5,
      priority: 'HIGH',
      startDate: '2026-10-05',
      dueDate: '2026-10-09',
    });
    const task = await item(mob.listId, { type: 'TASK', title: 'Form', parentId: story.id });
    const other = await item(mob.listId, { type: 'TASK', title: 'Servis', estimateHours: 3 });
    await owner
      .post(api(`/items/${other.id}/links`), { targetId: story.id, relation: 'BLOCKS' })
      .expect(201);
    const sprint = (
      await owner
        .post(api(`/spaces/${mob.id}/sprints`), {
          name: 'Sprint 1',
          goal: 'Ödeme akışı',
          startDate: '2026-10-05',
          endDate: '2026-10-16',
        })
        .expect(201)
    ).body as Created;
    await owner
      .post(api(`/spaces/${mob.id}/backlog/move`), {
        itemIds: [story.id, other.id],
        sprintId: sprint.id,
      })
      .expect(204);
    return { mob, story, task, other, sprint };
  };

  it('dışa aktarma: sprint bilgisi, öğeler (alt görev dahil) ve bağımlılıklar', async () => {
    const { sprint, story, task, other } = await seed();
    const wb = await load(await exportSprint(sprint.id));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Sprint', 'Items', 'Links']);

    const info: Record<string, unknown> = Object.fromEntries(
      sheetRows(wb, 'Sprint').map((r) => [r[0] as string, r[1]]),
    );
    expect(info).toMatchObject({
      Name: 'Sprint 1',
      Goal: 'Ödeme akışı',
      'Start date': '2026-10-05',
      'End date': '2026-10-16',
    });

    const items = sheetRows(wb, 'Items');
    expect(items[0]!.slice(0, 5)).toEqual(['ID', 'Type', 'Title', 'Status', 'Priority']);
    const byKey = new Map(items.slice(1).map((r) => [r[0], r]));
    expect([...byKey.keys()].sort()).toEqual([story.key, task.key, other.key].sort());
    expect(byKey.get(story.key)).toEqual(expect.arrayContaining(['Kartla ödeme', 'HIGH', 5]));
    expect(byKey.get(task.key)![11]).toBe(story.key); // Parent

    expect(sheetRows(wb, 'Links')).toEqual([
      ['Source', 'Type', 'Target'],
      [other.key, 'BLOCKS', story.key],
    ]);
  });

  it("başka Space'e içe aktarma: yeni sprint, öğeler, üst öğe ve bağımlılık korunur", async () => {
    const { sprint } = await seed();
    const file = await exportSprint(sprint.id);
    const target = await space('IOS');

    const preview = (await importXlsx(target.id, file, { listId: target.listId, dryRun: 'true' }))
      .body as SprintImportResult;
    expect(preview).toMatchObject({ dryRun: true, sprintName: 'Sprint 1', issues: [] });

    const done = (await importXlsx(target.id, file, { listId: target.listId }))
      .body as SprintImportResult;
    expect(done).toMatchObject({ dryRun: false, created: 3, updated: 0, links: 1, issues: [] });
    expect(done.inSprint).toBe(2); // Sub-task sprint'e girmez

    const detail = (await owner.get(api(`/sprints/${done.sprintId}`)).expect(200))
      .body as SprintDetail;
    expect(detail.sprint).toMatchObject({ name: 'Sprint 1', goal: 'Ödeme akışı', itemCount: 2 });
    const titles = detail.items.map((i) => i.title).sort();
    expect(titles).toEqual(['Kartla ödeme', 'Servis']);
    const story = detail.items.find((i) => i.title === 'Kartla ödeme')!;
    expect(story.key.startsWith('IOS-')).toBe(true);
    expect(story).toMatchObject({ points: 5, priority: 'HIGH' });

    const full = (await owner.get(api(`/items/${story.id}`)).expect(200)).body as WorkItemDetail;
    expect(full.links.map((l) => [l.relation, l.item.title])).toEqual([['BLOCKED_BY', 'Servis']]);
    expect(full.children.map((c) => [c.title, c.type])).toEqual([['Form', 'TASK']]);
  });

  it("aynı Space'e içe aktarma anahtarı eşleşen öğeleri günceller", async () => {
    const { sprint, story, mob } = await seed();
    const wb = await load(await exportSprint(sprint.id));
    const sheet = wb.getWorksheet('Items')!;
    sheet.eachRow((row, index) => {
      if (index > 1 && row.getCell(1).value === story.key) row.getCell(3).value = 'Kartla ödeme v2';
    });
    const edited = Buffer.from(await wb.xlsx.writeBuffer());

    const res = (await importXlsx(mob.id, edited, { listId: mob.listId, sprintId: sprint.id }))
      .body as SprintImportResult;
    expect(res).toMatchObject({ created: 0, updated: 3, links: 0, issues: [] });
    const full = (await owner.get(api(`/items/${story.id}`)).expect(200)).body as WorkItemDetail;
    expect(full.title).toBe('Kartla ödeme v2');
  });

  it('hatalı dosya ve eksik izin', async () => {
    const mob = await space('MOB');
    await importXlsx(mob.id, Buffer.from('bu bir excel değil'), { listId: mob.listId }, 422);
    await owner
      .upload(api(`/spaces/${mob.id}/sprints/import`), Buffer.alloc(0), 'bos.xlsx', {
        listId: mob.listId,
      })
      .expect(422);
  });

  it("backlog dışa aktarma: sprint'te olmayan açık öğeler", async () => {
    const mob = await space('MOB');
    const a = await item(mob.listId, { type: 'STORY', title: 'Bekleyen' });
    const buffer = (await owner.download(api(`/spaces/${mob.id}/backlog/export.xlsx`)).expect(200))
      .body as Buffer;
    const wb = await load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Items', 'Links']);
    expect(sheetRows(wb, 'Items')[1]![0]).toBe(a.key);
  });
});
