import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError, SelectField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateItem, usePromoteToEpic } from '@/features/work-items/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import type { BulkItem } from './bulk-utils';
import { useGroupItems } from './queries';

const NEW_EPIC = '__new';

/**
 * Seçili Task/Bug'ları bir Epic altında toplar (ADR-124): var olan bir Epic seçilir ya da yeni Epic
 * açılır. Farklı sprint'lerdeki öğeler birlikte seçilebilir; sprint üyelikleri değişmez. Sub-Task'lı
 * Task'lar Sub-Task'larıyla birlikte gelir.
 */
export function GroupEpicDialog({
  spaceId,
  listId,
  items,
  epics,
  open,
  onOpenChange,
  onDone,
}: {
  spaceId: string;
  /** Yeni Epic'in açılacağı List (seçili öğelerin List'i). */
  listId: string;
  /** Seçilen öğeler: önizleme ve yeni Epic adının varsayılanı (ilk Task'ın adı) bunlardan gelir. */
  items: BulkItem[];
  epics: ReadonlyArray<{ id: string; key: string; title: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close')}>
        {open && (
          <GroupForm
            spaceId={spaceId}
            listId={listId}
            items={items}
            epics={epics}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({
  spaceId,
  listId,
  items,
  epics,
  onClose,
  onDone,
}: {
  spaceId: string;
  listId: string;
  items: BulkItem[];
  epics: ReadonlyArray<{ id: string; key: string; title: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateItem();
  const group = useGroupItems(spaceId);
  const promote = usePromoteToEpic();
  const itemIds = items.map((i) => i.id);
  const defaultTitle = items[0]?.title ?? '';
  // Tek Task ve alt görevi varsa iki yol sunulur: Epic altına al ya da Task'ı Epic'e dönüştür.
  const single = items.length === 1 && items[0]!.type === 'TASK' ? items[0]! : null;
  const canConvert = single !== null && single.childCount > 0;
  const [mode, setMode] = useState<'group' | 'convert'>('group');
  const converting = canConvert && mode === 'convert';
  const subtaskCount = items.reduce((n, i) => n + (i.type === 'TASK' ? i.childCount : 0), 0);
  const [choice, setChoice] = useState(epics[0]?.id ?? NEW_EPIC);
  const [title, setTitle] = useState(defaultTitle);
  const [error, setError] = useState<unknown>(null);
  const creating = choice === NEW_EPIC;
  const invalid = (creating || converting) && !title.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setError(null);
    if (converting && single) {
      try {
        const name = title.trim();
        await promote.mutateAsync({
          itemId: single.id,
          title: name !== single.title ? name : undefined,
        });
        toast.success(t('promoteEpic.done', { key: single.key }));
        onDone();
        onClose();
      } catch (err) {
        setError(err);
        toast.error(errorMessage(err));
      }
      return;
    }
    try {
      const epicId = creating
        ? (
            await create.mutateAsync({
              listId,
              body: { type: 'EPIC', title: title.trim(), parentId: null },
            })
          ).id
        : choice;
      await group.mutateAsync({ itemIds, epicId });
      toast.success(t('groupEpic.done', { count: itemIds.length }));
      onDone();
      onClose();
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <DialogHeader>
        <DialogTitle>{t('groupEpic.title', { count: itemIds.length })}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        {canConvert && (
          <div role="radiogroup" aria-label={t('groupEpic.modeLabel')} className="grid gap-2">
            {(['group', 'convert'] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm',
                  mode === m
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                    : 'hover:bg-accent/40',
                )}
              >
                <input
                  type="radio"
                  name="group-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{t(`groupEpic.mode.${m}`)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t(`groupEpic.mode.${m}Hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {converting && single ? (
          <>
            <p className="bg-muted rounded-md px-3 py-2 text-sm">
              {t('groupEpic.convertPreview', { key: single.key, count: single.childCount })}
            </p>
            <Field
              label={t('promoteEpic.name')}
              value={title}
              maxLength={500}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t('groupEpic.body')}</p>
            <p className="bg-muted rounded-md px-3 py-2 text-sm" data-testid="group-preview">
              {t('groupEpic.preview', { count: items.length })}
              {subtaskCount > 0 && ` ${t('groupEpic.previewSub', { count: subtaskCount })}`}
            </p>
            <SelectField
              label={t('groupEpic.epic')}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.key} {epic.title}
                </option>
              ))}
              <option value={NEW_EPIC}>{t('groupEpic.newEpic')}</option>
            </SelectField>
            {creating && (
              <Field
                label={t('groupEpic.newName')}
                value={title}
                maxLength={500}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </>
        )}
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={invalid || create.isPending || group.isPending || promote.isPending}
        >
          {converting ? t('promoteEpic.confirm') : t('groupEpic.confirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}
