import {
  type CreateStatusRequest,
  MAX_STATUSES,
  type SpaceDetail,
  STATUS_CATEGORIES,
  type StatusCategory,
  WIP_LIMIT,
} from '@scrum/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/use-error-message';
import { useCreateStatus, useDeleteStatus, useMoveStatus, useUpdateStatus } from './queries';

type StatusItem = SpaceDetail['statuses'][number];

const NEW_STATUS_COLOR = '#3B82F6';

/** Space durumları (brief §5.8): ekle, yeniden adlandır, renk/kategori, sırala, sil, WIP limiti. */
export function StatusesSection({ space, canEdit }: { space: SpaceDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState<StatusItem | null>(null);
  const { statuses } = space;

  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('spaceSettings.statuses')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('statusEditor.help')}</p>
      </div>
      <ol className="divide-y px-4 pb-1">
        {statuses.map((status, index) => (
          <StatusRow
            key={status.id}
            spaceId={space.id}
            status={status}
            previousId={statuses[index - 1]?.id ?? null}
            beforePreviousId={statuses[index - 2]?.id ?? null}
            nextId={statuses[index + 1]?.id ?? null}
            canEdit={canEdit}
            onDelete={() => setDeleting(status)}
          />
        ))}
      </ol>
      {canEdit && <AddStatus space={space} />}
      {deleting && (
        <DeleteStatusDialog
          spaceId={space.id}
          status={deleting}
          others={statuses.filter((s) => s.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

function StatusRow({
  spaceId,
  status,
  previousId,
  beforePreviousId,
  nextId,
  canEdit,
  onDelete,
}: {
  spaceId: string;
  status: StatusItem;
  previousId: string | null;
  beforePreviousId: string | null;
  nextId: string | null;
  canEdit: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateStatus();
  const move = useMoveStatus();
  const [name, setName] = useState(status.name);
  const [limit, setLimit] = useState(status.wipLimit?.toString() ?? '');
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const patch = (body: Parameters<typeof update.mutate>[0]['body'], revert?: () => void) =>
    update.mutate(
      { spaceId, statusId: status.id, body },
      {
        onError: (error) => {
          revert?.();
          onError(error);
        },
      },
    );

  const commitName = () => {
    const value = name.trim();
    if (value === status.name) return;
    if (!value) return setName(status.name);
    patch({ name: value }, () => setName(status.name));
  };
  const commitLimit = () => {
    const wipLimit = limit.trim() === '' ? null : Number(limit);
    if (wipLimit === status.wipLimit) return;
    const revert = () => setLimit(status.wipLimit?.toString() ?? '');
    if (wipLimit !== null && !(Number.isInteger(wipLimit) && wipLimit >= WIP_LIMIT.min)) {
      return revert();
    }
    patch({ wipLimit }, revert);
  };
  const reorder = (afterId: string | null) =>
    move.mutate({ spaceId, statusId: status.id, afterId }, { onError });

  if (!canEdit) {
    return (
      <li className="flex items-center gap-3 py-2">
        <span className="size-2.5 rounded-full" style={{ background: status.color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{status.name}</span>
        <span className="text-muted-foreground text-xs">
          {t(`statusCategory.${status.category}`)}
        </span>
        <span className="text-muted-foreground w-24 text-right text-xs">
          {status.wipLimit ?? t('statusEditor.unlimited')}
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input
        type="color"
        className="size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
        aria-label={t('statusEditor.colorFor', { name: status.name })}
        value={status.color.toLowerCase()}
        onChange={(e) => patch({ color: e.target.value.toUpperCase() })}
      />
      <Input
        className="h-8 min-w-32 flex-1"
        maxLength={40}
        aria-label={t('statusEditor.nameFor', { name: status.name })}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <NativeSelect
        className="h-8"
        aria-label={t('statusEditor.categoryFor', { name: status.name })}
        value={status.category}
        onChange={(e) => patch({ category: e.target.value as StatusCategory })}
      >
        {STATUS_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`statusCategory.${c}`)}
          </option>
        ))}
      </NativeSelect>
      <Input
        type="number"
        inputMode="numeric"
        min={WIP_LIMIT.min}
        max={WIP_LIMIT.max}
        className="h-8 w-24"
        aria-label={t('statusEditor.wipFor', { name: status.name })}
        placeholder={t('statusEditor.unlimited')}
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        onBlur={commitLimit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={previousId === null}
        aria-label={t('statusEditor.moveUp', { name: status.name })}
        onClick={() => reorder(beforePreviousId)}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={nextId === null}
        aria-label={t('statusEditor.moveDown', { name: status.name })}
        onClick={() => reorder(nextId)}
      >
        <ArrowDown />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={t('statusEditor.delete', { name: status.name })}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function AddStatus({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateStatus();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StatusCategory>('ACTIVE');
  const full = space.statuses.length >= MAX_STATUSES;

  const submit = () => {
    const value = name.trim();
    if (!value || full) return;
    // Done durumu doğal olarak akışın sonuna, diğerleri son Done'ın önüne girer.
    const lastOpen = [...space.statuses].reverse().find((s) => s.category !== 'DONE');
    const body: CreateStatusRequest = {
      name: value,
      color: NEW_STATUS_COLOR,
      category,
      ...(category !== 'DONE' && lastOpen && { afterId: lastOpen.id }),
    };
    create.mutate(
      { spaceId: space.id, body },
      {
        onSuccess: () => setName(''),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        className="h-8 min-w-32 flex-1"
        maxLength={40}
        aria-label={t('statusEditor.newName')}
        placeholder={t('statusEditor.newName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <NativeSelect
        className="h-8"
        aria-label={t('statusEditor.newCategory')}
        value={category}
        onChange={(e) => setCategory(e.target.value as StatusCategory)}
      >
        {STATUS_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`statusCategory.${c}`)}
          </option>
        ))}
      </NativeSelect>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!name.trim() || full || create.isPending}
      >
        <Plus />
        {t('statusEditor.add')}
      </Button>
      {full && (
        <p className="text-muted-foreground w-full text-xs">
          {t('statusEditor.limit', { max: MAX_STATUSES })}
        </p>
      )}
    </form>
  );
}

function DeleteStatusDialog({
  spaceId,
  status,
  others,
  onClose,
}: {
  spaceId: string;
  status: StatusItem;
  others: StatusItem[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const remove = useDeleteStatus();
  const preferred = others.find((s) => s.category === status.category) ?? others[0];
  const [moveTo, setMoveTo] = useState(preferred?.id ?? '');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent role="alertdialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('statusEditor.deleteTitle', { name: status.name })}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <DialogDescription>{t('statusEditor.deleteHint')}</DialogDescription>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('statusEditor.moveTo')}
            <NativeSelect value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || !moveTo}
            onClick={() =>
              void remove
                .mutateAsync({ spaceId, statusId: status.id, moveTo })
                .then(onClose)
                .catch((error: unknown) => toast.error(errorMessage(error)))
            }
          >
            {t('statusEditor.deleteConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
