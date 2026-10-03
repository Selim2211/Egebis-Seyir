import { SPACE_PERMISSIONS as S, type SpaceDetail, type WorkItemSummary } from '@scrum/shared';
import { useMe } from '@/features/auth/queries';
import type { BoardStatus } from './board-model';

/** Kartı sürükleyebilir mi: yazma izni, ya da kendine atanmış öğede `workItem.status.own` (ADR-046). */
export function useCanMove(permissions: readonly string[], archived: boolean) {
  const { user } = useMe();
  const canWrite = permissions.includes(S.WORK_ITEM_WRITE);
  const own = permissions.includes(S.WORK_ITEM_STATUS_OWN);
  return (item: WorkItemSummary) =>
    !archived && (canWrite || (own && item.assignees.some((a) => a.id === user.id)));
}

export const toBoardStatuses = (space: SpaceDetail): BoardStatus[] =>
  space.statuses.map(({ id, name, color, category }) => ({ id, name, color, category }));
