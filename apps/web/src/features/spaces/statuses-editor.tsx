import { type SpaceDetail, WIP_LIMIT } from '@scrum/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/use-error-message';
import { useUpdateStatus } from './queries';

/** Space durumları (brief §5.8): ad, kategori ve Board sütunu WIP limiti. */
export function StatusesSection({ space, canEdit }: { space: SpaceDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('spaceSettings.statuses')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('statusEditor.wipHint')}</p>
      </div>
      <ol className="divide-y p-4 pt-1">
        {space.statuses.map((status) => (
          <StatusRow key={status.id} spaceId={space.id} status={status} canEdit={canEdit} />
        ))}
      </ol>
    </section>
  );
}

function StatusRow({
  spaceId,
  status,
  canEdit,
}: {
  spaceId: string;
  status: SpaceDetail['statuses'][number];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateStatus();
  const [limit, setLimit] = useState(status.wipLimit?.toString() ?? '');

  const commit = () => {
    const wipLimit = limit.trim() === '' ? null : Number(limit);
    if (wipLimit === status.wipLimit) return;
    if (wipLimit !== null && !(Number.isInteger(wipLimit) && wipLimit >= WIP_LIMIT.min)) {
      setLimit(status.wipLimit?.toString() ?? '');
      return;
    }
    update.mutate(
      { spaceId, statusId: status.id, body: { wipLimit } },
      {
        onError: (error) => {
          setLimit(status.wipLimit?.toString() ?? '');
          toast.error(errorMessage(error));
        },
      },
    );
  };

  return (
    <li className="flex items-center gap-3 py-2">
      <span className="size-2.5 rounded-full" style={{ background: status.color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{status.name}</span>
      <span className="text-muted-foreground text-xs">
        {t(`statusCategory.${status.category}`)}
      </span>
      {canEdit ? (
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
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      ) : (
        <span className="text-muted-foreground w-24 text-right text-xs">
          {status.wipLimit ?? t('statusEditor.unlimited')}
        </span>
      )}
    </li>
  );
}
