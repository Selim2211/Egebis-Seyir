import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ERROR_CODES,
  type ErrorCode,
  appliesToReadiness,
  isSprintOpen,
  readinessOf,
  sprintTotals,
  type SprintSummary,
} from '@scrum/shared';
import type { Sprint } from '../../generated/prisma/client';
import type { TenantClient } from '../../infra/prisma/tenant-prisma.service';
import { dateOnly } from '../work-items/item-support';
import { archivedParent, notFound } from '../spaces/space-errors';

/** 409: kural gereği şu an yapılamaz. */
export const conflict = (code: ErrorCode, details?: object) =>
  new HttpException(details ? { code, details } : { code }, HttpStatus.CONFLICT);

/** Bu Space'te sprint/backlog kullanılabilir mi? Silinmiş Space yok, arşivli Space salt-okunur. */
export async function loadScrumSpace(db: TenantClient, spaceId: string, write: boolean) {
  const space = await db.space.findFirst({
    where: { id: spaceId, deletedAt: null },
    select: { id: true, scrumEnabled: true, archivedAt: true },
  });
  if (!space) throw notFound();
  if (!space.scrumEnabled) throw conflict(ERROR_CODES.SCRUM_DISABLED);
  if (write && space.archivedAt) throw archivedParent();
  return space;
}

/** Tamamlanmış/iptal sprint salt-okunurdur (brief §6.1.8). */
export function assertOpen(sprint: Pick<Sprint, 'status'>): void {
  if (!isSprintOpen(sprint.status)) throw conflict(ERROR_CODES.SPRINT_READONLY);
}

/** Sprint'e bağlı, sayılacak öğeler: silinmemiş ve arşivlenmemiş üst düzey kayıtlar. */
export const countedItems = { deletedAt: null, archivedAt: null } as const;

/** Sprint satırları + öğe toplamları → SprintSummary[] (tek sorguyla). */
export async function summarize(db: TenantClient, sprints: Sprint[]): Promise<SprintSummary[]> {
  if (sprints.length === 0) return [];
  const items = await db.workItem.findMany({
    where: { sprintId: { in: sprints.map((s) => s.id) }, ...countedItems },
    select: {
      sprintId: true,
      type: true,
      points: true,
      dorChecked: true,
      status: { select: { category: true } },
    },
  });
  const spaces = await db.space.findMany({
    where: { id: { in: [...new Set(sprints.map((s) => s.spaceId))] } },
    select: { id: true, dorItems: true },
  });
  const dorBySpace = new Map(spaces.map((sp) => [sp.id, sp.dorItems]));
  return sprints.map((sprint) => {
    const mine = items.filter((i) => i.sprintId === sprint.id);
    const own = mine.map((i) => ({ type: i.type, points: i.points, category: i.status.category }));
    const dorItems = dorBySpace.get(sprint.spaceId) ?? [];
    const notReadyCount =
      dorItems.length === 0
        ? 0
        : mine.filter(
            (i) =>
              appliesToReadiness(i.type) &&
              i.status.category !== 'DONE' &&
              readinessOf(dorItems, i.dorChecked).missing.length > 0,
          ).length;
    return {
      id: sprint.id,
      spaceId: sprint.spaceId,
      name: sprint.name,
      goal: sprint.goal,
      startDate: dateOnly(sprint.startDate)!,
      endDate: dateOnly(sprint.endDate)!,
      capacityNote: sprint.capacityNote,
      status: sprint.status,
      startedAt: sprint.startedAt?.toISOString() ?? null,
      completedAt: sprint.completedAt?.toISOString() ?? null,
      cancelledAt: sprint.cancelledAt?.toISOString() ?? null,
      completedPoints: sprint.completedPoints,
      notReadyCount,
      ...sprintTotals(own),
    };
  });
}
