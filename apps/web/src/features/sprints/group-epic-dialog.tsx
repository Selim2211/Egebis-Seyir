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
import { useCreateItem } from '@/features/work-items/queries';
import { useErrorMessage } from '@/lib/use-error-message';
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
  itemIds,
  epics,
  open,
  onOpenChange,
  onDone,
}: {
  spaceId: string;
  /** Yeni Epic'in açılacağı List (seçili öğelerin List'i). */
  listId: string;
  itemIds: string[];
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
            itemIds={itemIds}
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
  itemIds,
  epics,
  onClose,
  onDone,
}: {
  spaceId: string;
  listId: string;
  itemIds: string[];
  epics: ReadonlyArray<{ id: string; key: string; title: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateItem();
  const group = useGroupItems(spaceId);
  const [choice, setChoice] = useState(epics[0]?.id ?? NEW_EPIC);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<unknown>(null);
  const creating = choice === NEW_EPIC;
  const invalid = creating && !title.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setError(null);
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
        <p className="text-muted-foreground text-sm">{t('groupEpic.body')}</p>
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
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={invalid || create.isPending || group.isPending}>
          {t('groupEpic.confirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}
