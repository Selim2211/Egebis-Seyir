import { HttpException, HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type Automation,
  AutomationActionSchema,
  AutomationConditionsSchema,
  type AutomationRunsResponse,
  type AutomationsResponse,
  AutomationTriggerSchema,
  checkAutomationLoop,
  checkFieldValue,
  checkParent,
  type CreateAutomationData,
  CreateWorkItemRequestSchema,
  type Created,
  ERROR_CODES,
  MAX_AUTOMATIONS_PER_SPACE,
  matchesConditions,
  matchesTrigger,
  type UpdateAutomationRequest,
  type WorkItemType,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';
import type { AppClsStore } from '../../infra/cls/request-context';
import { AutomationEvents, type AutomationEventInput } from '../../infra/events/automation-events';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { notFound } from '../spaces/space-errors';
import { asJson, fail } from '../work-items/item-support';
import { WorkItemsService } from '../work-items/work-items.service';

type Action = z.infer<typeof AutomationActionSchema>;
type Outcome = 'OK' | 'SKIPPED' | 'FAILED';

const CHILD_TYPES: readonly WorkItemType[] = ['SUBTASK', 'TASK', 'STORY', 'BUG'];

/** Hata nesnesinden günlüğe yazılacak kısa metin (iş kuralı kodu varsa o). */
function describeError(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'code' in body) return String(body.code);
    return error.message;
  }
  return error instanceof Error ? error.message : 'ERROR';
}

/**
 * Otomasyon motoru (Faz 5.6, ADR-084): iş olayını dinler, eşleşen kuralların eylemlerini çalıştırır.
 * Döngü koruması: aynı kural zincirde tekrar çalışmaz, zincir en çok 3 basamak.
 */
