import {
  formatBytes,
  SPACE_PERMISSIONS as S,
  VIDEO_EXTENSIONS,
  videoMimeOf,
  type Video,
  type VideoFolder,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Clapperboard,
  Folder,
  FolderOpen,
  FolderPlus,
  Inbox,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field } from '@/components/form';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ContainerHeader, LoadingState, NotFoundState } from '@/features/spaces/container-header';
import { spaceQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import {
  useCreateVideoFolder,
  useDeleteVideoFolder,
  useRenameVideoFolder,
  useStartVideo,
  videosQuery,
  videoStreamUrl,
} from './queries';
import { uploadVideoFile } from './upload';
import { VideoPlayerDialog } from './video-player-dialog';

/** Seçili görünüm: `'all'` tüm videolar, `'none'` klasörsüzler, aksi halde klasör kimliği. */
type Scope = string;

interface UploadJob {
  key: string;
  title: string;
  size: number;
  sent: number;
  state: 'uploading' | 'error';
  error?: string;
  abort: AbortController;
}

const ACCEPT = VIDEO_EXTENSIONS.map((e) => `.${e}`).join(',');
const titleOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '').slice(0, 200) || fileName;

/**
 * Video arşivi (Faz 15, ADR-129): Proje başına klasörlenebilen videolar. Dosyalar sürükleyip bırakılarak
 * ya da düğmeyle yüklenir; büyük dosyalar parça parça gider, ilerleme kartta görünür. Kart tıklanınca
 * oynatıcı açılır; başlık, açıklama ve klasör orada değiştirilir.
 */
