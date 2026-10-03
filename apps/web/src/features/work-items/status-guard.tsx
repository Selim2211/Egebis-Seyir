import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { isApiError } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

interface Pending {
  itemId: string;
  statusId: string;
  reason: 'children' | 'blocked' | 'dod';
  /** Açık alt öğe sayısı veya engelleyen kimlikleri. */
  detail: number | string[];
}

type Submit = (
  itemId: string,
  statusId: string,
  force: boolean,
  handlers: { onSuccess: () => void; onError: (error: unknown) => void },
) => void;

/**
 * Durum değişikliğinde sunucunun uyarılarını (açık alt öğe, engelleyen) onay penceresine çevirir:
 * kullanıcı onaylarsa `force` ile yeniden gönderilir (ADR-046, ADR-050). Liste ve detay ortak kullanır.
 */
export function useStatusGuard(
  submit: Submit,
  pendingNow: boolean,
): {
  change: (itemId: string, statusId: string) => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [pending, setPending] = useState<Pending | null>(null);

  const send = (itemId: string, statusId: string, force: boolean) =>
    submit(itemId, statusId, force, {
      onSuccess: () => setPending(null),
      onError: (error) => {
        const details = isApiError(error)
          ? (error.details as Record<string, unknown> | undefined)
          : undefined;
        if (isApiError(error, 'WORK_ITEM_OPEN_CHILDREN')) {
          setPending({ itemId, statusId, reason: 'children', detail: Number(details?.count ?? 0) });
        } else if (isApiError(error, 'DOD_INCOMPLETE')) {
          setPending({ itemId, statusId, reason: 'dod', detail: Number(details?.count ?? 0) });
        } else if (isApiError(error, 'WORK_ITEM_BLOCKED')) {
          setPending({
            itemId,
            statusId,
            reason: 'blocked',
            detail: Array.isArray(details?.keys) ? (details.keys as string[]) : [],
          });
        } else {
          toast.error(errorMessage(error));
        }
      },
    });

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      title={t(
        pending?.reason === 'blocked'
          ? 'items.blockedTitle'
          : pending?.reason === 'dod'
            ? 'items.dodTitle'
            : 'items.openChildrenTitle',
      )}
      description={
        pending?.reason === 'blocked'
          ? t('items.blockedBody', { keys: (pending.detail as string[]).join(', ') })
          : pending?.reason === 'dod'
            ? t('items.dodBody', { count: Number(pending.detail) })
            : t('items.openChildrenBody', { count: Number(pending?.detail ?? 0) })
      }
      confirmLabel={t(pending?.reason === 'blocked' ? 'items.startAnyway' : 'items.completeAnyway')}
      pending={pendingNow}
      onConfirm={() => pending && send(pending.itemId, pending.statusId, true)}
    />
  );

  return { change: (itemId, statusId) => send(itemId, statusId, false), dialog };
}
