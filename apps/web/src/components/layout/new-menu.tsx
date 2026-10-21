import { listName } from '@/lib/default-names';
import { SPACE_PERMISSIONS as S, type TreeSpace, type WorkItemType } from '@scrum/shared';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  Bug,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  FolderKanban,
  Paperclip,
  Plus,
  X,
  Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, SelectField, Field } from '@/components/form';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SprintDialog } from '@/features/sprints/sprint-dialog';
import { sprintsQuery } from '@/features/sprints/queries';
import { spaceQuery, useHierarchy } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { creatableTypes } from '@/features/work-items/item-tree';
import { useCreateItem, useUploadAttachment } from '@/features/work-items/queries';
import { useErrorMessage } from '@/lib/use-error-message';

const ITEM_ICONS = { EPIC: Zap, TASK: CheckSquare, BUG: Bug } as const;
const MENU_TYPES = ['TASK', 'EPIC', 'BUG'] as const;

/** Kullanıcının öğe oluşturabildiği Space'ler ve içlerindeki Liste'ler. */
function writableSpaces(spaces: TreeSpace[] | undefined) {
  return (spaces ?? [])
    .filter((space) => space.permissions.includes(S.WORK_ITEM_WRITE))
    .map((space) => ({
      space,
      lists: [...space.folders.flatMap((folder) => folder.lists), ...space.lists],
    }))
    .filter((entry) => entry.lists.length > 0);
}

/**
 * Üst çubuktaki büyük "+ New" düğmesi: Task / Epic / Bug oluşturma tek yerden.
 * Kısayol: N (metin girişi dışında).
 */
