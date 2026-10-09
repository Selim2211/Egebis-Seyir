import type { SprintImportResult, SprintSummary } from '@scrum/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
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
import { useTreeSpace } from '@/features/spaces/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { useImportSprint } from './queries';

/**
 * Excel'den sprint içe aktarma (Faz 8.4): dosya seçilince önce doğrulanır (önizleme), sonra
 * onayla yazılır. Yeni öğeler seçilen List'e açılır; sprint dosyadan açılır ya da mevcut biri seçilir.
 */
export function SprintImportDialog({
  open,
  onOpenChange,
  spaceId,
  sprints,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** Eklenebilecek açık sprint'ler. */
  sprints: readonly SprintSummary[];
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const space = useTreeSpace(spaceId);
  const lists = useMemo(
    () => (space ? [...space.lists, ...space.folders.flatMap((f) => f.lists)] : []),
    [space],
  );
  const mutation = useImportSprint(spaceId);
  const [file, setFile] = useState<File | null>(null);
  const [listId, setListId] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [preview, setPreview] = useState<SprintImportResult | null>(null);
  const effectiveList = listId || lists[0]?.id || '';

  /** Dosya ya da hedef değişince yeniden doğrular (yazmadan). */
  const check = (next: { file: File | null; listId: string; sprintId: string }) => {
    setPreview(null);
    mutation.reset();
    if (!next.file || !next.listId) return;
    mutation.mutate(
      { file: next.file, listId: next.listId, sprintId: next.sprintId || undefined, dryRun: true },
      { onSuccess: setPreview },
    );
  };

  const apply = () => {
    if (!file || !effectiveList) return;
    mutation.mutate(
      { file, listId: effectiveList, sprintId: sprintId || undefined, dryRun: false },
      {
        onSuccess: (result) => {
          toast.success(
            t('sprintImport.done', {
              name: result.sprintName ?? '',
              created: result.created,
              updated: result.updated,
              links: result.links,
            }),
          );
          onOpenChange(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const pending = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sprintImport.title')}</DialogTitle>
          <DialogDescription>{t('sprintImport.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('sprintImport.file')}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                check({ file: next, listId: effectiveList, sprintId });
              }}
              className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('sprintImport.list')}
            <NativeSelect
              value={effectiveList}
              onChange={(e) => {
                setListId(e.target.value);
                check({ file, listId: e.target.value, sprintId });
              }}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('sprintImport.target')}
            <NativeSelect
              value={sprintId}
              onChange={(e) => {
                setSprintId(e.target.value);
                check({ file, listId: effectiveList, sprintId: e.target.value });
              }}
            >
              <option value="">{t('sprintImport.newSprint')}</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>

          {file && pending && !preview && (
            <p className="text-muted-foreground text-sm">{t('sprintImport.checking')}</p>
          )}
          {preview && (
            <div className="bg-muted/50 rounded-lg border p-3 text-sm" role="status">
              <p className="font-medium">
                {t('sprintImport.summary', {
                  name: preview.sprintName ?? '',
                  count: preview.inSprint,
                  links: preview.links,
                })}
              </p>
              {preview.issues.length > 0 && (
                <ul className="text-destructive mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                  {preview.issues.slice(0, 20).map((i, index) => (
                    <li key={index}>
                      {t('sprintImport.issue', {
                        sheet: i.sheet,
                        row: i.row,
                        code: i.code,
                        detail: [i.field, i.detail].filter(Boolean).join(': '),
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {mutation.error && <FormError error={mutation.error} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={apply} disabled={!preview || pending || preview.inSprint === 0}>
            {t('sprintImport.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
