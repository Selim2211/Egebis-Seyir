import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  SPACE_PERMISSIONS as S,
  SPRINT_IMPORT_MAX_BYTES,
  sprintEligibility,
  type ImportTable,
  type SprintImportFields,
  type SprintImportIssue,
  type SprintImportResult,
} from '@scrum/shared';
import ExcelJS from 'exceljs';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CsvService } from '../import-export/csv.service';
import { forbidden, notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';
import { ItemDetailsService } from '../work-items/item-details.service';
import { BacklogService } from './backlog.service';
import { SprintsService } from './sprints.service';
import { countedItems, loadScrumSpace } from './sprint-support';

const KEY_COLUMN = 0;
const PARENT_COLUMN = 11;
const LINK_TYPES = ['BLOCKS', 'RELATES_TO', 'DUPLICATES'] as const;
type LinkRelation = (typeof LINK_TYPES)[number];
const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const addDaysTo = (day: string, days: number) =>
  dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000));

/** Hücre değerini düz metne çevirir (tarih → YYYY-MM-DD, formül sonucu, zengin metin). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return dayOf(value);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((p) => p.text).join('');
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text);
    return '';
  }
  return String(value).trim();
}

function sheetRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  });
  return rows;
}

/**
 * Sprint ve Backlog'u Excel (.xlsx) olarak dışa/içe aktarır (Faz 8.4, ADR-104). Sayfalar:
 * "Sprint" (ad, hedef, tarihler), "Items" (CSV dışa aktarmasıyla aynı sütunlar), "Links" (bağımlılıklar).
 */
