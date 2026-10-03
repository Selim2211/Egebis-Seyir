import { isInSubtree, type DocNodeDto } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichTextView } from '@/features/work-items/detail/rich-text-view';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatDate } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import {
  docVersionQuery,
  docVersionsQuery,
  docsTrashQuery,
  useMoveDoc,
  useRestoreDoc,
  useRestoreVersion,
} from './queries';

/** "Taşı…": sayfayı başka bir üst sayfanın altına (ya da köke) taşır; kendi dalı seçilemez. */
export function MoveDocDialog({
  spaceId,
  doc,
  docs,
  onClose,
}: {
  spaceId: string;
  doc: DocNodeDto;
  docs: readonly DocNodeDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const move = useMoveDoc(spaceId);
  const [parentId, setParentId] = useState(doc.parentId ?? '');
  const candidates = docs.filter((d) => !isInSubtree(docs, doc.id, d.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('docs.moveTitle', { title: doc.title })}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <label className="flex flex-col gap-1.5 text-sm">
            {t('docs.newParent')}
            <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t('docs.root')}</option>
              {candidates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </NativeSelect>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={move.isPending}
            onClick={() =>
              void move
                .mutateAsync({ docId: doc.id, parentId: parentId || null, afterId: null })
                .then(onClose)
                .catch((error) => toast.error(errorMessage(error)))
            }
          >
            {t('docs.move')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sürüm geçmişi: sürümleri listeler, seçileni önizler, sürüme geri döner. */
export function VersionsDialog({
  spaceId,
  docId,
  canWrite,
  onClose,
  onRestored,
}: {
  spaceId: string;
  docId: string;
  canWrite: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const list = useQuery(docVersionsQuery(workspaceId, docId));
  const [picked, setPicked] = useState<number | null>(null);
  const restore = useRestoreVersion(spaceId);
  const versions = list.data?.versions ?? [];
  const selected = picked ?? versions[0]?.version ?? null;
  const preview = useQuery({
    ...docVersionQuery(workspaceId, docId, selected ?? 0),
    enabled: selected !== null,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('docs.versionsTitle')}</DialogTitle>
          <DialogDescription>{t('docs.versionsHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <ul
            aria-label={t('docs.versions')}
            className="flex max-h-80 flex-col gap-1 overflow-y-auto"
          >
            {versions.map((v) => (
              <li key={v.version}>
                <button
                  type="button"
                  onClick={() => setPicked(v.version)}
                  aria-pressed={selected === v.version}
                  className={cn(
                    'hover:bg-accent/60 w-full rounded-md border px-2.5 py-1.5 text-left text-sm',
                    selected === v.version && 'bg-accent border-primary/40',
                  )}
                >
                  <span className="block font-medium">
                    {t('docs.versionLabel', { version: v.version })}
                    {v.current && (
                      <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                        ({t('docs.currentVersion')})
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {v.author?.name ?? '—'} · {formatDate(v.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section
            aria-label={t('docs.preview')}
            className="max-h-80 min-w-0 overflow-y-auto rounded-md border p-3"
          >
            {preview.isPending ? (
              <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
            ) : preview.isError ? (
              <p className="text-destructive text-sm">{errorMessage(preview.error)}</p>
            ) : (
              <>
                <h3 className="mb-2 text-base font-semibold">{preview.data.title}</h3>
                {preview.data.content ? (
                  <RichTextView doc={preview.data.content} />
                ) : (
                  <p className="text-muted-foreground text-sm">{t('docs.emptyVersion')}</p>
                )}
              </>
            )}
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canWrite && selected !== null && !preview.data?.current && (
            <Button
              disabled={restore.isPending || !preview.data}
              onClick={() =>
                void restore
                  .mutateAsync({ docId, version: selected })
                  .then(() => {
                    toast.success(t('docs.versionRestored', { version: selected }));
                    onRestored();
                  })
                  .catch((error) => toast.error(errorMessage(error)))
              }
            >
              <RotateCcw /> {t('docs.restoreVersion')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Çöp kutusu: silinen sayfa dalları 30 gün saklanır, geri getirilebilir. */
export function TrashDialog({
  spaceId,
  canWrite,
  onClose,
  onRestored,
}: {
  spaceId: string;
  canWrite: boolean;
  onClose: () => void;
  onRestored: (id: string) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const trash = useQuery(docsTrashQuery(workspaceId, spaceId));
  const restore = useRestoreDoc(spaceId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('docs.trashTitle')}</DialogTitle>
          <DialogDescription>{t('docs.trashHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {trash.isPending ? (
            <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
          ) : (trash.data?.docs.length ?? 0) === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t('docs.trashEmpty')}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {trash.data!.docs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restore.isPending}
                      aria-label={t('docs.restoreNamed', { title: d.title })}
                      onClick={() =>
                        void restore
                          .mutateAsync(d.id)
                          .then(() => onRestored(d.id))
                          .catch((error) => toast.error(errorMessage(error)))
                      }
                    >
                      <RotateCcw /> {t('docs.restore')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