export function NewMenu() {
  const { t } = useTranslation();
  const { data } = useHierarchy();
  const targets = writableSpaces(data?.spaces);
  const [menuOpen, setMenuOpen] = useState(false);
  const [itemType, setItemType] = useState<WorkItemType | null>(null);
  const [sprintOpen, setSprintOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const openSpace = /^\/spaces\/([0-9a-f-]{36})/.exec(pathname)?.[1];
  const currentSpaceId =
    targets.find((target) => target.space.id === openSpace)?.space.id ?? targets[0]?.space.id ?? '';
  // Sprint yalnızca Scrum Proje'sinde ve sprint planlama yetkisiyle oluşturulur.
  const sprintSpaces = (data?.spaces ?? []).filter(
    (space) => space.scrumEnabled && space.permissions.includes(S.SPRINT_PLAN),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"]',
      );
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
        e.preventDefault();
        setMenuOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (targets.length === 0 && sprintSpaces.length === 0) return null;

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="cta"
            size="xl"
            aria-keyshortcuts="N"
            data-testid="new-menu"
            aria-label={t('newMenu.button')}
          >
            <Plus className="size-5" aria-hidden />
            <span>{t('newMenu.button')}</span>
            <ChevronDown className="size-4 opacity-80" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-2">
          {sprintSpaces.length > 0 && (
            <>
              <DropdownMenuItem
                className="gap-3 py-2.5 text-base"
                data-testid="new-sprint"
                onSelect={() => setSprintOpen(true)}
              >
                <CalendarRange className="text-primary size-5" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-medium">{t('newMenu.SPRINT')}</span>
                  <span className="text-muted-foreground text-xs">{t('newMenu.SPRINTHint')}</span>
                </span>
              </DropdownMenuItem>
              {targets.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {targets.length > 0 &&
            MENU_TYPES.map((type) => {
              const Icon = ITEM_ICONS[type];
              return (
                <DropdownMenuItem
                  key={type}
                  className="gap-3 py-2.5 text-base"
                  onSelect={() =>
                    type === 'BUG'
                      ? void navigate({
                          to: '/spaces/$spaceId/bugs',
                          params: { spaceId: currentSpaceId },
                          search: { report: true },
                        })
                      : setItemType(type)
                  }
                >
                  <Icon className="text-primary size-5" aria-hidden />
                  <span className="flex flex-col">
                    <span className="font-medium">{t(`newMenu.${type}`)}</span>
                    <span className="text-muted-foreground text-xs">
                      {t(`newMenu.${type}Hint`)}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>

      {sprintOpen && (
        <NewSprintFlow
          spaces={sprintSpaces}
          preferredId={openSpace}
          onClose={() => setSprintOpen(false)}
        />
      )}
      <NewItemDialog
        type={itemType}
        onOpenChange={(open) => !open && setItemType(null)}
        targets={targets}
      />
    </>
  );
}

/**
 * Sprint oluşturma: Proje sayfasındaki ile aynı pencere. Açık sayfa uygun bir Scrum Proje'siyse onu,
 * tek uygun Proje varsa onu kullanır; birden fazlaysa önce hangi Proje için olduğu sorulur.
 */
function NewSprintFlow({
  spaces,
  preferredId,
  onClose,
}: {
  spaces: TreeSpace[];
  preferredId: string | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(
    spaces.find((space) => space.id === preferredId)?.id ??
      (spaces.length === 1 ? spaces[0]!.id : null),
  );
  const [choice, setChoice] = useState(spaces[0]!.id);

  if (picked) return <NewSprintDialog spaceId={picked} onClose={onClose} />;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" closeLabel="×">
        <DialogHeader>
          <DialogTitle className="text-xl">{t('newMenu.sprintPickTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <SelectField
            label={t('newMenu.space')}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </SelectField>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => setPicked(choice)}>
            {t('newMenu.sprintPickContinue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSprintDialog({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const { id: workspaceId } = useCurrentWorkspace();
  const navigate = useNavigate();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const sprints = useQuery(sprintsQuery(workspaceId, spaceId));
  if (!space.data || !sprints.data) return null;
  return (
    <SprintDialog
      open
      onOpenChange={(open) => !open && onClose()}
      spaceId={spaceId}
      weeks={space.data.sprintLengthWeeks}
      existing={sprints.data.sprints}
      onCreated={() => void navigate({ to: '/spaces/$spaceId/backlog', params: { spaceId } })}
    />
  );
}

function NewItemDialog({
  type,
  targets,
  onOpenChange,
}: {
  type: WorkItemType | null;
  targets: ReturnType<typeof writableSpaces>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={type !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel="×">
        {type && <NewItemForm type={type} targets={targets} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewItemForm({
  type,
  targets,
  onDone,
}: {
  type: WorkItemType;
  targets: ReturnType<typeof writableSpaces>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateItem();
  const upload = useUploadAttachment();
  const errorMessage = useErrorMessage();
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // Açık sayfanın Space/List'i varsayılan hedeftir (adresten okunur; üst çubuk rota dışındadır).
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const open = /^\/(spaces|lists)\/([0-9a-f-]{36})/.exec(pathname);
  const itemKey = /^\/items\/([A-Za-z][A-Za-z0-9]*)-\d+/.exec(pathname)?.[1]?.toUpperCase();
  const params: { spaceId?: string; listId?: string; spaceKey?: string } = {
    spaceId: open?.[1] === 'spaces' ? open[2] : undefined,
    listId: open?.[1] === 'lists' ? open[2] : undefined,
    spaceKey: itemKey,
  };
  // Açık olan Space/List varsayılan hedeftir; yoksa ilk Space.
  const current =
    targets.find(
      (target) =>
        target.space.id === params.spaceId ||
        target.space.key === params.spaceKey ||
        target.lists.some((l) => l.id === params.listId),
    ) ?? targets[0]!;
  const [spaceId, setSpaceId] = useState(current.space.id);
  const entry = targets.find((target) => target.space.id === spaceId) ?? targets[0]!;
  const [listId, setListId] = useState(
    entry.lists.find((l) => l.id === params.listId)?.id ?? entry.lists[0]!.id,
  );
  const [title, setTitle] = useState('');
  const [error, setError] = useState<unknown>(null);
  const allowed = creatableTypes(entry.space.scrumEnabled, null);
  const effectiveType = allowed.includes(type) ? type : (allowed[0] ?? type);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setError(null);
    create.mutate(
      { listId, body: { type: effectiveType, title: value, parentId: null } },
      {
        onSuccess: ({ id, key }) => {
          void (async () => {
            // Seçilen dosyalar öğe oluşunca sırayla yüklenir; hata bir dosyada kalır.
            for (const file of files) {
              try {
                await upload.mutateAsync({ itemId: id, file });
              } catch (uploadError) {
                toast.error(`${file.name}: ${errorMessage(uploadError)}`);
              }
            }
            toast.success(t('items.created', { key }));
            onDone();
            void navigate({ to: '/items/$key', params: { key } });
          })();
        },
        onError: setError,
      },
    );
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <FolderKanban className="text-primary size-5" aria-hidden />
          {t(`newMenu.dialog.${effectiveType}`)}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Field
          label={t('items.title')}
          value={title}
          maxLength={500}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('newMenu.space')}
            value={entry.space.id}
            onChange={(e) => {
              const next = targets.find((target) => target.space.id === e.target.value)!;
              setSpaceId(next.space.id);
              setListId(next.lists[0]!.id);
            }}
          >
            {targets.map(({ space }) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('newMenu.list')}
            value={listId}
            onChange={(e) => setListId(e.target.value)}
          >
            {entry.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {listName(list.name)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="new-item-files"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setFiles((prev) => [...prev, ...picked]);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip aria-hidden /> {t('newMenu.attach')}
          </Button>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="bg-muted flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs"
                >
                  <span className="max-w-48 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={t('newMenu.removeFile', { name: file.name })}
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FormError error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={create.isPending || upload.isPending || !title.trim()}
        >
          <Plus aria-hidden /> {t('newMenu.create')}
        </Button>
      </DialogFooter>
    </form>
  );
}