@Injectable()
export class AutomationsService implements OnModuleInit {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly events: AutomationEvents,
    private readonly items: WorkItemsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.events.register(async (event) => {
      if ('itemId' in event && event.type !== 'COMMENT_CREATED') await this.handle(event);
    });
  }

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  // ---------- Yönetim ----------

  private async assertSpace(spaceId: string): Promise<void> {
    const space = await this.tenant.db.space.findFirst({
      where: { id: spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!space) throw notFound();
  }

  private toAutomation(row: {
    id: string;
    name: string;
    enabled: boolean;
    trigger: unknown;
    conditions: unknown;
    actions: unknown;
    createdAt: Date;
  }): Automation {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      trigger: row.trigger as Automation['trigger'],
      conditions: row.conditions as Automation['conditions'],
      actions: row.actions as Automation['actions'],
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(spaceId: string): Promise<AutomationsResponse> {
    await this.assertSpace(spaceId);
    const rows = await this.tenant.db.automation.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'asc' },
    });
    return { automations: rows.map((r) => this.toAutomation(r)) };
  }

  /** Kural içindeki kimlikler Space'e ait olmalı; özel alan değeri alan türüne uymalı. */
  private async validate(
    spaceId: string,
    rule: Pick<CreateAutomationData, 'trigger' | 'conditions' | 'actions'>,
  ): Promise<void> {
    const db = this.tenant.db;
    const invalid = () => fail(ERROR_CODES.AUTOMATION_INVALID);
    const statusIds = new Set<string>();
    if (rule.trigger.type === 'STATUS_CHANGED' && rule.trigger.toStatusId) {
      statusIds.add(rule.trigger.toStatusId);
    }
    const userIds = new Set<string>();
    const fieldActions: Array<Extract<Action, { type: 'SET_CUSTOM_FIELD' }>> = [];
    for (const action of rule.actions) {
      if (action.type === 'SET_STATUS') statusIds.add(action.statusId);
      if (action.type === 'ASSIGN') userIds.add(action.userId);
      if (action.type === 'NOTIFY') {
        if (action.to === 'USER') {
          if (!action.userId) throw invalid();
          userIds.add(action.userId);
        }
      }
      if (action.type === 'SET_CUSTOM_FIELD') fieldActions.push(action);
    }
    const labelIds = [...new Set(rule.conditions.labelIds ?? [])];
    const [statuses, members, labels, fields] = await Promise.all([
      statusIds.size
        ? db.status.count({ where: { id: { in: [...statusIds] }, spaceId, archivedAt: null } })
        : 0,
      userIds.size ? db.membership.count({ where: { userId: { in: [...userIds] } } }) : 0,
      labelIds.length ? db.label.count({ where: { id: { in: labelIds }, spaceId } }) : 0,
      fieldActions.length
        ? db.customField.findMany({
            where: { id: { in: fieldActions.map((a) => a.fieldId) }, spaceId },
          })
        : [],
    ]);
    if (statuses !== statusIds.size || members !== userIds.size || labels !== labelIds.length) {
      throw invalid();
    }
    for (const action of fieldActions) {
      const field = fields.find((f) => f.id === action.fieldId);
      if (!field) throw invalid();
      const check = checkFieldValue(
        { id: field.id, type: field.type, options: field.options as Array<{ id: string }> },
        action.value,
      );
      if (!check.ok) throw invalid();
    }
  }

  async create(spaceId: string, input: CreateAutomationData): Promise<Created> {
    await this.assertSpace(spaceId);
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    if ((await db.automation.count({ where: { spaceId } })) >= MAX_AUTOMATIONS_PER_SPACE) {
      throw fail(ERROR_CODES.AUTOMATION_LIMIT, HttpStatus.CONFLICT);
    }
    await this.validate(spaceId, input);
    const row = await db.automation.create({
      data: {
        workspaceId,
        spaceId,
        name: input.name,
        enabled: input.enabled,
        trigger: asJson(input.trigger),
        conditions: asJson(input.conditions),
        actions: asJson(input.actions),
        createdById: actorId,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async update(
    spaceId: string,
    automationId: string,
    input: UpdateAutomationRequest,
  ): Promise<void> {
    const db = this.tenant.db;
    const current = await db.automation.findFirst({ where: { id: automationId, spaceId } });
    if (!current) throw notFound();
    const next = {
      trigger: input.trigger ?? (current.trigger as CreateAutomationData['trigger']),
      conditions: input.conditions ?? (current.conditions as CreateAutomationData['conditions']),
      actions: input.actions ?? (current.actions as CreateAutomationData['actions']),
    };
    await this.validate(spaceId, next);
    await db.automation.update({
      where: { id: automationId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.trigger !== undefined && { trigger: asJson(input.trigger) }),
        ...(input.conditions !== undefined && { conditions: asJson(input.conditions) }),
        ...(input.actions !== undefined && { actions: asJson(input.actions) }),
      },
    });
  }

  async remove(spaceId: string, automationId: string): Promise<void> {
    const db = this.tenant.db;
    const row = await db.automation.findFirst({
      where: { id: automationId, spaceId },
      select: { id: true },
    });
    if (!row) throw notFound();
    await db.automation.delete({ where: { id: automationId } });
  }

  async runs(spaceId: string, automationId: string): Promise<AutomationRunsResponse> {
    const db = this.tenant.db;
    const row = await db.automation.findFirst({
      where: { id: automationId, spaceId },
      select: { id: true },
    });
    if (!row) throw notFound();
    const runs = await db.automationRun.findMany({
      where: { automationId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      runs: runs.map((r) => ({
        id: r.id,
        itemKey: r.itemKey,
        outcome: r.outcome,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ---------- Çalıştırma ----------

  private async log(
    automationId: string,
    itemKey: string,
    outcome: Outcome,
    message: string,
  ): Promise<void> {
    const db = this.tenant.db;
    await db.automationRun.create({
      data: {
        workspaceId: this.ctx.workspaceId,
        automationId,
        itemKey,
        outcome,
        message: message.slice(0, 300),
      },
    });
    // Her otomasyon için son 100 kayıt tutulur.
    const stale = await db.automationRun.findMany({
      where: { automationId },
      orderBy: { createdAt: 'desc' },
      skip: 100,
      select: { id: true },
    });
    if (stale.length > 0) {
      await db.automationRun.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  }

  async handle(event: AutomationEventInput): Promise<void> {
    const db = this.tenant.db;
    const chain = this.cls.get('automationChain') ?? [];
    const automations = await db.automation.findMany({
      where: { spaceId: event.spaceId, enabled: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const automation of automations) {
      const trigger = AutomationTriggerSchema.safeParse(automation.trigger);
      if (!trigger.success || !matchesTrigger(trigger.data, event)) continue;
      const conditions = AutomationConditionsSchema.safeParse(automation.conditions);
      const item = await db.workItem.findFirst({
        where: { id: event.itemId, deletedAt: null },
        include: { labels: { select: { labelId: true } }, assignees: { select: { userId: true } } },
      });
      if (!item || !conditions.success) continue;
      const matched = matchesConditions(conditions.data, {
        type: item.type,
        priority: item.priority,
        labelIds: item.labels.map((l) => l.labelId),
        assigneeCount: item.assignees.length,
      });
      if (!matched) continue;

      const key = `${item.keyPrefix}-${item.number}`;
      const loop = checkAutomationLoop(chain, automation.id);
      if (!loop.ok) {
        await this.log(automation.id, key, 'SKIPPED', `LOOP_${loop.reason}`);
        continue;
      }

      const actions = automation.actions as Action[];
      this.cls.set('automationChain', [...chain, automation.id]);
      try {
        for (const raw of actions) {
          const action = AutomationActionSchema.parse(raw);
          await this.perform(action, item.id);
        }
        await this.log(automation.id, key, 'OK', `${actions.length}`);
      } catch (error) {
        await this.log(automation.id, key, 'FAILED', describeError(error));
      } finally {
        this.cls.set('automationChain', chain);
      }
    }
  }

  private async perform(action: Action, itemId: string): Promise<void> {
    const db = this.tenant.db;
    const item = await db.workItem.findFirstOrThrow({
      where: { id: itemId, deletedAt: null },
      include: { assignees: { select: { userId: true } } },
    });
    switch (action.type) {
      case 'ASSIGN': {
        const ids = item.assignees.map((a) => a.userId);
        if (ids.includes(action.userId)) return;
        await this.items.update(itemId, { assigneeIds: [...ids, action.userId] });
        return;
      }
      case 'SET_PRIORITY':
        if (item.priority !== action.priority) {
          await this.items.update(itemId, { priority: action.priority });
        }
        return;
      case 'SET_STATUS':
        if (item.statusId !== action.statusId) {
          await this.items.update(itemId, { statusId: action.statusId });
        }
        return;
      case 'SET_CUSTOM_FIELD':
        await this.items.update(itemId, { customFields: { [action.fieldId]: action.value } });
        return;
      case 'CREATE_SUBTASK': {
        const type = CHILD_TYPES.find((t) => checkParent(t, item.type).ok);
        if (!type) throw fail(ERROR_CODES.AUTOMATION_INVALID);
        await this.items.create(
          item.listId,
          CreateWorkItemRequestSchema.parse({ type, title: action.title, parentId: item.id }),
        );
        return;
      }
      case 'NOTIFY': {
        const recipients =
          action.to === 'ASSIGNEES'
            ? item.assignees.map((a) => a.userId)
            : action.to === 'REPORTER'
              ? item.reporterId
                ? [item.reporterId]
                : []
              : action.userId
                ? [action.userId]
                : [];
        await this.notifications.dispatch({
          type: 'AUTOMATION',
          recipientIds: recipients,
          spaceId: item.spaceId,
          item: { id: item.id, key: `${item.keyPrefix}-${item.number}`, title: item.title },
          detail: action.message,
        });
        return;
      }
    }
  }
}
