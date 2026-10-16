import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useErrorMessage } from '@/lib/use-error-message';
import { usePromoteToEpic } from './queries';

/** Task'ı Epic'e dönüştürme onayı (isteğe bağlı işlem, ADR-109). */
export function PromoteEpicDialog({
  item,
  onClose,
}: {
  item: { id: string; key: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const promote = usePromoteToEpic();
  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('promoteEpic.title', { key: item?.key ?? '' })}
      description={t('promoteEpic.body')}
      confirmLabel={t('promoteEpic.confirm')}
      pending={promote.isPending}
      onConfirm={() => {
        if (!item) return;
        promote.mutate(
          { itemId: item.id },
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
      }}
    />
  );
}
