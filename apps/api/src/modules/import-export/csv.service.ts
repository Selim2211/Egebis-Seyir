import { HttpStatus, Injectable } from '@nestjs/common';
import {
  checkEstimate,
  checkFieldValue,
  checkParent,
  checkTypeInSpace,
  type CustomFieldDef,
  type CustomFieldOption,
  CreateWorkItemRequestSchema,
  ERROR_CODES,
  type ExportResponse,
  formatFieldValue,
  IMPORT_LIMITS,
  type ImportIssue,
  type ImportMapping,
  type ImportPreview,
  type ImportRequest,
  type ImportResult,
  type ImportTable,
  cellFor,
  parseCsv,
  parseImportDate,
  parseImportNumber,
  parsePriority,
  parseType,
  richTextToPlain,
  SPACE_PERMISSIONS as S,
  splitImportList,
  suggestMapping,
  toImportTable,
  type CustomFieldValue,
  type Priority,
  type UpdateWorkItemRequest,
  type WorkItemType,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { forbidden, notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';
import { WorkItemsService } from '../work-items/work-items.service';

const EXPORT_MAX_ROWS = 5000;
const IMPORT_SOURCE = 'csv';
const KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;
const CHILD_TYPES: readonly WorkItemType[] = ['SUBTASK', 'TASK', 'STORY', 'BUG'];
const TRUE_WORDS = new Set(['1', 'true', 'yes', 'evet', 'x', '✓', 'e']);
const DEFAULT_LABEL_COLOR = '#64748B';

const lower = (text: string) => text.toLocaleLowerCase('tr');

interface ParsedRow {
  line: number;
  title: string;
  type?: WorkItemType;
  statusId?: string;
  priority?: Priority;
  assigneeIds?: string[];
  labelNames?: string[];
  points?: number;
  estimateHours?: number;
  startDate?: string;
  dueDate?: string;
  parentRef?: string;
  description?: string;
  externalId?: string;
  custom: Record<string, CustomFieldValue>;
}

interface ExistingItem {
  id: string;
  type: WorkItemType;
  keyPrefix: string;
  number: number;
  externalSource: string | null;
  externalId: string | null;
}

/** Düz metni (satır satır) Tiptap belgesine çevirir. */
function plainToDoc(text: string) {
  return {
    type: 'doc',
    content: text
      .split(/\r?\n/)
      .map((line) =>
        line === ''
          ? { type: 'paragraph' }
          : { type: 'paragraph', content: [{ type: 'text', text: line }] },
      ),
  };
}

/** Liste öğelerini CSV'ye aktarır ve CSV'den içe alır (Faz 5.7, ADR-085). */
@Injectable()
export class CsvService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly items: WorkItemsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private need(permission: string): void {
    if (!(this.cls.get('spacePermissions') ?? []).includes(permission)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
  }

  private async loadList(listId: string) {
    const list = await this.tenant.db.list.findFirst({
      where: { id: listId, deletedAt: null, archivedAt: null, space: { deletedAt: null } },
      include: { space: { select: { id: true, scrumEnabled: true, estimationScale: true } } },
    });
    if (!list) throw notFound();
    return list;
  }

  // ---------- Dışa aktarma ----------

  async export(listId: string): Promise<ExportResponse> {
    const list = await this.loadList(listId);
    const db = this.tenant.db;
    const [items, fields] = await Promise.all([
      db.workItem.findMany({
        where: { listId, deletedAt: null },
        include: {
          status: { select: { name: true } },
          assignees: { select: { user: { select: { email: true } } } },
          labels: { select: { label: { select: { name: true } } } },
          parent: { select: { keyPrefix: true, number: true } },
        },
        orderBy: { rank: 'asc' },
        take: EXPORT_MAX_ROWS,
      }),
      db.customField.findMany({ where: { spaceId: list.spaceId }, orderBy: { rank: 'asc' } }),
    ]);
    const personFieldIds = fields.filter((f) => f.type === 'PERSON').map((f) => f.id);
    const personIds = [
      ...new Set(
        items.flatMap((i) =>
          personFieldIds.flatMap((id) => {
            const value = (i.customFields as Record<string, unknown>)[id];
            return typeof value === 'string' ? [value] : [];
          }),
        ),
      ),
    ];
    const memberEmails = new Map(
      (
        await db.membership.findMany({
          where: { userId: { in: personIds } },
          select: { user: { select: { id: true, email: true } } },
        })
      ).map((m) => [m.user.id, m.user.email]),
    );
    const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
    const header: Array<string | number | null> = [
      'ID',
      'Type',
      'Title',
      'Status',
      'Priority',
      'Assignees',
      'Labels',
      'Points',
      'Estimate hours',
      'Start date',
      'Due date',
      'Parent',
      'Created',
      'Completed',
      'Description',
      ...fields.map((f) => f.name),
    ];
    const rows: Array<Array<string | number | null>> = items.map((item) => {
      const values = item.customFields as Record<string, CustomFieldValue>;
      return [
        `${item.keyPrefix}-${item.number}`,
        item.type,
        item.title,
        item.status.name,
        item.priority,
        item.assignees.map((a) => a.user.email).join('; '),
        item.labels.map((l) => l.label.name).join('; '),
        item.points,
        item.estimateHours,
        day(item.startDate),
        day(item.dueDate),
        item.parent ? `${item.parent.keyPrefix}-${item.parent.number}` : null,
        item.createdAt.toISOString(),
        item.completedAt?.toISOString() ?? null,
        item.descriptionText,
        ...fields.map((f) =>
          formatFieldValue(
            { type: f.type, options: f.options as unknown as CustomFieldOption[] },
            values[f.id],
            (id) => memberEmails.get(id),
          ),
        ),
      ];
    });
    return { rows: [header, ...rows] };
  }

  // ---------- İçe aktarma ----------

  /** Önizleme: yazmadan doğrular. */
  async preview(listId: string, csv: string, mapping?: ImportMapping): Promise<ImportPreview> {
    this.need(S.WORK_ITEM_WRITE);
    const list = await this.loadList(listId);
    const table = this.table(csv);
    const fields = await this.tenant.db.customField.findMany({
      where: { spaceId: list.spaceId },
      orderBy: { rank: 'asc' },
      select: { id: true, name: true },
    });
    const effective = mapping ?? suggestMapping(table.headers, fields);
    const tooManyRows = table.rows.length > IMPORT_LIMITS.maxRows;
    const result = await this.process(list, table, effective, true);
    return {
      headers: table.headers,
      mapping: effective,
      totalRows: table.rows.length,
      validRows: result.valid,
      tooManyRows,
      sample: table.rows.slice(0, 5),
      issues: result.issues.slice(0, IMPORT_LIMITS.maxIssues),
    };
  }

  async import(listId: string, input: ImportRequest): Promise<ImportResult> {
    this.need(S.WORK_ITEM_WRITE);
    const list = await this.loadList(listId);
    const table = this.table(input.csv);
    if (table.rows.length > IMPORT_LIMITS.maxRows) {
      throw fail(ERROR_CODES.IMPORT_TOO_LARGE, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (!input.mapping.title) throw fail(ERROR_CODES.IMPORT_TITLE_UNMAPPED);
    const result = await this.process(list, table, input.mapping, false);
    return {
      created: result.created,
      updated: result.updated,
      skipped: table.rows.length - result.created - result.updated,
      issues: result.issues.slice(0, IMPORT_LIMITS.maxIssues),
    };
  }

  private table(csv: string): ImportTable {
    const table = toImportTable(parseCsv(csv));
    if (table.headers.length === 0 || table.rows.length === 0) throw fail(ERROR_CODES.IMPORT_EMPTY);
    return table;
  }

  /** Satırları doğrular; `dryRun` değilse sırayla oluşturur/günceller. */
  private async process(
    list: Awaited<ReturnType<CsvService['loadList']>>,
    table: ImportTable,
    mapping: ImportMapping,
    dryRun: boolean,
  ): Promise<{ valid: number; created: number; updated: number; issues: ImportIssue[] }> {
    const db = this.tenant.db;
    const { workspaceId } = this.ctx;
    const spaceId = list.spaceId;
    const issues: ImportIssue[] = [];
    const issue = (
      row: number,
      code: string,
      field: string | null = null,
      detail: string | null = null,
    ) => issues.push({ row, field, code, detail });

    if (!mapping.title) {
      issue(1, 'TITLE_UNMAPPED');
      return { valid: 0, created: 0, updated: 0, issues };
    }

    const [statuses, members, labels, fields, existing] = await Promise.all([
      db.status.findMany({
        where: { spaceId, archivedAt: null },
        orderBy: { rank: 'asc' },
        select: { id: true, name: true },
      }),
      db.membership.findMany({
        select: { user: { select: { id: true, email: true, name: true } } },
      }),
      db.label.findMany({ where: { spaceId }, select: { id: true, name: true } }),
      db.customField.findMany({ where: { spaceId } }),
      db.workItem.findMany({
        where: { spaceId, deletedAt: null },
        select: {
          id: true,
          type: true,
          keyPrefix: true,
          number: true,
          externalSource: true,
          externalId: true,
        },
      }),
    ]);
    const statusByName = new Map(statuses.map((s) => [lower(s.name), s.id]));
    const userByToken = new Map<string, string>();
    for (const { user } of members) {
      userByToken.set(lower(user.email), user.id);
      userByToken.set(lower(user.name), user.id);
    }
    const labelByName = new Map(labels.map((l) => [lower(l.name), l.id]));
    const fieldById = new Map(fields.map((f) => [f.id, f]));

    const lookup = (ref: string): ExistingItem | undefined => {
      const key = KEY_PATTERN.exec(ref);
      if (key) {
        const hit = existing.find(
          (i) => lower(i.keyPrefix) === lower(key[1]!) && i.number === Number(key[2]),
        );
        if (hit) return hit;
      }
      return existing.find((i) => i.externalSource === IMPORT_SOURCE && i.externalId === ref);
    };

    // ---- Satırları ayrıştır ve doğrula ----
    const parsed: ParsedRow[] = [];
    table.rows.forEach((row, index) => {
      const line = index + 2;
      const before = issues.length;
      const cell = (target: string) => cellFor(table, mapping, row, target);
      const title = cell('title');
      if (!title) issue(line, 'TITLE_REQUIRED', 'title');
      const out: ParsedRow = { line, title, custom: {} };

      const type = cell('type');
      if (type) {
        const value = parseType(type);
        if (value) out.type = value;
        else issue(line, 'TYPE_INVALID', 'type', type);
      }
      const status = cell('status');
      if (status) {
        const id = statusByName.get(lower(status));
        if (id) out.statusId = id;
        else issue(line, 'STATUS_UNKNOWN', 'status', status);
      }
      const priority = cell('priority');
      if (priority) {
        const value = parsePriority(priority);
        if (value) out.priority = value;
        else issue(line, 'PRIORITY_INVALID', 'priority', priority);
      }
      const assignees = cell('assignees');
      if (assignees) {
        const tokens = splitImportList(assignees);
        const unknown = tokens.filter((t) => !userByToken.has(lower(t)));
        if (unknown.length > 0) issue(line, 'ASSIGNEE_UNKNOWN', 'assignees', unknown.join(', '));
        else out.assigneeIds = [...new Set(tokens.map((t) => userByToken.get(lower(t))!))];
      }
      const labelText = cell('labels');
      if (labelText) out.labelNames = splitImportList(labelText);
      for (const target of ['points', 'estimateHours'] as const) {
        const text = cell(target);
        if (!text) continue;
        const value = parseImportNumber(text);
        if (value === null) issue(line, 'NUMBER_INVALID', target, text);
        else out[target] = value;
      }
      for (const target of ['startDate', 'dueDate'] as const) {
        const text = cell(target);
        if (!text) continue;
        const value = parseImportDate(text);
        if (value === null) issue(line, 'DATE_INVALID', target, text);
        else out[target] = value;
      }
      if (out.startDate && out.dueDate && out.startDate > out.dueDate) {
        issue(line, 'DATE_ORDER', 'dueDate');
      }
      out.parentRef = cell('parent') || undefined;
      out.description = cell('description') || undefined;
      out.externalId = cell('externalId') || undefined;

      for (const [target, header] of Object.entries(mapping)) {
        if (!target.startsWith('cf:') || !header) continue;
        const field = fieldById.get(target.slice(3));
        const text = cell(target);
        if (!field || !text) continue;
        const value = this.customValue(field, text, userByToken);
        if (value === undefined) issue(line, 'CUSTOM_FIELD_INVALID', field.name, text);
        else out.custom[field.id] = value;
      }
      if (issues.length === before) parsed.push(out);
    });

    // ---- Üst öğe çözümü ve sıralama (üstler altlardan önce) ----
    const createdByExternal = new Map<string, { id: string; type: WorkItemType }>();
    const inFileIds = new Set(parsed.flatMap((p) => (p.externalId ? [p.externalId] : [])));
    let pending = [...parsed];
    let created = 0;
    let updated = 0;
    let valid = 0;

    const resolveParent = (ref: string): { id: string; type: WorkItemType } | undefined => {
      const made = createdByExternal.get(ref);
      if (made) return made;
      const hit = lookup(ref);
      return hit ? { id: hit.id, type: hit.type } : undefined;
    };

    while (pending.length > 0) {
      const ready = pending.filter(
        (p) => !p.parentRef || resolveParent(p.parentRef) || (dryRun && inFileIds.has(p.parentRef)),
      );
      if (ready.length === 0) break;
      pending = pending.filter((p) => !ready.includes(p));

      for (const row of ready) {
        const match = row.externalId ? lookup(row.externalId) : undefined;
        const parent = row.parentRef ? resolveParent(row.parentRef) : undefined;
        const parentType =
          parent?.type ??
          (row.parentRef && dryRun
            ? parsed.find((p) => p.externalId === row.parentRef)?.type
            : undefined);

        const type = match
          ? match.type
          : (row.type ??
            (parentType ? CHILD_TYPES.find((t) => checkParent(t, parentType).ok) : undefined) ??
            'TASK');

        const problem = this.checkRow(
          row,
          type,
          parentType ?? null,
          match !== undefined,
          list.space,
        );
        if (problem) {
          issue(row.line, problem.code, problem.field, problem.detail);
          continue;
        }
        valid += 1;
        if (dryRun) {
          if (row.externalId) createdByExternal.set(row.externalId, { id: '', type });
          continue;
        }
        try {
          const labelIds = row.labelNames
            ? await Promise.all(
                row.labelNames.map(async (name) => {
                  const known = labelByName.get(lower(name));
                  if (known) return known;
                  const made = await db.label.create({
                    data: { workspaceId, spaceId, name, color: DEFAULT_LABEL_COLOR },
                    select: { id: true },
                  });
                  labelByName.set(lower(name), made.id);
                  return made.id;
                }),
              )
            : undefined;

          if (match) {
            await this.update(match.id, row, labelIds);
            updated += 1;
          } else {
            const made = await this.create(list.id, row, type, parent?.id ?? null, labelIds);
            created += 1;
            if (row.externalId) createdByExternal.set(row.externalId, { id: made, type });
            existing.push({
              id: made,
              type,
              keyPrefix: '',
              number: -1,
              externalSource:
                row.externalId && !KEY_PATTERN.test(row.externalId) ? IMPORT_SOURCE : null,
              externalId:
                row.externalId && !KEY_PATTERN.test(row.externalId) ? row.externalId : null,
            });
          }
        } catch (error) {
          valid -= 1;
          issue(row.line, 'WRITE_FAILED', null, this.errorCode(error));
        }
      }
    }
    for (const row of pending) issue(row.line, 'PARENT_NOT_FOUND', 'parent', row.parentRef ?? null);
    issues.sort((a, b) => a.row - b.row);
    return { valid, created, updated, issues };
  }

  private errorCode(error: unknown): string {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    if (typeof response === 'object' && response !== null && 'code' in response) {
      return String(response.code);
    }
    return error instanceof Error ? error.message : 'ERROR';
  }

  /** Tip, hiyerarşi ve tahmin kuralları (yazmadan önce, önizlemede de aynı). */
  private checkRow(
    row: ParsedRow,
    type: WorkItemType,
    parentType: WorkItemType | null,
    isUpdate: boolean,
    space: { scrumEnabled: boolean; estimationScale: 'FIBONACCI' | 'TSHIRT' | 'NUMBER' },
  ): { code: string; field: string | null; detail: string | null } | null {
    if (!isUpdate) {
      const inSpace = checkTypeInSpace(type, space.scrumEnabled);
      if (!inSpace.ok) return { code: inSpace.code, field: 'type', detail: type };
      const hierarchy = checkParent(type, parentType);
      if (!hierarchy.ok) return { code: hierarchy.code, field: 'parent', detail: null };
    }
    const estimate = checkEstimate(type, space.estimationScale, {
      points: row.points,
      estimateHours: row.estimateHours,
    });
    if (!estimate.ok) {
      return {
        code: estimate.code,
        field: row.points !== undefined ? 'points' : 'estimateHours',
        detail: null,
      };
    }
    return null;
  }

  /** Metni özel alan türüne çevirir; geçersizse undefined. */
  private customValue(
    field: { id: string; type: CustomFieldDef['type']; options: unknown },
    text: string,
    users: ReadonlyMap<string, string>,
  ): CustomFieldValue | undefined {
    const options = field.options as CustomFieldOption[];
    const def: CustomFieldDef = { id: field.id, type: field.type, options };
    const find = (label: string) => options.find((o) => lower(o.label) === lower(label))?.id;
    let raw: unknown = text;
    switch (field.type) {
      case 'NUMBER': {
        const n = Number(text.replace(',', '.'));
        raw = Number.isFinite(n) && /^-?\d+([.,]\d+)?$/.test(text.trim()) ? n : NaN;
        break;
      }
      case 'DATE':
        raw = parseImportDate(text) ?? '';
        break;
      case 'CHECKBOX':
        raw = TRUE_WORDS.has(lower(text.trim()));
        break;
      case 'DROPDOWN':
        raw = find(text.trim()) ?? '';
        break;
      case 'MULTI_SELECT': {
        const ids = splitImportList(text).map(find);
        raw = ids.some((id) => id === undefined) ? ['?'] : ids;
        break;
      }
      case 'PERSON':
        raw = users.get(lower(text.trim())) ?? '';
        break;
    }
    const check = checkFieldValue(def, raw);
    return check.ok && check.value !== null ? check.value : undefined;
  }

  private async create(
    listId: string,
    row: ParsedRow,
    type: WorkItemType,
    parentId: string | null,
    labelIds: string[] | undefined,
  ): Promise<string> {
    const made = await this.items.create(
      listId,
      CreateWorkItemRequestSchema.parse({
        type,
        title: row.title,
        statusId: row.statusId,
        priority: row.priority ?? 'NORMAL',
        parentId,
        assigneeIds: row.assigneeIds ?? [],
        labelIds: labelIds ?? [],
        startDate: row.startDate ?? null,
        dueDate: row.dueDate ?? null,
        points: row.points ?? null,
        estimateHours: row.estimateHours ?? null,
      }),
    );
    const external = row.externalId && !KEY_PATTERN.test(row.externalId);
    if (row.description || Object.keys(row.custom).length > 0 || external) {
      const doc = row.description ? plainToDoc(row.description) : null;
      await this.tenant.db.workItem.update({
        where: { id: made.id },
        data: {
          ...(external && { externalSource: IMPORT_SOURCE, externalId: row.externalId }),
          ...(doc && {
            description: asJson(doc),
            descriptionText: richTextToPlain(doc as never),
          }),
          ...(Object.keys(row.custom).length > 0 && { customFields: asJson(row.custom) }),
        },
      });
    }
    return made.id;
  }

  /** Var olan öğeyi yalnızca dosyada dolu gelen alanlarla günceller (boş hücre silmez). */
  private async update(
    itemId: string,
    row: ParsedRow,
    labelIds: string[] | undefined,
  ): Promise<void> {
    const body: UpdateWorkItemRequest = {
      title: row.title,
      ...(row.priority && { priority: row.priority }),
      ...(row.statusId && { statusId: row.statusId }),
      ...(row.assigneeIds && { assigneeIds: row.assigneeIds }),
      ...(labelIds && { labelIds }),
      ...(row.startDate && { startDate: row.startDate }),
      ...(row.dueDate && { dueDate: row.dueDate }),
      ...(row.points !== undefined && { points: row.points }),
      ...(row.estimateHours !== undefined && { estimateHours: row.estimateHours }),
      ...(Object.keys(row.custom).length > 0 && { customFields: row.custom }),
    };
    await this.items.update(itemId, body);
    if (row.description) {
      const doc = plainToDoc(row.description);
      await this.tenant.db.workItem.update({
        where: { id: itemId },
        data: { description: asJson(doc), descriptionText: richTextToPlain(doc as never) },
      });
    }
  }
}