export function VideoArchivePage({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const space = useQuery(spaceQuery(workspaceId, spaceId));
  const data = useQuery(videosQuery(workspaceId, spaceId));
  const start = useStartVideo(spaceId);
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<VideoFolder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Yükleme sürerken sayfadan çıkılırsa uyar (yarım kalan dosya sonra yeniden yüklenmeli).
  const uploading = jobs.some((j) => j.state === 'uploading');
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  const videos = useMemo(() => data.data?.videos ?? [], [data.data]);
  const folders = useMemo(() => data.data?.folders ?? [], [data.data]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return videos.filter(
      (v) =>
        (scope === 'all' || (scope === 'none' ? v.folderId === null : v.folderId === scope)) &&
        (!q || `${v.title} ${v.description} ${v.fileName}`.toLocaleLowerCase().includes(q)),
    );
  }, [videos, scope, query]);

  if (space.isPending || data.isPending) return <LoadingState />;
  if (space.isError || data.isError) return <NotFoundState />;

  const canWrite = space.data.permissions.includes(S.DOC_WRITE) && !space.data.archived;
  const { maxBytes, chunkBytes } = data.data;
  const folderId = scope === 'all' || scope === 'none' ? null : scope;

  const patchJob = (key: string, patch: Partial<UploadJob>) =>
    setJobs((list) => list.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  const upload = (files: File[]) => {
    for (const file of files) {
      if (!videoMimeOf(file.name)) {
        toast.error(t('videos.unsupported', { name: file.name }));
        continue;
      }
      if (file.size > maxBytes) {
        toast.error(t('videos.tooLarge', { name: file.name, max: formatBytes(maxBytes) }));
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const abort = new AbortController();
      const title = titleOf(file.name);
      setJobs((list) => [
        ...list,
        { key, title, size: file.size, sent: 0, state: 'uploading', abort },
      ]);
      void start
        .mutateAsync({ title, fileName: file.name, size: file.size, folderId })
        .then(({ id }) =>
          uploadVideoFile({
            workspaceId,
            videoId: id,
            file,
            chunkBytes,
            signal: abort.signal,
            onProgress: (sent) => patchJob(key, { sent }),
          }),
        )
        .then(() => {
          setJobs((list) => list.filter((j) => j.key !== key));
          toast.success(t('videos.uploaded', { title }));
          void data.refetch();
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setJobs((list) => list.filter((j) => j.key !== key));
            return;
          }
          patchJob(key, { state: 'error', error: errorMessage(error) });
        });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (canWrite) upload(Array.from(e.dataTransfer.files));
  };

  const scopeTitle =
    scope === 'all'
      ? t('videos.all')
      : scope === 'none'
        ? t('videos.unfiled')
        : (folders.find((f) => f.id === scope)?.name ?? '');

  return (
    <>
      <ContainerHeader
        type="SPACE"
        id={space.data.id}
        name={space.data.name}
        archived={space.data.archived}
        canUnarchive={space.data.permissions.includes(S.SPACE_SETTINGS)}
      />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside aria-label={t('videos.folders')} className="flex flex-col gap-1">
          <div className="mb-1 flex items-center gap-1">
            <h2 className="flex-1 text-sm font-semibold">{t('videos.folders')}</h2>
            {canWrite && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={t('videos.newFolder')}
                onClick={() => setFolderDialog({ kind: 'create', parentId: null })}
              >
                <FolderPlus />
              </Button>
            )}
          </div>
          <ScopeButton
            active={scope === 'all'}
            icon={<Clapperboard className="size-4" />}
            label={t('videos.all')}
            count={videos.length}
            onClick={() => setScope('all')}
          />
          <ScopeButton
            active={scope === 'none'}
            icon={<Inbox className="size-4" />}
            label={t('videos.unfiled')}
            count={videos.filter((v) => v.folderId === null).length}
            onClick={() => setScope('none')}
          />
          <FolderTree
            folders={folders}
            videos={videos}
            parentId={null}
            depth={0}
            scope={scope}
            canWrite={canWrite}
            onSelect={setScope}
            onAdd={(parentId) => setFolderDialog({ kind: 'create', parentId })}
            onRename={(folder) => setFolderDialog({ kind: 'rename', folder })}
            onDelete={setDeletingFolder}
          />
        </aside>

        <section
          aria-label={t('videos.title')}
          onDragOver={(e) => {
            if (!canWrite) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'relative min-w-0 rounded-xl transition-colors',
            dragOver && 'ring-primary bg-primary/5 ring-2',
          )}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-lg font-semibold">{scopeTitle}</h1>
            <div className="relative w-full sm:w-64">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('videos.search')}
                aria-label={t('videos.search')}
                className="h-9 pl-8"
              />
            </div>
            {canWrite && (
              <Button onClick={() => fileInput.current?.click()}>
                <Upload /> {t('videos.upload')}
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              data-testid="video-input"
              onChange={(e) => {
                upload(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </div>

          {jobs.length > 0 && (
            <ul className="mb-4 flex flex-col gap-2" aria-label={t('videos.uploads')}>
              {jobs.map((job) => (
                <UploadRow
                  key={job.key}
                  job={job}
                  onCancel={() => {
                    job.abort.abort();
                    setJobs((list) => list.filter((j) => j.key !== job.key));
                  }}
                />
              ))}
            </ul>
          )}

          {shown.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center text-sm">
              <Clapperboard className="size-8 opacity-50" aria-hidden />
              <p>{query ? t('videos.noResults') : t('videos.empty')}</p>
              {canWrite && !query && (
                <p className="text-xs">
                  {t('videos.dropHint', {
                    max: formatBytes(maxBytes),
                    types: VIDEO_EXTENSIONS.join(', '),
                  })}
                </p>
              )}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  workspaceId={workspaceId}
                  folderName={folders.find((f) => f.id === video.folderId)?.name}
                  onOpen={() => setPlaying(video.id)}
                />
              ))}
            </ul>
          )}
          {dragOver && (
            <div className="bg-primary/10 text-primary pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl text-sm font-semibold">
              <Upload className="mr-2 size-5" /> {t('videos.dropHere')}
            </div>
          )}
        </section>
      </div>

      <VideoPlayerDialog
        spaceId={spaceId}
        video={videos.find((v) => v.id === playing) ?? null}
        folders={folders}
        canWrite={canWrite}
        onClose={() => setPlaying(null)}
      />
      <FolderDialog
        spaceId={spaceId}
        state={folderDialog}
        onClose={() => setFolderDialog(null)}
        onCreated={(id) => setScope(id)}
      />
      <DeleteFolderDialog
        spaceId={spaceId}
        folder={deletingFolder}
        onClose={() => setDeletingFolder(null)}
        onDeleted={(id) => setScope((s) => (s === id ? 'all' : s))}
      />
    </>
  );
}

function ScopeButton({
  active,
  icon,
  label,
  count,
  depth = 0,
  className,
  onClick,
}: {
  className?: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  count: number;
  depth?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg pr-2 text-left text-sm transition-colors',
        active ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent',
        className,
      )}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{count}</span>
    </button>
  );
}

function FolderTree({
  folders,
  videos,
  parentId,
  depth,
  scope,
  canWrite,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  folders: VideoFolder[];
  videos: Video[];
  parentId: string | null;
  depth: number;
  scope: Scope;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onAdd: (parentId: string) => void;
  onRename: (folder: VideoFolder) => void;
  onDelete: (folder: VideoFolder) => void;
}) {
  const { t } = useTranslation();
  const children = folders.filter((f) => f.parentId === parentId);
  if (children.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {children.map((folder) => (
        <li key={folder.id}>
          <div className="group/folder flex items-center">
            <ScopeButton
              active={scope === folder.id}
              icon={
                scope === folder.id ? (
                  <FolderOpen className="size-4" />
                ) : (
                  <Folder className="size-4" />
                )
              }
              label={folder.name}
              count={videos.filter((v) => v.folderId === folder.id).length}
              depth={depth}
              className="flex-1"
              onClick={() => onSelect(folder.id)}
            />
            {canWrite && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 opacity-60 group-hover/folder:opacity-100"
                    aria-label={t('videos.folderActions', { name: folder.name })}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onAdd(folder.id)}>
                    <FolderPlus /> {t('videos.newSubfolder')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onRename(folder)}>
                    <Pencil /> {t('videos.renameFolder')}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(folder)}>
                    <Trash2 /> {t('videos.deleteFolder')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <FolderTree
            folders={folders}
            videos={videos}
            parentId={folder.id}
            depth={depth + 1}
            scope={scope}
            canWrite={canWrite}
            onSelect={onSelect}
            onAdd={onAdd}
            onRename={onRename}
            onDelete={onDelete}
          />
        </li>
      ))}
    </ul>
  );
}

