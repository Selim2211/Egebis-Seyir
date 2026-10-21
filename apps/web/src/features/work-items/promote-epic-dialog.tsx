import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field } from '@/components/form';
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
import { usePromoteToEpic } from './queries';

/** Task'ı Epic'e dönüştürme (isteğe bağlı işlem, ADR-109); Epic'in adı dönüşürken değiştirilebilir (ADR-124). */
export function PromoteEpicDialog({
  item,
  onClose,
}: {
  item: { id: string; key: string; title: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close')}>
        {item && <PromoteForm item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PromoteForm({
  item,
  onClose,
}: {
  item: { id: string; key: string; title: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const promote = usePromoteToEpic();
  const [title, setTitle] = useState(item.title);
  const trimmed = title.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    promote.mutate(
      { itemId: item.id, title: trimmed !== item.title ? trimmed : undefined },
      {
        onSuccess: () => {
          toast.success(t('promoteEpic.done', { key: item.key }));
          onClose();
        },
        onError: (error) => {
          toast.error(errorMessage(error));
          onClose();
        },
      },
    );
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{t('promoteEpic.title', { key: item.key })}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">{t('promoteEpic.body')}</p>
        <Field
          label={t('promoteEpic.name')}
          value={title}
          maxLength={500}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={promote.isPending || !trimmed}>
          {t('promoteEpic.confirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}
