import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  const itemIds = items.map((i) => i.id);
  const defaultTitle = items[0]?.title ?? '';
  const subtaskCount = items.reduce((n, i) => n + (i.type === 'TASK' ? i.childCount : 0), 0);
  // Varsayılan: Sub-Task'lar götürülmez (ayrılıp bağımsız Task olur); anahtar açılırsa Task'la gider.
  const [withSubtasks, setWithSubtasks] = useState(false);
  const [epicQuery, setEpicQuery] = useState('');
  const [choice, setChoice] = useState(epics[0]?.id ?? NEW_EPIC);
  const [title, setTitle] = useState(defaultTitle);
  const [error, setError] = useState<unknown>(null);
  const q = epicQuery.trim().toLocaleLowerCase();
  const visibleEpics = q
    ? epics.filter((e) => `${e.key} ${e.title}`.toLocaleLowerCase().includes(q))
    : epics;
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
      await group.mutateAsync({ itemIds, epicId, withSubtasks });
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
        <>
          <p className="text-muted-foreground text-sm">{t('groupEpic.body')}</p>
          {subtaskCount > 0 && (
            <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <Switch
                checked={withSubtasks}
                onCheckedChange={setWithSubtasks}
                aria-label={t('groupEpic.withSubtasks')}
                data-testid="with-subtasks"
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">{t('groupEpic.withSubtasks')}</span>
                <span className="text-muted-foreground block text-xs">
                  {t('groupEpic.withSubtasksHint')}
                </span>
              </span>
            </label>
          )}
          <div className="bg-muted rounded-md px-3 py-2 text-sm" data-testid="group-preview">
            <p>{t('groupEpic.preview', { count: items.length })}</p>
            {subtaskCount > 0 && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {withSubtasks
                  ? t('groupEpic.previewWith', { count: subtaskCount })
                  : t('groupEpic.previewWithout', { count: subtaskCount })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('groupEpic.epic')}</span>
            <Input
              value={epicQuery}
              onChange={(e) => setEpicQuery(e.target.value)}
              placeholder={t('groupEpic.search')}
              aria-label={t('groupEpic.search')}
            />
            <div
              role="listbox"
              aria-label={t('groupEpic.epic')}
              data-testid="epic-list"
              className="max-h-44 overflow-y-auto rounded-lg border p-1"
            >
              {visibleEpics.map((epic) => (
                <EpicOption
                  key={epic.id}
                  selected={choice === epic.id}
                  onSelect={() => setChoice(epic.id)}
                >
                  <span className="text-muted-foreground font-mono text-xs">{epic.key}</span>{' '}
                  {epic.title}
                </EpicOption>
              ))}
              {visibleEpics.length === 0 && epicQuery.trim() && (
                <p className="text-muted-foreground px-3 py-2 text-sm">{t('groupEpic.noEpic')}</p>
              )}
              <EpicOption selected={choice === NEW_EPIC} onSelect={() => setChoice(NEW_EPIC)}>
                {t('groupEpic.newEpic')}
              </EpicOption>
            </div>
          </div>
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

/** Epic seçim listesindeki satır. */
function EpicOption({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center rounded-md px-3 py-2 text-left text-sm',
        selected ? 'bg-primary/10 ring-primary/40 ring-1' : 'hover:bg-accent',
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  );
}
