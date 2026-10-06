import { type Attachment, MAX_ATTACHMENTS_PER_ITEM } from '@scrum/shared';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import {
  type AttachmentScope,
  attachmentUrl,
  useDeleteAttachment,
  useUploadAttachment,
} from '../queries';

const formatSize = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Dosya ekleri (brief §5.17, ADR-056): sürükle-bırak yükleme, resim önizleme, indirme, silme. */
export function Attachments({
  itemId,
  attachments,
  canWrite,
  scope = 'items',
}: {
  /** Ekin sahibinin kimliği (görev ya da doküman sayfası). */
  itemId: string;
  attachments: Attachment[];
  canWrite: boolean;
  scope?: AttachmentScope;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (attachments.length === 0 && !canWrite) return null;

  const send = (files: FileList | File[]) => {
    // Dosyalar sırayla yüklenir; hata bir dosyada kalır, diğerleri devam eder.
    void (async () => {
      for (const file of Array.from(files)) {
        try {
          await upload.mutateAsync({ itemId, file, scope });
        } catch (error) {
          toast.error(`${file.name}: ${errorMessage(error)}`);
        }
      }
    })();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (canWrite && e.dataTransfer.files.length > 0) send(e.dataTransfer.files);
  };

  return (
    <section
      aria-labelledby="attachments-title"
      onDragOver={(e) => {
        if (canWrite) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn('rounded-md', dragging && 'ring-primary ring-2')}
    >
      <div className="mb-1 flex items-center gap-2">
        <h3 id="attachments-title" className="text-sm font-semibold">
          {t('attachments.title')}{' '}
          <span className="text-muted-foreground font-normal">{attachments.length}</span>
        </h3>
        {canWrite && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) send(e.target.files);
                e.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={upload.isPending || attachments.length >= MAX_ATTACHMENTS_PER_ITEM}
              onClick={() => input.current?.click()}
            >
              <Upload />
              {t('attachments.add')}
            </Button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-sm">
          {t('attachments.dropHint')}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((a) => {
            const isImage = a.previewable && a.mimeType.startsWith('image/');
            return (
              <li key={a.id} className="group/att flex items-center gap-2.5 rounded-md border p-2">
                {isImage ? (
                  <a
                    href={attachmentUrl(workspaceId, itemId, a.id, true, scope)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('attachments.preview', { name: a.fileName })}
                  >
                    <img
                      src={attachmentUrl(workspaceId, itemId, a.id, true, scope)}
                      alt=""
                      loading="lazy"
                      className="bg-muted size-12 rounded object-cover"
                    />
                  </a>
                ) : (
                  <span className="bg-muted flex size-12 shrink-0 items-center justify-center rounded">
                    {a.mimeType === 'application/pdf' ? (
                      <FileText className="size-5" aria-hidden />
                    ) : (
                      <Paperclip className="size-5" aria-hidden />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={attachmentUrl(workspaceId, itemId, a.id, a.previewable, scope)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium hover:underline"
                    title={a.fileName}
                  >
                    {a.fileName}
                  </a>
                  <span className="text-muted-foreground text-xs">
                    {formatSize(a.size)}
                    {a.uploader && ` · ${a.uploader.name}`}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="size-7" asChild>
                  <a
                    href={attachmentUrl(workspaceId, itemId, a.id, false, scope)}
                    download={a.fileName}
                    aria-label={t('attachments.download', { name: a.fileName })}
                  >
                    <Download />
                  </a>
                </Button>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t('attachments.delete', { name: a.fileName })}
                    onClick={() =>
                      remove.mutate(
                        { itemId, attachmentId: a.id, scope },
                        { onError: (error) => toast.error(errorMessage(error)) },
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
