import { formatBytes, type Video, type VideoFolder } from '@scrum/shared';
import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SelectField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { useDeleteVideo, useUpdateVideo, videoStreamUrl } from './queries';

const NO_FOLDER = '__none';

/**
 * Oynatıcı: büyük video (ileri sarma Range ile), altında başlık, açıklama ve klasör. Değişiklikler alan
 * odaktan çıkınca kaydedilir; yazma yetkisi yoksa salt okunur.
 */
export function VideoPlayerDialog({
  spaceId,
  video,
  folders,
  canWrite,
  onClose,
}: {
  spaceId: string;
  video: Video | null;
  folders: VideoFolder[];
  canWrite: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl" closeLabel={t('common.close')}>
        {video && (
          <PlayerBody
            key={video.id}
            spaceId={spaceId}
            video={video}
            folders={folders}
            canWrite={canWrite}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlayerBody({
  spaceId,
  video,
  folders,
  canWrite,
  onClose,
}: {
  spaceId: string;
  video: Video;
  folders: VideoFolder[];
  canWrite: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const update = useUpdateVideo(spaceId);
  const remove = useDeleteVideo(spaceId);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = (body: Parameters<typeof update.mutate>[0]['body']) =>
    update.mutate(
      { videoId: video.id, body },
      {
        onSuccess: () => toast.success(t('videos.saved')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  const src = videoStreamUrl(workspaceId, video.id);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate pr-8">{video.title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <video
          src={src}
          controls
          autoPlay
          playsInline
          className="aspect-video w-full rounded-lg bg-black"
          data-testid="video-player"
        />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('videos.titleLabel')}
              <Input
                value={title}
                readOnly={!canWrite}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  const next = title.trim();
                  if (next && next !== video.title) save({ title: next });
                  else setTitle(video.title);
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('videos.description')}
              <Textarea
                value={description}
                readOnly={!canWrite}
                rows={3}
                maxLength={5000}
                placeholder={canWrite ? t('videos.descriptionPlaceholder') : undefined}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== video.description) save({ description });
                }}
              />
            </label>
          </div>
          <div className="flex flex-col gap-3">
            <SelectField
              label={t('videos.folder')}
              value={video.folderId ?? NO_FOLDER}
              disabled={!canWrite}
              onChange={(e) =>
                save({ folderId: e.target.value === NO_FOLDER ? null : e.target.value })
              }
            >
              <option value={NO_FOLDER}>{t('videos.unfiled')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </SelectField>
            <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt>{t('videos.file')}</dt>
              <dd className="truncate">{video.fileName}</dd>
              <dt>{t('videos.size')}</dt>
              <dd>{formatBytes(video.size)}</dd>
              <dt>{t('videos.uploadedAt')}</dt>
              <dd>{new Date(video.createdAt).toLocaleString(i18n.language)}</dd>
              {video.uploadedBy && (
                <>
                  <dt>{t('videos.uploader')}</dt>
                  <dd className="truncate">{video.uploadedBy.name}</dd>
                </>
              )}
            </dl>
            <div className="mt-auto flex gap-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <a href={src} download={video.fileName}>
                  <Download /> {t('videos.download')}
                </a>
              </Button>
              {canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  aria-label={t('videos.delete')}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogBody>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('videos.deleteTitle', { title: video.title })}
        description={t('videos.deleteBody')}
        confirmLabel={t('videos.delete')}
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(video.id, {
            onSuccess: () => {
              toast.success(t('videos.deleted'));
              setConfirmDelete(false);
              onClose();
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </>
  );
}