function UploadRow({ job, onCancel }: { job: UploadJob; onCancel: () => void }) {
  const { t } = useTranslation();
  const percent = Math.min(100, Math.round((job.sent / job.size) * 100));
  return (
    <li className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
      <Upload className="text-primary size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{job.title}</span>
          <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
            {job.state === 'error'
              ? job.error
              : `${formatBytes(job.sent)} / ${formatBytes(job.size)} · %${percent}`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('videos.uploading', { title: job.title })}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              job.state === 'error' ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label={t('videos.cancelUpload')}
        onClick={onCancel}
      >
        <X />
      </Button>
    </li>
  );
}

/** Kart: görünür olunca küçük resim için yalnızca ilk kare istenir (yüzlerce video olsa da hafif). */
function VideoCard({
  video,
  workspaceId,
  folderName,
  onOpen,
}: {
  video: Video;
  workspaceId: string;
  folderName?: string;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  const ready = video.status === 'READY';

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!ready}
        aria-label={t('videos.open', { title: video.title })}
        className="group bg-card hover:border-primary/40 flex w-full flex-col overflow-hidden rounded-xl border text-left shadow-xs transition-[border-color,box-shadow] hover:shadow-md disabled:cursor-default"
      >
        <div className="relative aspect-video w-full bg-neutral-900">
          {ready && visible && (
            <video
              src={`${videoStreamUrl(workspaceId, video.id)}#t=1`}
              preload="metadata"
              muted
              playsInline
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              className="h-full w-full object-cover"
            />
          )}
          {!ready && (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-white/80">
              {t('videos.processing')}
            </span>
          )}
          {duration !== null && Number.isFinite(duration) && (
            <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {formatDuration(duration)}
            </span>
          )}
          {ready && (
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
              <span className="bg-primary/90 flex size-12 items-center justify-center rounded-full text-white shadow-lg">
                ▶
              </span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="truncate text-sm font-semibold">{video.title}</span>
          <span className="text-muted-foreground truncate text-xs">
            {[
              folderName,
              formatBytes(video.size),
              new Date(video.createdAt).toLocaleDateString(i18n.language),
              video.uploadedBy?.name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </button>
    </li>
  );
}

function formatDuration(seconds: number): string {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

type FolderDialogState =
  { kind: 'create'; parentId: string | null } | { kind: 'rename'; folder: VideoFolder };

function FolderDialog({
  spaceId,
  state,
  onClose,
  onCreated,
}: {
  spaceId: string;
  state: FolderDialogState | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm" closeLabel={t('common.close')}>
        {state && (
          <FolderForm spaceId={spaceId} state={state} onClose={onClose} onCreated={onCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FolderForm({
  spaceId,
  state,
  onClose,
  onCreated,
}: {
  spaceId: string;
  state: FolderDialogState;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateVideoFolder(spaceId);
  const rename = useRenameVideoFolder(spaceId);
  const [name, setName] = useState(state.kind === 'rename' ? state.folder.name : '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) return;
    const done =
      state.kind === 'create'
        ? create
            .mutateAsync({ name: value, parentId: state.parentId })
            .then(({ id }) => onCreated(id))
        : rename.mutateAsync({ folderId: state.folder.id, name: value });
    void done.then(onClose).catch((error) => toast.error(errorMessage(error)));
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {state.kind === 'rename' ? t('videos.renameFolder') : t('videos.newFolder')}
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <Field
          label={t('videos.folderName')}
          value={name}
          maxLength={100}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim() || create.isPending || rename.isPending}>
          {t('common.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteFolderDialog({
  spaceId,
  folder,
  onClose,
  onDeleted,
}: {
  spaceId: string;
  folder: VideoFolder | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const remove = useDeleteVideoFolder(spaceId);
  return (
    <ConfirmDialog
      open={folder !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('videos.deleteFolderTitle', { name: folder?.name ?? '' })}
      description={t('videos.deleteFolderBody')}
      confirmLabel={t('videos.deleteFolder')}
      pending={remove.isPending}
      onConfirm={() => {
        if (!folder) return;
        remove.mutate(folder.id, {
          onSuccess: () => {
            onDeleted(folder.id);
            onClose();
          },
          onError: (error) => toast.error(errorMessage(error)),
        });
      }}
    />
  );
}
