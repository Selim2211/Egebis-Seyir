import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ApplyTemplateRequest,
  type Created,
  type CreatedItem,
  CreateSpaceFromTemplateRequestSchema,
  CreateWorkItemRequestSchema,
  type CreateSpaceTemplateRequest,
  type CreateTemplateRequest,
  ERROR_CODES,
  type ItemTemplatePayload,
  ItemTemplatePayloadSchema,
  DocTemplatePayloadSchema,
  ListTemplatePayloadSchema,
  MAX_TEMPLATES_PER_KIND,
  OPTION_FIELD_TYPES,
  ranksAfter,
  richTextToPlain,
  SPACE_PERMISSIONS as S,
  SpaceTemplatePayloadSchema,
  SprintTemplatePayloadSchema,
  type Template,
  type TemplateKind,
  type TemplatesResponse,
  addDays,
  type CreateSpaceFromTemplateRequest,
} from '@scrum/shared';
import { randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DocsService } from '../docs/docs.service';
import { SpacesService } from '../spaces/spaces.service';
import { StructureService } from '../spaces/structure.service';
import { forbidden, notFound } from '../spaces/space-errors';
import { SprintsService } from '../sprints/sprints.service';
import { asJson, fail } from '../work-items/item-support';
import { WorkItemsService } from '../work-items/work-items.service';

const lower = (text: string) => text.toLocaleLowerCase('tr');
const conflict = (code: Parameters<typeof fail>[0]) => fail(code, HttpStatus.CONFLICT);

