import { useQuery } from '@tanstack/react-query';
import { SPACE_PERMISSIONS as S, type TreeSpace, type WorkItemType } from '@scrum/shared';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHierarchy } from '@/features/spaces/queries';
import { sprintsQuery, useMoveToSprint } from '@/features/sprints/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { useMoveItem } from './queries';

/** Sprint seçiminde "değiştirme" (aynı Proje'de mevcut sprint kalır, başka Proje'de Backlog'a düşer). */
const KEEP = '__keep';
/** Sprint'siz (Backlog). */
const BACKLOG = '__backlog';

export interface MovableItem {
  id: string;
  key: string;
  type: WorkItemType;
  spaceId: string;
  /** Epic ise altındaki (sprint'e girebilen) Task/Bug kimlikleri: Epic ile birlikte taşınırlar. */
  childTaskIds: string[];
}

/** Bir Proje'nin yeni öğe alabilen ilk List'i (klasörsüz listeler önce). */
const firstListId = (space: TreeSpace) =>
  space.lists[0]?.id ?? space.folders.flatMap((f) => f.lists)[0]?.id;

/**
 * Öğeyi başka Proje'ye ve/veya Sprint'e taşıma (ADR-124). Varsayılan hedef kendi Proje'dir. Epic taşınırsa
 * altındaki Task'lar ve onların Sub-Task'ları birlikte gelir; sprint seçimi Epic'in Task'ları için geçerlidir.
 */
export function MoveItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: MovableItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close')}>
        {open && <MoveForm item={item} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({ item, onDone }: { item: MovableItem; onDone: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const hierarchy = useHierarchy();
  const moveItem = useMoveItem();
  const moveToSprint = useMoveToSprint();
  const [error, setError] = useState<unknown>(null);
  const [spaceId, setSpaceId] = useState(item.spaceId);
  const [sprint, setSprint] = useState(KEEP);

  const spaces = (hierarchy.data?.spaces ?? []).filter(
    (s) => s.permissions.includes(S.WORK_ITEM_WRITE) && firstListId(s),
  );
  const target = spaces.find((s) => s.id === spaceId);
  const canPlan = Boolean(target?.scrumEnabled && target.permissions.includes(S.SPRINT_PLAN));
  const sprints = useQuery({ ...sprintsQuery(workspaceId, spaceId), enabled: canPlan });
  const open = (sprints.data?.sprints ?? []).filter(
    (s) => s.status === 'PLANNED' || s.status === 'ACTIVE',
  );
  const isEpic = item.type === 'EPIC';
  const crossSpace = spaceId !== item.spaceId;
  const sprintIds = isEpic ? item.childTaskIds : [item.id];
  const pending = moveItem.isPending || moveToSprint.isPending;
  const nothing = !crossSpace && sprint === KEEP;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const listId = target ? firstListId(target) : undefined;
    if (!target || !listId) return;
    setError(null);
    try {
      if (crossSpace) await moveItem.mutateAsync({ itemId: item.id, body: { listId } });
      // KEEP: aynı Proje'de sprint değişmez; başka Proje'ye giden öğe zaten Backlog'a düşmüştür.
      if (canPlan && sprint !== KEEP && sprintIds.length > 0) {
        await moveToSprint.mutateAsync({
          spaceId: target.id,
          body: { itemIds: sprintIds, sprintId: sprint === BACKLOG ? null : sprint },
        });
      }
      toast.success(t('moveItem.done', { key: item.key, space: target.name }));
      onDone();
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <DialogHeader>
        <DialogTitle>{t('moveItem.title', { key: item.key })}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        {isEpic && (
          <p className="text-muted-foreground bg-muted rounded-md px-3 py-2 text-sm">
            {t('moveItem.epicNote')}
          </p>
        )}
        <SelectField
          label={t('moveItem.project')}
          value={spaceId}
          onChange={(e) => {
            setSpaceId(e.target.value);
            setSprint(KEEP);
          }}
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </SelectField>
        {canPlan ? (
          <SelectField
            label={isEpic ? t('moveItem.sprintForTasks') : t('moveItem.sprint')}
            value={sprint}
            onChange={(e) => setSprint(e.target.value)}
          >
            <option value={KEEP}>
              {crossSpace ? t('moveItem.noSprintKept') : t('moveItem.keepSprint')}
            </option>
            <option value={BACKLOG}>{t('moveItem.backlog')}</option>
            {open.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        ) : (
          target && (
            <p className="text-muted-foreground text-sm">
              {target.scrumEnabled ? t('moveItem.noPlanPermission') : t('moveItem.noSprints')}
            </p>
          )
        )}
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending || nothing || !target}>
          {t('moveItem.confirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}
