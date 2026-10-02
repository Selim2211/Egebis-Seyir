import {
  PRIORITIES,
  type BulkUpdateRequest,
  type Label,
  type SpaceDetail,
  type WorkItemSummary,
} from '@scrum/shared';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PriorityIcon } from '@/components/work-item/work-item-visuals';
import { isApiError } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { useMembers } from '@/features/workspace/queries';
import { useBulkUpdate } from '../queries';

/**
 * Toplu düzenleme çubuğu (brief §5.4): seçili öğelerde durum, öncelik, atanan ve etiket.
 * Done'a çekerken açık alt öğe uyarısı gelirse onay istenir (ADR-046).
 */
export function BulkBar({
  space,
  selected,
  items,
  labels,
  onClear,
  confirmForce,
}: {
  space: SpaceDetail;
  selected: ReadonlySet<string>;
  items: WorkItemSummary[];
  labels: Label[];
  onClear: () => void;
  /** Açık alt öğe uyarısı: kullanıcı onaylarsa `true` döner. */
  confirmForce: (count: number) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const bulk = useBulkUpdate();
  const members = useMembers().data?.members ?? [];
  const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);

  const apply = (patch: BulkUpdateRequest['patch'], force = false) =>
    bulk.mutate(
      { spaceId: space.id, body: { ids, patch, force } },
      {
        onSuccess: () => toast.success(t('view.bulkDone', { count: ids.length })),
        onError: (error) => {
          if (isApiError(error, 'WORK_ITEM_OPEN_CHILDREN')) {
            const count = Number((error.details as { count?: number } | undefined)?.count ?? 0);
            void confirmForce(count).then((ok) => ok && apply(patch, true));
          } else {
            toast.error(errorMessage(error));
          }
        },
      },
    );

  return (
    <div
      role="region"
      aria-label={t('view.bulkBar')}
      className="bg-card sticky bottom-4 z-20 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
    >
      <span className="text-sm font-medium">{t('view.selectedCount', { count: ids.length })}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={bulk.isPending}>
            {t('items.columns.status')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {space.statuses.map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => apply({ statusId: s.id })}>
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={bulk.isPending}>
            {t('items.columns.priority')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onSelect={() => apply({ priority: p })}>
              <PriorityIcon priority={p} />
              {t(`priority.${p}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {members.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={bulk.isPending}>
              {t('items.columns.assignees')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>{t('view.addAssignee')}</DropdownMenuLabel>
            {members.map((m) => (
              <DropdownMenuItem
                key={m.userId}
                onSelect={() => apply({ addAssigneeIds: [m.userId] })}
              >
                {m.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('view.removeAssignee')}</DropdownMenuLabel>
            {members.map((m) => (
              <DropdownMenuItem
                key={`r${m.userId}`}
                onSelect={() => apply({ removeAssigneeIds: [m.userId] })}
              >
                {m.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {labels.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={bulk.isPending}>
              {t('detail.labels')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>{t('view.addLabel')}</DropdownMenuLabel>
            {labels.map((l) => (
              <DropdownMenuItem key={l.id} onSelect={() => apply({ addLabelIds: [l.id] })}>
                <span className="size-2 rounded-full" style={{ background: l.color }} />
                {l.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('view.removeLabel')}</DropdownMenuLabel>
            {labels.map((l) => (
              <DropdownMenuItem key={`r${l.id}`} onSelect={() => apply({ removeLabelIds: [l.id] })}>
                {l.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={onClear}
        aria-label={t('view.clearSelection')}
      >
        <X />
      </Button>
    </div>
  );
}