/** Şablonlar (Faz 5.5, ADR-083): var olandan yakala, şablondan uygula. */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly items: WorkItemsService,
    private readonly structure: StructureService,
    private readonly sprints: SprintsService,
    private readonly docs: DocsService,
    private readonly spaces: SpacesService,
    private readonly customFields: CustomFieldsService,
    private readonly access: SpaceAccessService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private need(permission: string): void {
    if (!(this.cls.get('spacePermissions') ?? []).includes(permission)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
  }

  // ---------- Listeleme ----------

  private summarize(kind: TemplateKind, payload: unknown): string {
    const p = payload as Record<string, unknown>;
    switch (kind) {
      case 'ITEM':
        return `${(p.subItems as unknown[] | undefined)?.length ?? 0}`;
      case 'LIST':
        return `${(p.items as unknown[] | undefined)?.length ?? 0}`;
      case 'SPRINT':
        return `${p.lengthDays as number}`;
      case 'SPACE':
        return `${(p.statuses as unknown[] | undefined)?.length ?? 0}`;
      case 'DOC':
        return '';
    }
  }

  private toTemplate(row: {
    id: string;
    kind: TemplateKind;
    name: string;
    payload: unknown;
    createdAt: Date;
    createdBy: { name: string } | null;
  }): Template {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdBy?.name ?? null,
      summary: this.summarize(row.kind, row.payload),
    };
  }

  private async assertSpace(spaceId: string) {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true, scrumEnabled: true },
    });
    if (!space) throw notFound();
    return space;
  }

  async list(spaceId: string): Promise<TemplatesResponse> {
    await this.assertSpace(spaceId);
    const rows = await this.tenant.db.template.findMany({
      where: { spaceId },
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return { templates: rows.map((r) => this.toTemplate(r)) };
  }

  async listSpaceTemplates(): Promise<TemplatesResponse> {
    const rows = await this.tenant.db.template.findMany({
      where: { kind: 'SPACE' },
      include: { createdBy: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return { templates: rows.map((r) => this.toTemplate(r)) };
  }

  // ---------- Kaydetme (var olandan yakala) ----------

  private async assertNameFree(spaceId: string | null, kind: TemplateKind, name: string) {
    const rows = await this.tenant.db.template.findMany({
      where: { spaceId, kind },
      select: { name: true },
    });
    if (rows.length >= MAX_TEMPLATES_PER_KIND) throw conflict(ERROR_CODES.TEMPLATE_LIMIT);
    if (rows.some((r) => lower(r.name) === lower(name))) {
      throw conflict(ERROR_CODES.TEMPLATE_NAME_TAKEN);
    }
  }

  private async store(
    spaceId: string | null,
    kind: TemplateKind,
    name: string,
    payload: unknown,
  ): Promise<Created> {
    await this.assertNameFree(spaceId, kind, name);
    const { workspaceId, actorId } = this.ctx;
    const row = await this.tenant.db.template.create({
      data: { workspaceId, spaceId, kind, name, payload: asJson(payload), createdById: actorId },
      select: { id: true },
    });
    return { id: row.id };
  }

  /** Bir öğeyi (ve bir seviye alt öğelerini) şablon yüküne çevirir. */
  private async itemPayload(
    spaceId: string,
    itemId: string,
    withChildren: boolean,
  ): Promise<ItemTemplatePayload> {
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({
      where: { id: itemId, spaceId, deletedAt: null },
      include: {
        labels: { include: { label: { select: { name: true } } } },
        checklists: { include: { items: true }, orderBy: { rank: 'asc' } },
        children: {
          where: { deletedAt: null },
          select: { type: true, title: true, rank: true },
          orderBy: { rank: 'asc' },
        },
      },
    });
    if (!item) throw notFound();
    return {
      type: item.type,
      title: item.title,
      description: item.description as ItemTemplatePayload['description'],
      priority: item.priority,
      points: item.points,
      estimateHours: item.estimateHours,
      labels: item.labels.map((l) => l.label.name),
      customFields: item.customFields as ItemTemplatePayload['customFields'],
      checklists: item.checklists.map((c) => ({
        kind: c.kind,
        title: c.title,
        items: c.items.sort((a, b) => (a.rank < b.rank ? -1 : 1)).map((i) => i.text),
      })),
      subItems: withChildren
        ? item.children.slice(0, 50).map((c) => ({ type: c.type, title: c.title }))
        : [],
    };
  }

  async create(spaceId: string, input: CreateTemplateRequest): Promise<Created> {
    await this.assertSpace(spaceId);
    const db = this.tenant.db;
    switch (input.kind) {
      case 'ITEM': {
        this.need(S.WORK_ITEM_WRITE);
        const payload = await this.itemPayload(spaceId, input.sourceId, true);
        return this.store(spaceId, 'ITEM', input.name, payload);
      }
      case 'LIST': {
        this.need(S.SPACE_SETTINGS);
        const list = await db.list.findFirst({
          where: { id: input.sourceId, spaceId, deletedAt: null },
          select: { id: true },
        });
        if (!list) throw notFound();
        const roots = await db.workItem.findMany({
          where: { listId: list.id, parentId: null, deletedAt: null },
          select: { id: true },
          orderBy: { rank: 'asc' },
          take: 100,
        });
        const items: ItemTemplatePayload[] = [];
        for (const root of roots) items.push(await this.itemPayload(spaceId, root.id, true));
        return this.store(spaceId, 'LIST', input.name, { items });
      }
      case 'SPRINT': {
        this.need(S.SPACE_SETTINGS);
        const sprint = await db.sprint.findFirst({ where: { id: input.sourceId, spaceId } });
        if (!sprint) throw notFound();
        const days =
          Math.round((sprint.endDate.getTime() - sprint.startDate.getTime()) / 86_400_000) + 1;
        return this.store(spaceId, 'SPRINT', input.name, {
          goal: sprint.goal,
          capacityNote: sprint.capacityNote,
          lengthDays: Math.min(60, Math.max(1, days)),
        });
      }
      case 'DOC': {
        this.need(S.SPACE_SETTINGS);
        const doc = await db.doc.findFirst({
          where: { id: input.sourceId, spaceId, deletedAt: null },
          select: { title: true, content: true },
        });
        if (!doc) throw notFound();
        return this.store(spaceId, 'DOC', input.name, { title: doc.title, content: doc.content });
      }
    }
  }

  async createSpaceTemplate(input: CreateSpaceTemplateRequest): Promise<Created> {
    const db = this.tenant.db;
    // Kaynak Space'i görebilmek ve ayarlarını yönetebilmek gerekir (özel Space sızmasın).
    const perms = await this.access.permissionsIn(input.sourceSpaceId);
    if (!perms) throw notFound();
    if (!perms.includes(S.SPACE_SETTINGS)) throw forbidden(ERROR_CODES.FORBIDDEN);
    const s = await db.space.findFirst({
      where: { id: input.sourceSpaceId, deletedAt: null },
      include: { statuses: { where: { archivedAt: null }, orderBy: { rank: 'asc' } } },
    });
    if (!s) throw notFound();
    const [fields, lists] = await Promise.all([
      db.customField.findMany({ where: { spaceId: s.id }, orderBy: { rank: 'asc' } }),
      db.list.findMany({
        where: { spaceId: s.id, deletedAt: null, archivedAt: null },
        orderBy: { rank: 'asc' },
        select: { name: true },
      }),
    ]);
    const payload = {
      scrumEnabled: s.scrumEnabled,
      sprintLengthWeeks: s.sprintLengthWeeks,
      sprintGoalRequired: s.sprintGoalRequired,
      dodItems: s.dodItems,
      dorItems: s.dorItems,
      dodEnforced: s.dodEnforced,
      estimationScale: s.estimationScale,
      color: null,
      statuses: s.statuses.map((x) => ({
        name: x.name,
        color: x.color,
        category: x.category,
        wipLimit: x.wipLimit,
      })),
      customFields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        options: (f.options as Array<{ label: string; color: string | null }>).map((o) => ({
          label: o.label,
          color: o.color ?? null,
        })),
      })),
      lists: lists.map((l) => l.name),
    };
    return this.store(null, 'SPACE', input.name, payload);
  }

  async remove(spaceId: string | null, templateId: string): Promise<void> {
    const db = this.tenant.db;
    const row = await db.template.findFirst({
      where: { id: templateId, spaceId },
      select: { id: true, kind: true, createdById: true },
    });
    if (!row) throw notFound();
    const mine = row.createdById === this.ctx.actorId;
    const allowed =
      spaceId === null
        ? true
        : mine && row.kind === 'ITEM'
          ? true
          : (this.cls.get('spacePermissions') ?? []).includes(S.SPACE_SETTINGS);
    if (!allowed) throw forbidden(ERROR_CODES.FORBIDDEN);
    await db.template.delete({ where: { id: templateId } });
  }

  // ---------- Uygulama ----------

  private async load<T extends z.ZodType>(
    spaceId: string | null,
    templateId: string,
    kind: TemplateKind,
    schema: T,
  ): Promise<{ name: string; payload: z.infer<T> }> {
    const row = await this.tenant.db.template.findFirst({
      where: { id: templateId, spaceId, kind },
    });
    if (!row) throw notFound();
    const parsed = schema.safeParse(row.payload);
    if (!parsed.success) throw fail(ERROR_CODES.TEMPLATE_INVALID, HttpStatus.CONFLICT);
    return { name: row.name, payload: parsed.data };
  }

  /** Şablondan iş öğesi; alt öğeler, açıklama, checklist ve özel alanlar da gelir. */
  private async createItem(
    spaceId: string,
    listId: string,
    payload: ItemTemplatePayload,
    overrides: { title?: string; parentId?: string | null },
  ): Promise<CreatedItem> {
    const db = this.tenant.db;
    const { workspaceId } = this.ctx;
    const [labels, fieldIds] = await Promise.all([
      db.label.findMany({ where: { spaceId }, select: { id: true, name: true } }),
      db.customField.findMany({ where: { spaceId }, select: { id: true } }),
    ]);
    const wanted = new Set(payload.labels.map(lower));
    const body = CreateWorkItemRequestSchema.parse({
      type: payload.type,
      title: overrides.title ?? payload.title,
      priority: payload.priority,
      parentId: overrides.parentId ?? null,
      labelIds: labels.filter((l) => wanted.has(lower(l.name))).map((l) => l.id),
      points: payload.points,
      estimateHours: payload.estimateHours,
    });
    const created = await this.items.create(listId, body);

    const known = new Set(fieldIds.map((f) => f.id));
    const custom = Object.fromEntries(
      Object.entries(payload.customFields).filter(([id]) => known.has(id)),
    );
    const customValues: Record<string, unknown> = await this.customFields
      .normalizePatch(spaceId, custom)
      .catch(() => ({}));
    const values = Object.fromEntries(Object.entries(customValues).filter(([, v]) => v !== null));

    await db.$transaction(async (tx) => {
      if (payload.description || Object.keys(values).length > 0) {
        await tx.workItem.update({
          where: { id: created.id },
          data: {
            ...(payload.description && {
              description: asJson(payload.description),
              descriptionText: richTextToPlain(payload.description),
            }),
            ...(Object.keys(values).length > 0 && { customFields: asJson(values) }),
          },
        });
      }
      const listRanks = ranksAfter(null, payload.checklists.length);
      for (const [index, checklist] of payload.checklists.entries()) {
        const row = await tx.checklist.create({
          data: {
            workspaceId,
            workItemId: created.id,
            kind: checklist.kind,
            title: checklist.title,
            rank: listRanks[index]!,
          },
        });
        const ranks = ranksAfter(null, checklist.items.length);
        if (checklist.items.length > 0) {
          await tx.checklistItem.createMany({
            data: checklist.items.map((text, i) => ({
              workspaceId,
              checklistId: row.id,
              text,
              rank: ranks[i]!,
            })),
          });
        }
      }
    });

    for (const sub of payload.subItems) {
      await this.items.create(
        listId,
        CreateWorkItemRequestSchema.parse({
          type: sub.type,
          title: sub.title,
          parentId: created.id,
        }),
      );
    }
    return created;
  }

  async apply(spaceId: string, templateId: string, input: ApplyTemplateRequest): Promise<Created> {
    const space = await this.assertSpace(spaceId);
    const kind = (
      await this.tenant.db.template.findFirst({
        where: { id: templateId, spaceId },
        select: { kind: true },
      })
    )?.kind;
    if (!kind) throw notFound();

    switch (kind) {
      case 'ITEM': {
        this.need(S.WORK_ITEM_WRITE);
        if (!input.listId) throw fail(ERROR_CODES.TEMPLATE_INVALID);
        await this.assertList(spaceId, input.listId);
        const { payload } = await this.load(spaceId, templateId, kind, ItemTemplatePayloadSchema);
        return this.createItem(spaceId, input.listId, payload, {
          title: input.title,
          parentId: input.parentId,
        });
      }
      case 'LIST': {
        this.need(S.LIST_MANAGE);
        this.need(S.WORK_ITEM_WRITE);
        const { name, payload } = await this.load(
          spaceId,
          templateId,
          kind,
          ListTemplatePayloadSchema,
        );
        const list = await this.structure.createList(
          spaceId,
          input.title ?? name,
          input.folderId ?? null,
        );
        for (const item of payload.items) await this.createItem(spaceId, list.id, item, {});
        return list;
      }
      case 'SPRINT': {
        this.need(S.SPRINT_PLAN);
        if (!space.scrumEnabled || !input.startDate) throw fail(ERROR_CODES.TEMPLATE_INVALID);
        const { name, payload } = await this.load(
          spaceId,
          templateId,
          kind,
          SprintTemplatePayloadSchema,
        );
        return this.sprints.create(spaceId, {
          name: input.title ?? name,
          goal: payload.goal,
          capacityNote: payload.capacityNote,
          startDate: input.startDate,
          endDate: addDays(input.startDate, payload.lengthDays - 1),
        });
      }
      case 'DOC': {
        this.need(S.DOC_WRITE);
        const { payload } = await this.load(spaceId, templateId, kind, DocTemplatePayloadSchema);
        return this.docs.create(spaceId, {
          title: input.title ?? payload.title,
          parentId: input.parentId ?? null,
          content: payload.content,
        });
      }
      default:
        throw fail(ERROR_CODES.TEMPLATE_INVALID);
    }
  }

  private async assertList(spaceId: string, listId: string): Promise<void> {
    const list = await this.tenant.db.list.findFirst({
      where: { id: listId, spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!list) throw notFound();
  }

  /** Space şablonundan yeni Space: önce normal oluşturma, sonra şablon içeriği uygulanır. */
  async createSpaceFromTemplate(raw: CreateSpaceFromTemplateRequest): Promise<Created> {
    const { templateId, ...rest } = CreateSpaceFromTemplateRequestSchema.parse(raw);
    const { payload } = await this.load(null, templateId, 'SPACE', SpaceTemplatePayloadSchema);
    const created = await this.spaces.create(
      CreateSpaceFromTemplateRequestSchema.omit({ templateId: true }).parse(rest),
    );
    const { workspaceId } = this.ctx;
    const spaceId = created.id;
    await this.tenant.db.$transaction(async (tx) => {
      await tx.space.update({
        where: { id: spaceId },
        data: {
          ...(payload.scrumEnabled === rest.scrumEnabled && {
            sprintLengthWeeks: payload.sprintLengthWeeks,
            sprintGoalRequired: payload.sprintGoalRequired,
            estimationScale: payload.estimationScale,
          }),
          dodItems: payload.dodItems,
          dorItems: payload.dorItems,
          dodEnforced: payload.dodEnforced,
        },
      });
      if (payload.statuses.length > 0) {
        await tx.status.deleteMany({ where: { spaceId } });
        const ranks = ranksAfter(null, payload.statuses.length);
        await tx.status.createMany({
          data: payload.statuses.map((s, i) => ({
            workspaceId,
            spaceId,
            name: s.name,
            color: s.color,
            category: s.category,
            wipLimit: s.wipLimit,
            rank: ranks[i]!,
          })),
        });
      }
      const fieldRanks = ranksAfter(null, payload.customFields.length);
      for (const [i, f] of payload.customFields.entries()) {
        await tx.customField.create({
          data: {
            workspaceId,
            spaceId,
            name: f.name,
            type: f.type,
            options: asJson(
              OPTION_FIELD_TYPES.includes(f.type)
                ? f.options.map((o) => ({ id: randomUUID(), label: o.label, color: o.color }))
                : [],
            ),
            rank: fieldRanks[i]!,
          },
        });
      }
      if (payload.lists.length > 0) {
        await tx.list.deleteMany({ where: { spaceId } });
        const ranks = ranksAfter(null, payload.lists.length);
        await tx.list.createMany({
          data: payload.lists.map((name, i) => ({
            workspaceId,
            spaceId,
            name,
            rank: ranks[i]!,
          })),
        });
      }
    });
    return created;
  }
}
