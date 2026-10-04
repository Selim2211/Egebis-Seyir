import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import {
  checkEstimate,
  checkParent,
  checkTypeFields,
  appliesToReadiness,
  checkTypeInSpace,
  normalizeChecked,
  readinessOf,
  type ItemReadiness,
  ERROR_CODES,
  epicProgress,
  epicStats,
  isRichTextEmpty,
  richTextToPlain,
  formatItemKey,
  parseItemKey,
  rankBetween,
  relationFor,
  compareRank,
  rollupHours,
  SPACE_PERMISSIONS as S,
  nextCompletedAt,
  type CreatedItem,
  type CreateWorkItemData,
  type UpdateWorkItemRequest,
  type WorkItemDetail,
  type WorkItemsResponse,
  type WorkItemType,
} from '@scrum/shared';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client';
import type { AppClsStore } from '../../infra/cls/request-context';
import { TenantPrismaService } from '../../infra/prisma/tenant-prisma.service';
import { SpaceAccessService } from '../access/space-access.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toAttachmentDto } from '../collab/attachments.service';
import { archivedParent, forbidden, notFound } from '../spaces/space-errors';
import {
  asJson,
  dateOnly,
  diff,
  fail,
  summaryInclude,
  toDate,
  toSummary,
  TYPE_FIELDS,
} from './item-support';

const LIST_LIMIT = 5000;

