import { HttpException, HttpStatus } from '@nestjs/common';
import {
  appliesToReadiness,
  type ErrorCode,
  formatItemKey,
  readinessOf,
  type WorkItemRow,
  type WorkItemSummary,
} from '@scrum/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { TenantClient } from '../../infra/prisma/tenant-prisma.service';

/** İş kuralı hatası: `{ code, details? }` (ADR-007). */
export const fail = (code: ErrorCode, status = HttpStatus.UNPROCESSABLE_ENTITY, details?: object) =>
  new HttpException(details ? { code, details } : { code }, status);

/** Liste satırı için gereken ilişkiler. */
export const summaryInclude = {
  assignees: { select: { user: { select: { id: true, name: true, avatarVersion: true } } } },
  labels: { select: { labelId: true } },
  _count: { select: { children: { where: { deletedAt: null, archivedAt: null } } } },
} satisfies Prisma.WorkItemInclude;

export type SummaryRow = Prisma.WorkItemGetPayload<{ include: typeof summaryInclude }>;

/** `@db.Date` → YYYY-MM-DD. */
export const dateOnly = (date: Date | null): string | null =>
  date?.toISOString().slice(0, 10) ?? null;

/** YYYY-MM-DD → UTC gece yarısı. */
export const toDate = (text: string | null | undefined): Date | null | undefined =>
  text == null ? text : new Date(`${text}T00:00:00.000Z`);

export function toSummary(row: SummaryRow): WorkItemSummary {
  return {
    id: row.id,
    key: formatItemKey(row.keyPrefix, row.number),
    type: row.type,
    title: row.title,
    listId: row.listId,
    parentId: row.parentId,
    sprintId: row.sprintId,
    statusId: row.statusId,
    priority: row.priority,
    assignees: row.assignees.map((a) => a.user),
    labelIds: row.labels.map((l) => l.labelId),
    points: row.points,
    estimateHours: row.estimateHours,
    startDate: dateOnly(row.startDate),
    dueDate: dateOnly(row.dueDate),
    completedAt: row.completedAt?.toISOString() ?? null,
    childCount: row._count.children,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Alanlar arasındaki farkı `{ alan: { from, to } }` olarak toplar (aktivite kaydı). */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, to] of Object.entries(after)) {
    if (to === undefined) continue;
    const from = before[field] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return changes;
}

export const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/** Tipe özel alan adları (Bug + Epic). */
export const TYPE_FIELDS = [
  'severity',
  'stepsToReproduce',
  'expectedResult',
  'actualResult',
  'environment',
  'foundInVersion',
  'goal',
  'tshirtSize',
  'color',
] as const;

/** Tenant kapsamlı transaction istemcisinde kullanılan modeller. */
export type TenantTx = Pick<
  TenantClient,
  | 'workItem'
  | 'status'
  | 'label'
  | 'workItemLabel'
  | 'workItemAssignee'
  | 'space'
  | 'activityEvent'
  | 'comment'
  | 'commentMention'
  | 'workItemWatcher'
  | 'attachment'
  | 'sprint'
  | 'sprintItemEvent'
>;

/** Birden çok List'ten gelen satırlar için ek ilişkiler (benim işlerim, arama). */
export const rowInclude = {
  ...summaryInclude,
  space: {
    select: { id: true, name: true, key: true, color: true, icon: true, dorItems: true },
  },
  list: { select: { id: true, name: true } },
  status: { select: { id: true, name: true, color: true, category: true } },
} satisfies Prisma.WorkItemInclude;

export type RowRow = Prisma.WorkItemGetPayload<{ include: typeof rowInclude }>;

export function toRow(row: RowRow): WorkItemRow {
  const { dorItems, ...space } = row.space;
  const ready =
    appliesToReadiness(row.type) && dorItems.length > 0
      ? readinessOf(dorItems, row.dorChecked)
      : null;
  return {
    ...toSummary(row),
    space,
    list: row.list,
    status: row.status,
    dor: ready ? { checked: ready.checked, total: ready.total } : null,
  };
}
