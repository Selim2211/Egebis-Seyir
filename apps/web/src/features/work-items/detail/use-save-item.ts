import type { UpdateWorkItemRequest } from '@scrum/shared';
import { toast } from 'sonner';
import { useErrorMessage } from '@/lib/use-error-message';
import { useUpdateItemFields } from '../queries';

/** Alan düzenleme: hata toast'ı, başarıda detay ve listeler tazelenir. */
export function useSaveItem(itemId: string) {
  const update = useUpdateItemFields();
  const errorMessage = useErrorMessage();
  const save = (body: UpdateWorkItemRequest) =>
    update.mutate({ itemId, body }, { onError: (error) => toast.error(errorMessage(error)) });
  return { save, update };
}
