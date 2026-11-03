import { type SprintSummary } from '@scrum/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useErrorMessage } from '@/lib/use-error-message';
import { useDeleteSprint } from './queries';

/**
 * Sprint silme onayı (ADR-151): planlı sprint'in öğeleri Backlog'a döner; başlamış, bitmiş ya da
 * iptal edilmiş sprint öğeleriyle birlikte çöp kutusuna gider.
 */
export function SprintDeleteDialog({
  sprint,
  onClose,
}: {
  sprint: SprintSummary | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const remove = useDeleteSprint();
  const withItems = sprint !== null && sprint.status !== 'PLANNED';
  return (
    <ConfirmDialog
      open={sprint !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('sprints.deleteTitle', { name: sprint?.name })}
      description={
        withItems
          ? t('sprints.deleteBodyWithItems', { count: sprint.itemCount })
          : t('sprints.deleteBody')
      }
      confirmLabel={t('structure.delete')}
      pending={remove.isPending}
      onConfirm={() => {
        if (!sprint) return;
        remove.mutate(sprint.id, {
          onSuccess: () => {
            toast.success(
              t(withItems ? 'sprints.deletedWithItems' : 'sprints.deleted', { name: sprint.name }),
            );
            onClose();
          },
          onError: (error) => {
            toast.error(errorMessage(error));
            onClose();
          },
        });
      }}
    />
  );
}
