import {
  SPACE_PERMISSIONS as S,
  type CreateSavedViewRequest,
  type SavedView,
  type UpdateSavedViewRequest,
  CreatedSchema,
} from '@scrum/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Check, ChevronDown, Save, Trash2, Users } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { savedViewsQuery } from './saved-views-queries';
import { configFromSearch, sameConfig, searchFromConfig } from './saved-view-config';
import type { ViewSearch } from './view-state';

const ws = (id: string) => `/workspaces/${id}`;

function useViewMutations(listId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  const settled = {
    onSettled: () => qc.invalidateQueries({ queryKey: savedViewsQuery(id, listId).queryKey }),
  };
  const base = `${ws(id)}/lists/${listId}/views`;
  return {
    create: useMutation({
      mutationFn: (body: CreateSavedViewRequest) =>
        apiRequest(base, CreatedSchema, { method: 'POST', body }),
      ...settled,
    }),
    update: useMutation({
      mutationFn: (input: { viewId: string; body: UpdateSavedViewRequest }) =>
        apiRequest(`${base}/${input.viewId}`, NoContent, { method: 'PATCH', body: input.body }),
      ...settled,
    }),
    remove: useMutation({
      mutationFn: (viewId: string) =>
        apiRequest(`${base}/${viewId}`, NoContent, { method: 'DELETE' }),
      ...settled,
    }),
  };
}

/**
 * Kayıtlı görünümler (brief §5.14, ADR-079): geçerli süzgeç/sıralama/gruplama/görünüm türünü
 * adlandırıp kaydet, kişisel ya da ekiple paylaşımlı; seçilince adres durumuna uygulanır.
 */
export function SavedViewsMenu({
  listId,
  search,
  permissions,
  onApply,
}: {
  listId: string;
  search: ViewSearch;
  permissions: readonly string[];
  onApply: (patch: Partial<ViewSearch>) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(savedViewsQuery(workspaceId, listId));
  const mutations = useViewMutations(listId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SavedView | null>(null);

  const views = data?.views ?? [];
  const current = configFromSearch(search);
  const active = views.find((v) => sameConfig(v.config, current)) ?? null;
  const canShare = permissions.includes(S.WORK_ITEM_WRITE);
  const onError = (error: unknown) => toast.error(errorMessage(error));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={active ? 'secondary' : 'outline'} size="sm" className="h-8">
            <Bookmark />
            {active ? active.name : t('savedViews.title')}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-64 overflow-y-auto">
          <DropdownMenuLabel>{t('savedViews.title')}</DropdownMenuLabel>
          {views.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-sm">{t('savedViews.empty')}</p>
          )}
          {views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onSelect={() => onApply(searchFromConfig(view.config))}
              className={cn(active?.id === view.id && 'font-medium')}
            >
              {active?.id === view.id ? <Check /> : <span className="size-4" />}
              <span className="min-w-0 flex-1 truncate">{view.name}</span>
              {view.shared && (
                <Users
                  className="text-muted-foreground size-3.5"
                  aria-label={t('savedViews.sharedBadge')}
                />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {active?.canEdit && (
            <>
              <DropdownMenuItem
                onSelect={() =>
                  mutations.update.mutate(
                    { viewId: active.id, body: { config: current } },
                    { onError },
                  )
                }
              >
                <Save /> {t('savedViews.update', { name: active.name })}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(active)}>
                <Trash2 /> {t('savedViews.delete', { name: active.name })}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => setSaving(true)}>
            <Bookmark /> {t('savedViews.saveCurrent')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {saving && (
        <SaveDialog
          canShare={canShare}
          pending={mutations.create.isPending}
          error={mutations.create.error}
          onClose={() => setSaving(false)}
          onSave={(name, shared) =>
            void mutations.create
              .mutateAsync({ name, shared, config: current })
              .then(() => {
                setSaving(false);
                toast.success(t('savedViews.saved', { name }));
              })
              .catch(() => undefined)
          }
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('savedViews.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('savedViews.deleteHint')}
        confirmLabel={t('savedViews.deleteConfirm')}
        pending={mutations.remove.isPending}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          void mutations.remove
            .mutateAsync(target.id)
            .then(() => setDeleting(null))
            .catch(onError);
        }}
      />
    </>
  );
}

function SaveDialog({
  canShare,
  pending,
  error,
  onClose,
  onSave,
}: {
  canShare: boolean;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (name: string, shared: boolean) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (value) onSave(value, shared);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('savedViews.saveCurrent')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <FormError error={error} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saved-view-name">{t('savedViews.name')}</Label>
              <Input
                id="saved-view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            {canShare && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                />
                {t('savedViews.share')}
              </label>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
