import { useNavigate, useRouterState } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field, FormError, SelectField } from '@/components/form';
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
import {
  type StructureActions,
  StructureActionsContext,
  type StructureDialog,
} from './actions-context';
import { CreateSpaceDialog } from './create-space-dialog';
import {
  type ContainerType,
  useCreateFolder,
  useCreateList,
  useFavorite,
  useHierarchy,
  useLifecycle,
  useMove,
  useRename,
} from './queries';

/** Yapı işlemlerinin pencerelerini tek yerde tutar; AppShell içinde bir kez kullanılır. */
export function StructureActionsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const errorMessage = useErrorMessage();
  const lifecycle = useLifecycle();
  const favorite = useFavorite();
  const [dialog, setDialog] = useState<StructureDialog | null>(null);
  const close = () => setDialog(null);

  const actions: StructureActions = (() => {
    const run = (
      type: ContainerType,
      id: string,
      action: 'archive' | 'unarchive' | 'delete' | 'restore',
      onSuccess?: () => void,
    ) =>
      lifecycle.mutate(
        { type, id, action },
        { onSuccess, onError: (error) => toast.error(errorMessage(error)) },
      );
    return {
      open: setDialog,
      archive: (type, id, name) =>
        run(type, id, 'archive', () =>
          toast.success(t('structure.archived', { name }), {
            action: { label: t('structure.undo'), onClick: () => run(type, id, 'unarchive') },
          }),
        ),
      unarchive: (type, id) =>
        run(type, id, 'unarchive', () => toast.success(t('structure.unarchived'))),
      restore: (type, id) => run(type, id, 'restore', () => toast.success(t('structure.restored'))),
      setFavorite: (type, id, value) =>
        favorite.mutate(
          { type, id, favorite: value },
          { onError: (error) => toast.error(errorMessage(error)) },
        ),
    };
  })();

  const confirmDelete = (d: Extract<StructureDialog, { kind: 'delete' }>) =>
    lifecycle.mutate(
      { type: d.type, id: d.id, action: 'delete' },
      {
        onSuccess: () => {
          close();
          // Silinen öğenin (veya içindekinin) sayfasındaysak ana sayfaya dön.
          if (pathname.includes(d.id)) void navigate({ to: '/' });
          toast.success(t('structure.trashed', { name: d.name }), {
            action: {
              label: t('structure.undo'),
              onClick: () => actions.restore(d.type, d.id),
            },
          });
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <StructureActionsContext.Provider value={actions}>
      {children}
      <CreateSpaceDialog
        open={dialog?.kind === 'createSpace'}
        onOpenChange={(open) => !open && close()}
      />
      {dialog?.kind === 'createFolder' && (
        <CreateFolderDialog spaceId={dialog.spaceId} onDone={close} />
      )}
      {dialog?.kind === 'createList' && (
        <CreateListDialog spaceId={dialog.spaceId} folderId={dialog.folderId} onDone={close} />
      )}
      {dialog?.kind === 'rename' && <RenameDialog dialog={dialog} onDone={close} />}
      {dialog?.kind === 'moveList' && <MoveListDialog dialog={dialog} onDone={close} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={t('structure.deleteTitle', { name: dialog.name })}
          description={t('structure.deleteBody')}
          confirmLabel={t('structure.delete')}
          pending={lifecycle.isPending}
          onConfirm={() => confirmDelete(dialog)}
        />
      )}
    </StructureActionsContext.Provider>
  );
}

/** Ad + isteğe bağlı ek alanlarla küçük form penceresi. */
function NameDialog({
  title,
  initialName,
  submitLabel,
  pending,
  error,
  onSubmit,
  onDone,
  children,
}: {
  title: string;
  initialName: string;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (name: string) => void;
  onDone: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [invalid, setInvalid] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    setInvalid(value.length === 0);
    if (value) onSubmit(value);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field
              label={t('structure.name')}
              value={name}
              maxLength={80}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              error={invalid ? { type: 'too_small' } : undefined}
              onChange={(e) => setName(e.target.value)}
            />
            {children}
            {error ? <FormError error={error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateFolderDialog({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateFolder();
  return (
    <NameDialog
      title={t('structure.newFolder')}
      initialName=""
      submitLabel={t('structure.create')}
      pending={create.isPending}
      error={create.error}
      onDone={onDone}
      onSubmit={(name) => create.mutate({ spaceId, name }, { onSuccess: onDone })}
    />
  );
}

/** Konum seçici: Space kökü veya Space'in Folder'ları. */
function LocationSelect({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string;
  value: string | null;
  onChange: (folderId: string | null) => void;
}) {
  const { t } = useTranslation();
  const space = useHierarchy().data?.spaces.find((s) => s.id === spaceId);
  if (!space) return null;
  return (
    <SelectField
      label={t('structure.location')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t('structure.spaceRoot', { space: space.name })}</option>
      {space.folders.map((f) => (
        <option key={f.id} value={f.id}>
          {space.name} › {f.name}
        </option>
      ))}
    </SelectField>
  );
}

function CreateListDialog({
  spaceId,
  folderId: initialFolder,
  onDone,
}: {
  spaceId: string;
  folderId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateList();
  const [folderId, setFolderId] = useState(initialFolder);
  return (
    <NameDialog
      title={t('structure.newList')}
      initialName=""
      submitLabel={t('structure.create')}
      pending={create.isPending}
      error={create.error}
      onDone={onDone}
      onSubmit={(name) =>
        create.mutate(
          { spaceId, name, folderId },
          {
            onSuccess: ({ id }) => {
              onDone();
              void navigate({ to: '/lists/$listId', params: { listId: id } });
            },
          },
        )
      }
    >
      <LocationSelect spaceId={spaceId} value={folderId} onChange={setFolderId} />
    </NameDialog>
  );
}

function RenameDialog({
  dialog,
  onDone,
}: {
  dialog: Extract<StructureDialog, { kind: 'rename' }>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const rename = useRename();
  return (
    <NameDialog
      title={t(dialog.type === 'FOLDER' ? 'structure.renameFolder' : 'structure.renameList')}
      initialName={dialog.name}
      submitLabel={t('common.save')}
      pending={rename.isPending}
      error={rename.error}
      onDone={onDone}
      onSubmit={(name) =>
        rename.mutate({ type: dialog.type, id: dialog.id, name }, { onSuccess: onDone })
      }
    />
  );
}

/** List'i aynı Space içinde başka Folder'a veya köke taşır; hedefin sonuna eklenir. */
function MoveListDialog({
  dialog,
  onDone,
}: {
  dialog: Extract<StructureDialog, { kind: 'moveList' }>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const move = useMove();
  const space = useHierarchy().data?.spaces.find((s) => s.id === dialog.spaceId);
  const [folderId, setFolderId] = useState(dialog.folderId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!space || folderId === dialog.folderId) return onDone();
    const target = folderId
      ? (space.folders.find((f) => f.id === folderId)?.lists ?? [])
      : space.lists;
    move.mutate(
      { type: 'LIST', id: dialog.id, folderId, afterId: target.at(-1)?.id ?? null },
      { onSuccess: onDone },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="max-w-md" closeLabel={t('common.close')}>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{t('structure.moveTitle', { name: dialog.name })}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <LocationSelect spaceId={dialog.spaceId} value={folderId} onChange={setFolderId} />
            {move.error ? <FormError error={move.error} /> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={move.isPending}>
              {t('structure.moveSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