/** İş öğesi oluşturma, okuma ve güncelleme (Faz 1.3, ADR-044..046). */
@Injectable()
export class WorkItemsService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly access: SpaceAccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private get ctx() {
    return { workspaceId: this.cls.get('workspaceId')!, actorId: this.cls.get('userId')! };
  }

  private can(permission: string): boolean {
    return (this.cls.get('spacePermissions') ?? []).includes(permission);
  }

  // ---------- Okuma ----------

  async list(listId: string): Promise<WorkItemsResponse> {
    const db = this.tenant.db;
    const list = await db.list.findFirst({
      where: { id: listId, deletedAt: null, space: { deletedAt: null } },
      select: { spaceId: true },
    });
    if (!list) throw notFound();
    const [items, labels] = await Promise.all([
      db.workItem.findMany({
        where: { listId, deletedAt: null, archivedAt: null },
        include: summaryInclude,
        orderBy: { rank: 'asc' },
        take: LIST_LIMIT,
      }),
      db.label.findMany({ where: { spaceId: list.spaceId }, orderBy: { name: 'asc' } }),
    ]);
    return {
      items: items.map(toSummary),
      labels: labels.map(({ id, name, color }) => ({ id, name, color })),
    };
  }

  async detail(itemId: string): Promise<WorkItemDetail> {
    const item = await this.tenant.db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      select: { id: true },
    });
    if (!item) throw notFound();
    return this.buildDetail(itemId);
  }

  /** `MOB-142` → öğe; Space'ten bağımsız, workspace içinde çözülür (ADR-033). */
  async detailByKey(key: string): Promise<WorkItemDetail> {
    const parsed = parseItemKey(key);
    if (!parsed) throw fail(ERROR_CODES.WORK_ITEM_KEY_INVALID, 400);
    const item = await this.tenant.db.workItem.findFirst({
      where: {
        keyPrefix: parsed.prefix,
        number: parsed.number,
        deletedAt: null,
        list: { deletedAt: null },
        space: { deletedAt: null },
      },
      select: { id: true, spaceId: true },
    });
    // Görünmeyen Space'teki öğe yokmuş gibi davranır.
    if (!item || !(await this.access.permissionsIn(item.spaceId))) throw notFound();
    return this.buildDetail(item.id);
  }

  private async buildDetail(itemId: string): Promise<WorkItemDetail> {
    const db = this.tenant.db;
    const row = await db.workItem.findFirstOrThrow({
      where: { id: itemId },
      include: {
        ...summaryInclude,
        reporter: { select: { id: true, name: true, avatarVersion: true } },
        space: { select: { id: true, dodItems: true, dorItems: true, dodEnforced: true } },
        labels: {
          select: { labelId: true, label: { select: { id: true, name: true, color: true } } },
        },
      },
    });
    const children = await db.workItem.findMany({
      where: { parentId: itemId, deletedAt: null, archivedAt: null },
      include: { ...summaryInclude, status: { select: { category: true } } },
      orderBy: { rank: 'asc' },
    });

    const ancestors: WorkItemDetail['ancestors'] = [];
    for (let parentId = row.parentId; parentId && ancestors.length < 6;) {
      const parent = await db.workItem.findFirst({ where: { id: parentId } });
      if (!parent) break;
      ancestors.unshift({
        id: parent.id,
        key: formatItemKey(parent.keyPrefix, parent.number),
        type: parent.type,
        title: parent.title,
      });
      parentId = parent.parentId;
    }

    const [checklists, links, watchers, attachments, commentCount] = await Promise.all([
      db.checklist.findMany({
        where: { workItemId: itemId },
        include: { items: { orderBy: { rank: 'asc' } } },
      }),
      this.visibleLinks(itemId),
      db.workItemWatcher.findMany({ where: { workItemId: itemId }, select: { userId: true } }),
      db.attachment.findMany({
        where: { workItemId: itemId },
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.comment.count({ where: { workItemId: itemId, deletedAt: null } }),
    ]);
    // Kabul kriterleri önce, sonra adlı checklist'ler kendi sırasıyla.
    checklists.sort(
      (a, b) =>
        Number(b.kind === 'ACCEPTANCE') - Number(a.kind === 'ACCEPTANCE') || compareRank(a, b),
    );

    const applies = appliesToReadiness(row.type);
    const entries = (items: string[], checked: string[]) =>
      applies ? items.map((text) => ({ text, checked: checked.includes(text) })) : [];
    const readiness: ItemReadiness = {
      dor: entries(row.space.dorItems, row.dorChecked),
      dod: entries(row.space.dodItems, row.dodChecked),
      dodEnforced: row.space.dodEnforced,
    };

    // Bu öğeye bağlı doküman sayfaları (görülebilir Space'lerde, ADR-070).
    const docRows = await db.docItemLink.findMany({
      where: { workItemId: itemId, doc: { deletedAt: null } },
      include: { doc: { select: { id: true, title: true, spaceId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const docSpaces = await this.access.permissionMap({
      id: { in: [...new Set(docRows.map((r) => r.doc.spaceId))] },
      deletedAt: null,
    });

    return {
      ...toSummary(row),
      readiness,
      spaceId: row.spaceId,
      reporter: row.reporter,
      description: (row.description as WorkItemDetail['description']) ?? null,
      checklists: checklists.map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title,
        items: c.items.map(({ id, text, done }) => ({ id, text, done })),
      })),
      links,
      watching: watchers.some((w) => w.userId === this.ctx.actorId),
      watcherCount: watchers.length,
      attachments: attachments.map(toAttachmentDto),
      commentCount,
      ancestors,
      children: children.map(toSummary),
      labels: row.labels.map((l) => l.label),
      progress:
        row.type === 'EPIC'
          ? epicProgress(
              children.map((c) => ({
                points: c.points,
                category: c.status.category,
              })),
            )
          : null,
      docs: docRows.filter((r) => docSpaces.has(r.doc.spaceId)).map((r) => r.doc),
      epicStats:
        row.type === 'EPIC'
          ? epicStats(children.map((c) => ({ points: c.points, category: c.status.category })))
          : null,
      rolledUpHours: rollupHours(children),
      archived: row.archivedAt !== null,
      severity: row.severity,
      stepsToReproduce: row.stepsToReproduce,
      expectedResult: row.expectedResult,
      actualResult: row.actualResult,
      environment: row.environment,
      foundInVersion: row.foundInVersion,
      goal: row.goal,
      tshirtSize: row.tshirtSize,
      color: row.color,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Öğenin bağlantıları; karşı öğenin Space'ini göremeyen için gizlenir (ADR-050). */
  private async visibleLinks(itemId: string): Promise<WorkItemDetail['links']> {
    const db = this.tenant.db;
    const rows = await db.workItemLink.findMany({
      where: { OR: [{ fromId: itemId }, { toId: itemId }] },
      include: {
        from: { include: { status: { select: { category: true } } } },
        to: { include: { status: { select: { category: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const spaces = [...new Set(rows.flatMap((r) => [r.from.spaceId, r.to.spaceId]))];
    const visible = await this.access.permissionMap({ id: { in: spaces }, deletedAt: null });
    return rows.flatMap((r) => {
      const itemIsFrom = r.fromId === itemId;
      const other = itemIsFrom ? r.to : r.from;
      if (other.deletedAt || !visible.has(other.spaceId)) return [];
      return {
        id: r.id,
        relation: relationFor(r.type, itemIsFrom),
        item: {
          id: other.id,
          key: formatItemKey(other.keyPrefix, other.number),
          type: other.type,
          title: other.title,
          category: other.status.category,
        },
      };
    });
  }

  // ---------- Oluşturma ----------

  async create(listId: string, input: CreateWorkItemData): Promise<CreatedItem> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;

    const list = await db.list.findFirst({
      where: { id: listId, deletedAt: null, space: { deletedAt: null } },
      include: {
        space: {
          select: {
            id: true,
            key: true,
            scrumEnabled: true,
            estimationScale: true,
            archivedAt: true,
          },
        },
        folder: { select: { archivedAt: true } },
      },
    });
    if (!list) throw notFound();
    if (list.archivedAt || list.space.archivedAt || list.folder?.archivedAt) throw archivedParent();
    const space = list.space;

    this.validateShape(input.type, space, input);
    if ((input.points != null || input.estimateHours != null) && !this.can(S.ESTIMATE_WRITE)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    await this.validateParent(input.type, input.parentId, space.id);
    const statusId = await this.resolveStatus(space.id, input.statusId);
    await this.validateRefs(space.id, input.assigneeIds, input.labelIds);

    const last = await db.workItem.findFirst({
      where: { listId, deletedAt: null },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });

    const created = await db.$transaction(async (tx) => {
      const counter = await tx.space.update({
        where: { id: space.id },
        data: { itemCounter: { increment: 1 } },
        select: { itemCounter: true, key: true },
      });
      const status = await tx.status.findFirstOrThrow({ where: { id: statusId } });
      const item = await tx.workItem.create({
        data: {
          workspaceId,
          spaceId: space.id,
          listId,
          parentId: input.parentId,
          type: input.type,
          keyPrefix: counter.key,
          number: counter.itemCounter,
          title: input.title,
          statusId,
          priority: input.priority,
          reporterId: actorId,
          startDate: toDate(input.startDate),
          dueDate: toDate(input.dueDate),
          points: input.points,
          estimateHours: input.estimateHours,
          completedAt: status.category === 'DONE' ? new Date() : null,
          rank: rankBetween(last?.rank ?? null, null),
          severity: input.severity,
          stepsToReproduce: input.stepsToReproduce,
          expectedResult: input.expectedResult,
          actualResult: input.actualResult,
          environment: input.environment,
          foundInVersion: input.foundInVersion,
          goal: input.goal,
          tshirtSize: input.tshirtSize,
          color: input.color,
          assignees: {
            create: input.assigneeIds.map((userId) => ({ workspaceId, userId })),
          },
          labels: { create: input.labelIds.map((labelId) => ({ workspaceId, labelId })) },
          watchers: {
            create: [...new Set([actorId, ...input.assigneeIds])].map((userId) => ({
              workspaceId,
              userId,
            })),
          },
        },
      });
      const key = formatItemKey(item.keyPrefix, item.number);
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: item.id,
        action: 'item.created',
        changes: { key, type: input.type, title: input.title, listId },
      });
      return { id: item.id, key };
    });
    // Atananlara bildirim; işlemden sonra, hata asıl işlemi bozmaz (ADR-066).
    if (input.assigneeIds.length > 0) {
      await this.notifications.dispatch({
        type: 'ASSIGNED',
        recipientIds: input.assigneeIds,
        spaceId: space.id,
        item: { id: created.id, key: created.key, title: input.title },
      });
    }
    return created;
  }

  // ---------- Güncelleme ----------

  async update(itemId: string, input: UpdateWorkItemRequest): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const { force, ...fields } = input;
    const db = this.tenant.db;

    const item = await db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      include: {
        status: { select: { category: true } },
        assignees: { select: { userId: true } },
        labels: { select: { labelId: true } },
        space: {
          select: {
            scrumEnabled: true,
            estimationScale: true,
            dodItems: true,
            dodEnforced: true,
          },
        },
      },
    });
    if (!item) throw notFound();
    const type = item.type;

    this.authorize(item, fields);
    const typeFieldInput = Object.fromEntries(TYPE_FIELDS.map((name) => [name, fields[name]]));
    const shape = checkTypeFields(type, typeFieldInput);
    if (!shape.ok) throw fail(shape.code);
    const estimate = checkEstimate(type, item.space.estimationScale, {
      points: fields.points,
      estimateHours: fields.estimateHours,
    });
    if (!estimate.ok) throw fail(estimate.code);
    this.validateDates(fields.startDate, fields.dueDate, item.startDate, item.dueDate);

    // Açıklama (ADR-048): boş belge null olarak saklanır; düz metin aramada kullanılır.
    const description =
      fields.description === undefined
        ? undefined
        : fields.description === null || isRichTextEmpty(fields.description)
          ? null
          : fields.description;

    if (fields.parentId !== undefined)
      await this.validateParent(type, fields.parentId, item.spaceId);
    if (fields.assigneeIds || fields.labelIds) {
      await this.validateRefs(item.spaceId, fields.assigneeIds ?? [], fields.labelIds ?? []);
    }

    let completedAt: Date | null | undefined;
    let nextStatusName: string | undefined;
    if (fields.statusId !== undefined && fields.statusId !== item.statusId) {
      const next = await db.status.findFirst({
        where: { id: fields.statusId, spaceId: item.spaceId, archivedAt: null },
      });
      if (!next) throw notFound();
      const from = item.status.category;
      const to = next.category;
      if (to === 'DONE' && from !== 'DONE') this.assertDefinitionOfDone(item, force === true);
      if (to === 'DONE' && from !== 'DONE' && !force) await this.assertNoOpenChildren(item.id);
      if (to === 'ACTIVE' && from === 'NOT_STARTED' && !force) await this.assertNotBlocked(item.id);
      completedAt = nextCompletedAt(from, to, item.completedAt, new Date());
      nextStatusName = next.name;
    }

    const scalars = {
      title: fields.title,
      priority: fields.priority,
      parentId: fields.parentId,
      statusId: fields.statusId,
      points: fields.points,
      estimateHours: fields.estimateHours,
      ...typeFieldInput,
    };
    const changes = diff(
      { ...item, startDate: dateOnly(item.startDate), dueDate: dateOnly(item.dueDate) },
      {
        ...scalars,
        startDate: fields.startDate,
        dueDate: fields.dueDate,
        completedAt: completedAt === undefined ? undefined : (completedAt?.toISOString() ?? null),
      },
    );
    const assignees = this.setDiff(
      item.assignees.map((a) => a.userId),
      fields.assigneeIds,
    );
    const labels = this.setDiff(
      item.labels.map((l) => l.labelId),
      fields.labelIds,
    );
    if (
      description !== undefined &&
      JSON.stringify(description) !== JSON.stringify(item.description)
    ) {
      changes.description = {
        from: item.description ? 'edited' : null,
        to: description ? 'edited' : null,
      };
    }
    if (assignees) changes.assigneeIds = assignees;
    if (labels) changes.labelIds = labels;
    if (Object.keys(changes).length === 0) return;

    await db.$transaction(async (tx) => {
      const data: Prisma.WorkItemUncheckedUpdateInput = {
        ...Object.fromEntries(Object.entries(scalars).filter(([, v]) => v !== undefined)),
        ...(fields.startDate !== undefined && { startDate: toDate(fields.startDate) }),
        ...(fields.dueDate !== undefined && { dueDate: toDate(fields.dueDate) }),
        ...(completedAt !== undefined && { completedAt }),
        ...(description !== undefined && {
          description: description === null ? Prisma.JsonNull : asJson(description),
          descriptionText: description === null ? null : richTextToPlain(description),
        }),
      };
      if (Object.keys(data).length > 0) await tx.workItem.update({ where: { id: itemId }, data });
      if (assignees) {
        await tx.workItemAssignee.deleteMany({ where: { workItemId: itemId } });
        await tx.workItemAssignee.createMany({
          data: fields.assigneeIds!.map((userId) => ({ workItemId: itemId, workspaceId, userId })),
        });
        // Yeni atananlar otomatik izleyici olur (ADR-051).
        await tx.workItemWatcher.createMany({
          data: fields.assigneeIds!.map((userId) => ({ workItemId: itemId, workspaceId, userId })),
          skipDuplicates: true,
        });
      }
      if (labels) {
        await tx.workItemLabel.deleteMany({ where: { workItemId: itemId } });
        await tx.workItemLabel.createMany({
          data: fields.labelIds!.map((labelId) => ({ workItemId: itemId, workspaceId, labelId })),
        });
      }
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.updated',
        changes: asJson(changes),
      });
    });

    await this.notifyUpdate(item, fields, { assignees, statusName: nextStatusName });
  }

  /**
   * Güncelleme bildirimleri (ADR-066): yeni atananlara ASSIGNED; durum değiştiyse atananlara,
   * bildirene ve izleyicilere STATUS_CHANGED.
   */
  private async notifyUpdate(
    item: {
      id: string;
      spaceId: string;
      keyPrefix: string;
      number: number;
      title: string;
      reporterId: string | null;
      assignees: Array<{ userId: string }>;
    },
    fields: { title?: string; assigneeIds?: string[] },
    change: { assignees: { from: string[]; to: string[] } | null; statusName: string | undefined },
  ): Promise<void> {
    const ref = {
      id: item.id,
      key: formatItemKey(item.keyPrefix, item.number),
      title: fields.title ?? item.title,
    };
    if (change.assignees) {
      const before = new Set(change.assignees.from);
      const added = change.assignees.to.filter((id) => !before.has(id));
      if (added.length > 0) {
        await this.notifications.dispatch({
          type: 'ASSIGNED',
          recipientIds: added,
          spaceId: item.spaceId,
          item: ref,
        });
      }
    }
    if (change.statusName) {
      const watchers = await this.tenant.db.workItemWatcher.findMany({
        where: { workItemId: item.id },
        select: { userId: true },
      });
      await this.notifications.dispatch({
        type: 'STATUS_CHANGED',
        recipientIds: [
          ...(fields.assigneeIds ?? item.assignees.map((a) => a.userId)),
          ...(item.reporterId ? [item.reporterId] : []),
          ...watchers.map((w) => w.userId),
        ],
        spaceId: item.spaceId,
        item: ref,
        detail: change.statusName,
      });
    }
  }

  // ---------- Yardımcılar (move/copy/bulk de kullanır) ----------

  /** Alan bazlı yetki: yapı alanları `workItem.write`, tahmin `estimate.write`, durum "kendi" kuralı. */
  private authorize(
    item: { reporterId: string | null; assignees: Array<{ userId: string }> },
    fields: Record<string, unknown>,
  ): void {
    const actorId = this.ctx.actorId;
    const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
    const estimateKeys = ['points', 'estimateHours'];
    const others = keys.filter((k) => k !== 'statusId' && !estimateKeys.includes(k));
    if (others.length > 0 && !this.can(S.WORK_ITEM_WRITE)) throw forbidden(ERROR_CODES.FORBIDDEN);
    if (keys.some((k) => estimateKeys.includes(k)) && !this.can(S.ESTIMATE_WRITE)) {
      throw forbidden(ERROR_CODES.FORBIDDEN);
    }
    if (keys.includes('statusId') && !this.can(S.WORK_ITEM_WRITE)) {
      const mine = item.reporterId === actorId || item.assignees.some((a) => a.userId === actorId);
      if (!(this.can(S.WORK_ITEM_STATUS_OWN) && mine)) throw forbidden(ERROR_CODES.FORBIDDEN);
    }
  }

  /** Tip, Space modu, tipe özel alanlar ve tahmin birlikte doğrulanır. */
  private validateShape(
    type: WorkItemType,
    space: { scrumEnabled: boolean; estimationScale: 'FIBONACCI' | 'TSHIRT' | 'NUMBER' },
    input: CreateWorkItemData,
  ): void {
    const inSpace = checkTypeInSpace(type, space.scrumEnabled);
    if (!inSpace.ok) throw fail(inSpace.code);
    const fields = checkTypeFields(type, input);
    if (!fields.ok) throw fail(fields.code);
    const estimate = checkEstimate(type, space.estimationScale, input);
    if (!estimate.ok) throw fail(estimate.code);
    this.validateDates(input.startDate, input.dueDate, null, null);
  }

  private validateDates(
    start: string | null | undefined,
    due: string | null | undefined,
    currentStart: Date | null,
    currentDue: Date | null,
  ): void {
    const s = start === undefined ? dateOnly(currentStart) : start;
    const d = due === undefined ? dateOnly(currentDue) : due;
    if (s && d && s > d) throw new BadRequestException({ code: ERROR_CODES.VALIDATION_FAILED });
  }

  /** Üst öğe aynı Space'te olmalı ve tip kuralına uymalı (brief §6.2.1). */
  async validateParent(
    type: WorkItemType,
    parentId: string | null,
    spaceId: string,
  ): Promise<void> {
    let parentType: WorkItemType | null = null;
    if (parentId) {
      const parent = await this.tenant.db.workItem.findFirst({
        where: { id: parentId, deletedAt: null },
        select: { type: true, spaceId: true },
      });
      if (!parent) throw notFound();
      if (parent.spaceId !== spaceId) throw fail(ERROR_CODES.WORK_ITEM_PARENT_SPACE);
      parentType = parent.type;
    }
    const check = checkParent(type, parentType);
    if (!check.ok) throw fail(check.code);
  }

  /** İstenen durum Space'e ait olmalı; verilmediyse akışın ilk durumu. */
  async resolveStatus(spaceId: string, statusId: string | undefined): Promise<string> {
    const status = await this.tenant.db.status.findFirst({
      where: statusId ? { id: statusId, spaceId, archivedAt: null } : { spaceId, archivedAt: null },
      orderBy: { rank: 'asc' },
      select: { id: true },
    });
    if (!status) throw notFound();
    return status.id;
  }

  /** Atananlar workspace üyesi, etiketler Space'e ait olmalı. */
  async validateRefs(spaceId: string, assigneeIds: string[], labelIds: string[]): Promise<void> {
    const db = this.tenant.db;
    const users = [...new Set(assigneeIds)];
    const labels = [...new Set(labelIds)];
    const [members, found] = await Promise.all([
      users.length ? db.membership.count({ where: { userId: { in: users } } }) : 0,
      labels.length ? db.label.count({ where: { id: { in: labels }, spaceId } }) : 0,
    ]);
    if (members !== users.length || found !== labels.length) throw notFound();
  }

  /** Engelleyeni bitmemiş öğe başlatılırken uyarı (ADR-050): `details.keys` engelleyenlerdir. */
  async assertNotBlocked(itemId: string): Promise<void> {
    const blockers = await this.tenant.db.workItemLink.findMany({
      where: {
        toId: itemId,
        type: 'BLOCKS',
        from: { deletedAt: null, status: { category: { not: 'DONE' } } },
      },
      include: { from: { select: { keyPrefix: true, number: true } } },
    });
    if (blockers.length > 0) {
      throw fail(ERROR_CODES.WORK_ITEM_BLOCKED, HttpStatus.CONFLICT, {
        keys: blockers.map((b) => formatItemKey(b.from.keyPrefix, b.from.number)),
      });
    }
  }

  /**
   * Done'a çekilirken eksik DoD maddesi varsa: Space ayarı açıksa engel, kapalıysa `force` ile
   * geçilebilen uyarı (brief §6.3, ADR-065). Yalnızca Story/Bug için geçerli.
   */
  private assertDefinitionOfDone(
    item: {
      type: WorkItemType;
      dodChecked: string[];
      space: { dodItems: string[]; dodEnforced: boolean };
    },
    force: boolean,
  ): void {
    if (!appliesToReadiness(item.type) || item.space.dodItems.length === 0) return;
    const { missing } = readinessOf(item.space.dodItems, item.dodChecked);
    if (missing.length === 0) return;
    if (item.space.dodEnforced) {
      throw fail(ERROR_CODES.DOD_ENFORCED, HttpStatus.CONFLICT, { count: missing.length });
    }
    if (!force)
      throw fail(ERROR_CODES.DOD_INCOMPLETE, HttpStatus.CONFLICT, { count: missing.length });
  }

  /** DoD/DoR işaretlerini yazar (ADR-065): yalnızca Space maddeleri geçerli, kalan atılır. */
  async setReadiness(itemId: string, kind: 'dor' | 'dod', checked: string[]): Promise<void> {
    const { workspaceId, actorId } = this.ctx;
    const db = this.tenant.db;
    const item = await db.workItem.findFirst({
      where: { id: itemId, deletedAt: null, list: { deletedAt: null }, space: { deletedAt: null } },
      include: { space: { select: { dodItems: true, dorItems: true } } },
    });
    if (!item) throw notFound();
    if (!appliesToReadiness(item.type)) throw fail(ERROR_CODES.READINESS_NOT_APPLICABLE);

    const items = kind === 'dod' ? item.space.dodItems : item.space.dorItems;
    const current = kind === 'dod' ? item.dodChecked : item.dorChecked;
    const next = normalizeChecked(items, checked);
    const before = readinessOf(items, current).checked;
    if (JSON.stringify(normalizeChecked(items, current)) === JSON.stringify(next)) return;

    await db.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: itemId },
        data: kind === 'dod' ? { dodChecked: next } : { dorChecked: next },
      });
      await this.activity.record(tx, {
        workspaceId,
        actorId,
        entityType: 'item',
        entityId: itemId,
        action: 'item.updated',
        changes: asJson({
          [kind === 'dod' ? 'dodChecked' : 'dorChecked']: { from: before, to: next.length },
        }),
      });
    });
  }

  /** Done'a çekilirken açık alt öğe varsa uyarı (ADR-046). */
  async assertNoOpenChildren(itemId: string): Promise<void> {
    const count = await this.tenant.db.workItem.count({
      where: {
        parentId: itemId,
        deletedAt: null,
        archivedAt: null,
        status: { category: { not: 'DONE' } },
      },
    });
    if (count > 0) throw fail(ERROR_CODES.WORK_ITEM_OPEN_CHILDREN, HttpStatus.CONFLICT, { count });
  }

  private setDiff(
    current: string[],
    next: string[] | undefined,
  ): { from: string[]; to: string[] } | null {
    if (!next) return null;
    const a = [...current].sort();
    const b = [...new Set(next)].sort();
    return JSON.stringify(a) === JSON.stringify(b) ? null : { from: a, to: b };
  }
}
