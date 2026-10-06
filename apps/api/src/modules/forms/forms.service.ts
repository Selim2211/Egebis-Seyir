import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CreateWorkItemRequestSchema,
  ERROR_CODES,
  MAX_FORMS_PER_SPACE,
  SPACE_PERMISSIONS as S,
  type CreateFormData,
  type Created,
  type CreatedItem,
  type Form,
  type FormField,
  type FormsResponse,
  type RichTextDoc,
  type SubmitFormData,
  type UpdateFormRequest,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';
import { WorkItemsService } from '../work-items/work-items.service';

const toRichText = (text: string): RichTextDoc => ({
  type: 'doc',
  content: text.split(/\r?\n/).map((line) =>
    line.trim() === ''
      ? { type: 'paragraph' }
      : {
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        },
  ),
});

type FormRow = Prisma.FormGetPayload<{ include: { list: { select: { name: true } } } }>;

const toForm = (row: FormRow): Form => ({
  id: row.id,
  name: row.name,
  description: row.description,
  listId: row.listId,
  listName: row.list.name,
  itemType: row.itemType as Form['itemType'],
  fields: row.fields as unknown as FormField[],
  enabled: row.enabled,
});

/**
 * Formlar (Faz 7.4, ADR-096): Space yöneticisi tanımlar; Space'i görebilen herkes (Stakeholder dahil)
 * doldurur ve form, hedef List'te görev açar. Gönderen görevin bildireni olur.
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly items: WorkItemsService,
    private readonly activity: ActivityService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private canManage(): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(S.SPACE_SETTINGS);
  }

  private async assertSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }

  private async assertList(spaceId: string, listId: string): Promise<void> {
    const list = await this.tenant.db.list.findFirst({
      where: { id: listId, spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!list) throw notFound();
  }

  /** Yöneticiler tüm formları, diğerleri yalnızca açık olanları görür. */
  async list(spaceId: string): Promise<FormsResponse> {
    await this.assertSpace(spaceId);
    const rows = await this.tenant.db.form.findMany({
      where: { spaceId, ...(this.canManage() ? {} : { enabled: true }) },
      include: { list: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { forms: rows.map(toForm) };
  }

  async create(spaceId: string, input: CreateFormData): Promise<Created> {
    await this.assertSpace(spaceId);
    await this.assertList(spaceId, input.listId);
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    if ((await db.form.count({ where: { spaceId } })) >= MAX_FORMS_PER_SPACE) {
      throw fail(ERROR_CODES.FORM_LIMIT, HttpStatus.CONFLICT);
    }
    const row = await db.form.create({
      data: {
        workspaceId,
        spaceId,
        listId: input.listId,
        name: input.name,
        description: input.description,
        itemType: input.itemType,
        fields: asJson(input.fields),
        enabled: input.enabled,
        createdById: actorId,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async update(spaceId: string, formId: string, input: UpdateFormRequest): Promise<void> {
    const db = this.tenant.db;
    const current = await db.form.findFirst({ where: { id: formId, spaceId } });
    if (!current) throw notFound();
    if (input.listId !== undefined) await this.assertList(spaceId, input.listId);
    await db.form.update({
      where: { id: formId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.listId !== undefined && { listId: input.listId }),
        ...(input.itemType !== undefined && { itemType: input.itemType }),
        ...(input.fields !== undefined && { fields: asJson(input.fields) }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
      },
    });
  }

  async remove(spaceId: string, formId: string): Promise<void> {
    const result = await this.tenant.db.form.deleteMany({ where: { id: formId, spaceId } });
    if (result.count === 0) throw notFound();
  }

  /** Formu doldurur: tanımlı alanlar doğrulanır, görev hedef List'te açılır. */
  async submit(spaceId: string, formId: string, input: SubmitFormData): Promise<CreatedItem> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const form = await db.form.findFirst({ where: { id: formId, spaceId } });
    if (!form) throw notFound();
    if (!form.enabled) throw fail(ERROR_CODES.FORM_DISABLED, HttpStatus.CONFLICT);

    const fields = form.fields as unknown as FormField[];
    const has = (key: FormField['key']) => fields.some((f) => f.key === key);
    const values = {
      description: has('description') ? input.description : null,
      priority: has('priority') ? input.priority : null,
      dueDate: has('dueDate') ? input.dueDate : null,
      assigneeId: has('assignee') ? input.assigneeId : null,
    };
    for (const field of fields) {
      const value = {
        description: values.description,
        priority: values.priority,
        dueDate: values.dueDate,
        assignee: values.assigneeId,
      }[field.key];
      if (field.required && (value === null || value === '')) {
        throw fail(ERROR_CODES.FORM_FIELD_REQUIRED, HttpStatus.UNPROCESSABLE_ENTITY, {
          field: field.key,
        });
      }
    }

    const created = await this.items.create(
      form.listId,
      CreateWorkItemRequestSchema.parse({
        type: form.itemType,
        title: input.title,
        ...(values.priority && { priority: values.priority }),
        dueDate: values.dueDate,
        assigneeIds: values.assigneeId ? [values.assigneeId] : [],
      }),
    );

    // Açıklama ve izlenebilirlik: Stakeholder'ın `work_item.write` yetkisi olmadığından doğrudan yazılır.
    await db.$transaction(async (tx) => {
      if (values.description) {
        await tx.workItem.update({
          where: { id: created.id },
          data: {
            description: asJson(toRichText(values.description)),
            descriptionText: values.description,
          },
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: created.id,
        action: 'item.form_submitted',
        changes: { name: form.name, key: created.key },
      });
    });
    return created;
  }
}
