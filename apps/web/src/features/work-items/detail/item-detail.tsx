import { SPACE_PERMISSIONS as S, type SpaceDetail, type WorkItemDetail } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Archive,
  ChevronRight,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Link2,
  MoreHorizontal,
  Maximize2,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { itemByKeyQuery, useCopyItem, useItemLifecycle, useWatchItem } from '../queries';
import { Checklists } from './checklists';
import { ItemOpenLink } from './item-nav';
import { Links } from './links';
import { Properties } from './properties';
import { useSaveItem } from './use-save-item';
import { RichTextEditor } from './rich-text-editor';
import { SubItems } from './sub-items';

/**
 * Görev detayı (brief §10 madde 9): yan panelde veya tam sayfada aynı içerik.
 * `itemKey` okunabilir ID'dir (ADR-033); `onClose` yalnızca panelde verilir.
 */
export function ItemDetail({
  itemKey,
  variant,
  onClose,
}: {
  itemKey: string;
  variant: 'panel' | 'page';
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data: item, isPending, isError } = useQuery(itemByKeyQuery(workspaceId, itemKey));
  const { data: space } = useQuery({
    ...spaceQuery(workspaceId, item?.spaceId ?? ''),
    enabled: !!item,
  });

  if (isError) {
    return (
      <div role="alert">
        <NotFoundState />
      </div>
    );
  }
  if (isPending || !space) {
    return <p className="text-muted-foreground px-6 py-10 text-sm">{t('common.loading')}</p>;
  }

  return <Content item={item} space={space} variant={variant} onClose={onClose} />;
}

