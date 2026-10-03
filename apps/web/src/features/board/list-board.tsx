import type { SpaceDetail, WorkItemsResponse } from '@scrum/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatusGuard } from '@/features/work-items/status-guard';
import { useUpdateItem } from '@/features/work-items/queries';
import { BoardView } from './board-view';
import { toBoardStatuses, useCanMove } from './board-hooks';
import { SwimlanePicker } from './swimlane-picker';
import type { Swimlane } from './board-model';

/** List sayfasının Board görünümü: listedeki tüm öğeler, Space durumlarıyla sütunlanır. */
export function ListBoard({
  listId,
  space,
  data,
  archived,
  lane,
  onLane,
}: {
  listId: string;
  space: SpaceDetail;
  data: WorkItemsResponse;
  archived: boolean;
  lane: Swimlane;
  onLane: (lane: Swimlane) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateItem(listId);
  const canMove = useCanMove(space.permissions, archived);
  const guard = useStatusGuard(
    (itemId, statusId, force, handlers) =>
      update.mutate({ itemId, body: { statusId, ...(force && { force }) } }, handlers),
    update.isPending,
  );
  const statuses = useMemo(() => toBoardStatuses(space), [space]);
  const epicTitles = useMemo(
    () => new Map(data.items.filter((i) => i.type === 'EPIC').map((i) => [i.id, i.title])),
    [data.items],
  );

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <SwimlanePicker value={lane} onChange={onLane} />
        <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
          {t('board.hint')}
        </span>
      </div>
      <BoardView
        items={data.items}
        statuses={statuses}
        swimlane={lane}
        epicTitles={epicTitles}
        canMove={canMove}
        onStatus={guard.change}
      />
      {guard.dialog}
    </>
  );
}