@Injectable()
export class SprintExcelService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly csv: CsvService,
    private readonly sprints: SprintsService,
    private readonly backlog: BacklogService,
    private readonly details: ItemDetailsService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private need(permission: string): void {
    if (!(this.cls.get('spacePermissions') ?? []).includes(permission)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
  }

  // ---------- Dışa aktarma ----------

  async exportSprint(sprintId: string): Promise<{ name: string; file: Buffer }> {
    const sprint = await this.tenant.db.sprint.findFirst({ where: { id: sprintId } });
    if (!sprint) throw notFound();
    const file = await this.workbook(
      sprint.spaceId,
      { OR: [{ sprintId }, { parent: { sprintId } }], ...countedItems },
      [{ backlogRank: 'asc' }, { createdAt: 'asc' }],
      {
        name: sprint.name,
        goal: sprint.goal,
        startDate: dayOf(sprint.startDate),
        endDate: dayOf(sprint.endDate),
        status: sprint.status,
      },
    );
    return { name: sprint.name, file };
  }

  async exportBacklog(spaceId: string): Promise<{ name: string; file: Buffer }> {
    await loadScrumSpace(this.tenant.db, spaceId, false);
    const space = await this.tenant.db.space.findFirstOrThrow({
      where: { id: spaceId },
      select: { key: true },
    });
    const file = await this.workbook(
      spaceId,
      { spaceId, sprintId: null, ...countedItems, status: { category: { not: 'DONE' } } },
      [{ backlogRank: 'asc' }, { createdAt: 'asc' }],
      null,
    );
    return { name: `${space.key}-backlog`, file };
  }

  private async workbook(
    spaceId: string,
    where: object,
    orderBy: object[],
    sprint: {
      name: string;
      goal: string | null;
      startDate: string;
      endDate: string;
      status: string;
    } | null,
  ): Promise<Buffer> {
    const { rows } = await this.csv.exportRows(where, spaceId, orderBy);
    const header = rows[0]!;
    const body = rows.slice(1);
    const keys = new Set(body.map((r) => String(r[KEY_COLUMN])));
    // Üst öğe dışarıda kalıyorsa (ör. Epic) boş bırakılır; dosya başka Space'e de aktarılabilsin.
    for (const row of body) {
      if (row[PARENT_COLUMN] && !keys.has(String(row[PARENT_COLUMN]))) row[PARENT_COLUMN] = null;
    }
    const idRows = await this.tenant.db.workItem.findMany({
      where,
      select: { id: true, keyPrefix: true, number: true },
    });
    const keyOf = new Map(idRows.map((i) => [i.id, `${i.keyPrefix}-${i.number}`]));
    const links = await this.tenant.db.workItemLink.findMany({
      where: { fromId: { in: [...keyOf.keys()] }, toId: { in: [...keyOf.keys()] } },
      select: { fromId: true, toId: true, type: true },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Egebis Seyir';
    if (sprint) {
      const info = wb.addWorksheet('Sprint');
      info.addRows([
        ['Name', sprint.name],
        ['Goal', sprint.goal ?? ''],
        ['Start date', sprint.startDate],
        ['End date', sprint.endDate],
        ['Status', sprint.status],
      ]);
      info.getColumn(1).font = { bold: true };
      info.columns = [{ width: 14 }, { width: 50 }];
    }
    const items = wb.addWorksheet('Items');
    items.addRow(header);
    for (const row of body) items.addRow(row);
    items.getRow(1).font = { bold: true };
    items.views = [{ state: 'frozen', ySplit: 1 }];
    items.columns = header.map((name, index) => ({
      width: index === 2 ? 48 : index === 14 ? 60 : Math.max(12, String(name).length + 4),
    }));
    items.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };

    const sheet = wb.addWorksheet('Links');
    sheet.addRow(['Source', 'Type', 'Target']);
    for (const link of links) {
      sheet.addRow([keyOf.get(link.fromId), link.type, keyOf.get(link.toId)]);
    }
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [{ width: 14 }, { width: 14 }, { width: 14 }];

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------- İçe aktarma ----------

  async import(
    spaceId: string,
    file: Express.Multer.File | undefined,
    fields: SprintImportFields,
  ): Promise<SprintImportResult> {
    this.need(S.SPRINT_PLAN);
    this.need(S.WORK_ITEM_WRITE);
    const db = this.tenant.db;
    await loadScrumSpace(db, spaceId, true);
    if (!file || file.size === 0) throw fail(ERROR_CODES.IMPORT_EMPTY);
    if (file.size > SPRINT_IMPORT_MAX_BYTES) {
      throw fail(ERROR_CODES.IMPORT_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const dryRun = fields.dryRun === 'true';
    const list = await db.list.findFirst({
      where: { id: fields.listId, spaceId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    if (!list) throw notFound();
    const target = fields.sprintId
      ? await db.sprint.findFirst({ where: { id: fields.sprintId, spaceId } })
      : null;
    if (fields.sprintId && !target) throw notFound();

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw fail(ERROR_CODES.IMPORT_EMPTY);
    }
    const issues: SprintImportIssue[] = [];
    const sheetOf = (name: string) =>
      wb.worksheets.find((w) => w.name.toLowerCase() === name.toLowerCase());
    const itemsSheet = sheetOf('Items') ?? wb.worksheets.find((w) => w.name !== 'Sprint');
    if (!itemsSheet) throw fail(ERROR_CODES.IMPORT_EMPTY);
    const [headers, ...rows] = sheetRows(itemsSheet);
    if (!headers || rows.length === 0) throw fail(ERROR_CODES.IMPORT_EMPTY);
    const table: ImportTable = { headers, rows };

    const outcome = await this.csv.importTable(list.id, table, dryRun);
    for (const i of outcome.issues) {
      issues.push({ row: i.row, sheet: 'Items', code: i.code, field: i.field, detail: i.detail });
    }

    // Bağımlılıklar: önce dosyadaki anahtarları öğelere çevir.
    const linkRows = (sheetOf('Links') ? sheetRows(sheetOf('Links')!) : []).slice(1);
    const parsedLinks = linkRows.flatMap((cells, index) => {
      const [source, type, targetKey] = cells;
      if (!source && !type && !targetKey) return [];
      if (!source || !targetKey || !LINK_TYPES.includes(type as LinkRelation)) {
        issues.push({
          row: index + 2,
          sheet: 'Links',
          code: 'LINK_INVALID',
          field: null,
          detail: null,
        });
        return [];
      }
      return [{ line: index + 2, source, type: type as LinkRelation, target: targetKey }];
    });

    if (dryRun) {
      return {
        dryRun: true,
        sprintId: target?.id ?? null,
        sprintName: target?.name ?? this.sprintInfo(sheetOf('Sprint')).name,
        // Önizlemede yazım yoktur: geçerli satır sayısı `inSprint` alanında döner.
        created: 0,
        updated: 0,
        inSprint: outcome.valid,
        links: parsedLinks.length,
        issues,
      };
    }

    // Sprint: verilen ya da dosyadaki bilgiyle yeni.
    let sprintId = target?.id ?? null;
    let sprintName = target?.name ?? null;
    if (!sprintId) {
      const info = this.sprintInfo(sheetOf('Sprint'));
      const made = await this.sprints.create(spaceId, info);
      sprintId = made.id;
      sprintName = info.name;
    }

    // Eklenebilen (Story/Bug/Task, üst düzey, bitmemiş) öğeler sprint'e alınır.
    const ids = [...outcome.refs.values()];
    const found = await db.workItem.findMany({
      where: { id: { in: ids }, spaceId, ...countedItems },
      include: { status: { select: { category: true } }, parent: { select: { type: true } } },
    });
    const eligible = found
      .filter(
        (i) =>
          sprintEligibility({
            type: i.type,
            parentType: i.parent?.type ?? null,
            category: i.status.category,
          }) === null,
      )
      .map((i) => i.id);
    if (eligible.length > 0) await this.backlog.move(spaceId, { itemIds: eligible, sprintId });

    // Bağımlılıklar.
    const keyed = await db.workItem.findMany({
      where: { spaceId, ...countedItems },
      select: { id: true, keyPrefix: true, number: true },
    });
    const idByKey = new Map(keyed.map((i) => [`${i.keyPrefix}-${i.number}`.toLowerCase(), i.id]));
    let linkCount = 0;
    for (const link of parsedLinks) {
      const from = outcome.refs.get(link.source) ?? idByKey.get(link.source.toLowerCase());
      const to = outcome.refs.get(link.target) ?? idByKey.get(link.target.toLowerCase());
      if (!from || !to) {
        issues.push({
          row: link.line,
          sheet: 'Links',
          code: 'LINK_ITEM_NOT_FOUND',
          field: null,
          detail: `${link.source} → ${link.target}`,
        });
        continue;
      }
      try {
        await this.details.addLink(from, { targetId: to, relation: link.type });
        linkCount += 1;
      } catch (error) {
        const code = (error as { getResponse?: () => { code?: string } }).getResponse?.()?.code;
        // Aynı bağımlılık zaten varsa sorun değil.
        if (code !== ERROR_CODES.WORK_ITEM_LINK_EXISTS) {
          issues.push({
            row: link.line,
            sheet: 'Links',
            code: code ?? 'LINK_FAILED',
            field: null,
            detail: `${link.source} → ${link.target}`,
          });
        }
      }
    }

    await this.activity.record(this.tenant.db, {
      workspaceId: this.ctx.workspaceId,
      actorId: this.ctx.actorId,
      entityType: 'sprint',
      entityId: sprintId,
      action: 'sprint.imported',
      changes: asJson({
        name: sprintName,
        created: outcome.created,
        updated: outcome.updated,
        links: linkCount,
      }),
    });
    return {
      dryRun: false,
      sprintId,
      sprintName,
      created: outcome.created,
      updated: outcome.updated,
      inSprint: eligible.length,
      links: linkCount,
      issues,
    };
  }

  /** "Sprint" sayfasından ad/hedef/tarih; eksikse bugünden iki haftalık varsayılan. */
  private sprintInfo(sheet: ExcelJS.Worksheet | undefined) {
    const values = new Map<string, string>();
    if (sheet) {
      for (const [label, value] of sheetRows(sheet)) {
        if (label) values.set(label.toLowerCase(), value ?? '');
      }
    }
    const today = dayOf(new Date());
    const day = (key: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(values.get(key) ?? '') ? values.get(key)! : null;
    const startDate = day('start date') ?? today;
    const endDate = day('end date') ?? addDaysTo(startDate, 13);
    return {
      name: values.get('name') || 'İçe aktarılan sprint',
      goal: values.get('goal') || undefined,
      startDate,
      endDate: endDate < startDate ? addDaysTo(startDate, 13) : endDate,
    };
  }
}
