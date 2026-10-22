import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { useErrorMessage } from '@/lib/use-error-message';
import { canBecomeSubtask, type BulkItem } from './bulk-utils';
import { useBacklogUnnest, useNestItem } from './queries';

/** Seçili öğeleri seçilen bir Task'ın Sub-Task'ı yapar. Uygun olmayanlar (Epic, Bug, alt görevli Task) atlanır. */
export function BulkNestDialog({
  items,
  parents,
  open,
  onOpenChange,
  onDone,
}: {
  items: BulkItem[];
  parents: ReadonlyArray<{ id: string; key: string; title: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close')}>
        {open && (
          <NestForm
            items={items}
            parents={parents}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NestForm({
  items,
  parents,
  onClose,
  onDone,
}: {
  items: BulkItem[];
  parents: ReadonlyArray<{ id: string; key: string; title: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const nest = useNestItem();
  const eligible = items.filter(canBecomeSubtask);
  const choices = parents.filter((p) => !eligible.some((i) => i.id === p.id));
  const [parentId, setParentId] = useState(choices[0]?.id ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const skipped = items.length - eligible.length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parentId || eligible.length === 0) return;
    setError(null);
    setBusy(true);
    let done = 0;
    try {
      for (const item of eligible) {
        if (item.parentId === parentId && item.type === 'SUBTASK') continue;
        await nest.mutateAsync({ itemId: item.id, parentId });
        done += 1;
      }
      toast.success(
        t('bulk.nested', {
          count: done,
          target: parents.find((p) => p.id === parentId)?.key ?? '',
        }),
      );
      onDone();
      onClose();
    } catch (err) {
      setError(err);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <DialogHeader>
        <DialogTitle>{t('bulk.nestTitle', { count: eligible.length })}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">{t('bulk.nestBody')}</p>
        <SelectField
          label={t('bulk.parent')}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.key} {p.title}
            </option>
          ))}
        </SelectField>
        {skipped > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            {t('bulk.skipped', { count: skipped })}
          </p>
        )}
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy || !parentId || eligible.length === 0}>
          {t('bulk.nestConfirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Seçili öğeleri üst öğesinden çıkarır: Sub-Task bağımsız Task olur, Epic altındaki Task Epic'ten çıkar. */
export function BulkUnnestDialog({
  items,
  open,
  onOpenChange,
  onDone,
}: {
  items: BulkItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const unnest = useBacklogUnnest();
  const withParent = items.filter((i) => i.parentId);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.unnestTitle', { count: withParent.length })}
      description={t('bulk.unnestBody')}
      confirmLabel={t('bulk.unnestConfirm')}
      pending={unnest.isPending}
      onConfirm={() => {
        void (async () => {
          let done = 0;
          try {
            for (const item of withParent) {
              await unnest.mutateAsync(item.id);
              done += 1;
            }
            toast.success(t('bulk.unnested', { count: done }));
            onDone();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            onOpenChange(false);
          }
        })();
      }}
    />
  );
}