function Content({
  item,
  space,
  variant,
  onClose,
}: {
  item: WorkItemDetail;
  space: SpaceDetail;
  variant: 'panel' | 'page';
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { save } = useSaveItem(item.id);
  const lifecycle = useItemLifecycle();
  const copy = useCopyItem();
  const watch = useWatchItem();
  const canWrite = space.permissions.includes(S.WORK_ITEM_WRITE) && !item.archived;
  const wide = variant === 'page';

  const run = (action: 'archive' | 'unarchive' | 'delete' | 'restore', message?: string) =>
    lifecycle.mutate(
      { itemId: item.id, action },
      {
        onSuccess: () => {
          if (message) {
            toast.success(message, {
              action: {
                label: t('structure.undo'),
                onClick: () =>
                  lifecycle.mutate({
                    itemId: item.id,
                    action: action === 'archive' ? 'unarchive' : 'restore',
                  }),
              },
            });
          }
          // Silinen/arşivlenen öğenin görünümü kapanır; arşivdekine bağlantıyla yine ulaşılır.
          if (action === 'delete') {
            if (onClose) onClose();
            else void navigate({ to: '/lists/$listId', params: { listId: item.listId } });
          }
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  const copyLink = () => {
    void navigator.clipboard
      .writeText(`${window.location.origin}/items/${item.key}`)
      .then(() => toast.success(t('detail.linkCopied')))
      .catch(() => toast.error(t('errors.INTERNAL')));
  };

  return (
    <article aria-label={`${item.key} ${item.title}`} className="flex min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <nav
            aria-label={t('structure.breadcrumb')}
            className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1 text-sm"
          >
            <Link
              to="/lists/$listId"
              params={{ listId: item.listId }}
              className="truncate hover:underline"
            >
              {space.name}
            </Link>
            {item.ancestors.map((a) => (
              <span key={a.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                <ItemOpenLink itemKey={a.key} className="truncate hover:underline">
                  {a.key}
                </ItemOpenLink>
              </span>
            ))}
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            <WorkItemTypeIcon type={item.type} />
            <span className="text-foreground font-mono text-xs">{item.key}</span>
          </nav>

          <Button
            variant="ghost"
            size="sm"
            aria-pressed={item.watching}
            disabled={watch.isPending}
            onClick={() => watch.mutate({ itemId: item.id, watching: !item.watching })}
          >
            {item.watching ? <EyeOff /> : <Eye />}
            <span className="max-sm:sr-only">
              {t(item.watching ? 'detail.unwatch' : 'detail.watch')}
            </span>
            <span className="text-muted-foreground text-xs">{item.watcherCount}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('items.actions', { key: item.key })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 />
                {t('detail.copyLink')}
              </DropdownMenuItem>
              {canWrite && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      copy.mutate(
                        { itemId: item.id, body: { includeChildren: true } },
                        {
                          onSuccess: ({ key }) => toast.success(t('items.copied', { key })),
                          onError: (error) => toast.error(errorMessage(error)),
                        },
                      )
                    }
                  >
                    <CopyPlus />
                    {t('items.copy')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => run('archive', t('items.archived', { key: item.key }))}
                  >
                    <Archive />
                    {t('structure.archive')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => run('delete', t('items.trashed', { key: item.key }))}
                  >
                    <Trash2 />
                    {t('structure.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {variant === 'panel' && (
            <>
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <Link to="/items/$key" params={{ key: item.key }} aria-label={t('detail.openFull')}>
                  <Maximize2 />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onClose}
                aria-label={t('common.close')}
              >
                <X />
              </Button>
            </>
          )}
        </div>
        <TitleField
          key={item.title}
          item={item}
          disabled={!canWrite}
          onSave={(title) => save({ title })}
        />
      </header>

      {item.archived && (
        <div
          role="status"
          className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:mx-6 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <Archive className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{t('detail.archivedBanner')}</span>
          {space.permissions.includes(S.WORK_ITEM_WRITE) && (
            <Button size="sm" variant="outline" onClick={() => run('unarchive')}>
              {t('structure.unarchive')}
            </Button>
          )}
        </div>
      )}

      <div
        className={cn('grid gap-6 px-4 py-4 sm:px-6', wide && 'lg:grid-cols-[minmax(0,1fr)_20rem]')}
      >
        <div className={cn('flex min-w-0 flex-col gap-6', wide ? 'lg:order-1' : 'order-2')}>
          <section aria-labelledby="description-title">
            <h3 id="description-title" className="mb-1 text-sm font-semibold">
              {t('detail.description')}
            </h3>
            <RichTextEditor
              key={item.id}
              value={item.description}
              editable={canWrite}
              label={t('detail.description')}
              placeholder={
                canWrite ? t('detail.descriptionPlaceholder') : t('detail.noDescription')
              }
              onSave={(description) => save({ description })}
            />
          </section>
          <Checklists itemId={item.id} checklists={item.checklists} canWrite={canWrite} />
          <SubItems item={item} space={space} canWrite={canWrite} />
          <Links item={item} canWrite={canWrite} />
        </div>
        <aside
          aria-label={t('detail.properties')}
          className={cn('min-w-0', wide ? 'lg:order-2' : 'order-1')}
        >
          <Properties item={item} space={space} archived={item.archived} />
        </aside>
      </div>
      <p className="text-muted-foreground px-4 pb-4 text-xs sm:px-6">
        <Copy className="mr-1 inline size-3" aria-hidden />
        {t('detail.updated', { when: new Date(item.updatedAt).toLocaleString() })}
      </p>
    </article>
  );
}

function TitleField({
  item,
  disabled,
  onSave,
}: {
  item: WorkItemDetail;
  disabled: boolean;
  onSave: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(item.title);
  const commit = () => {
    const next = value.trim();
    if (!next) return setValue(item.title);
    if (next !== item.title) onSave(next);
  };
  return (
    <input
      value={value}
      disabled={disabled}
      maxLength={500}
      aria-label={t('items.title')}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(item.title);
          e.currentTarget.blur();
        }
      }}
      className="focus-visible:ring-ring/50 hover:bg-accent/40 -mx-1 w-full rounded-md bg-transparent px-1 py-0.5 text-xl font-semibold tracking-tight outline-none focus-visible:ring-[3px] disabled:hover:bg-transparent"
    />
  );
}
