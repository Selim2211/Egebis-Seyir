import {
  IMPORT_FIELDS,
  IMPORT_LIMITS,
  type ImportIssue,
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
} from '@scrum/shared';
import { type ChangeEvent, useState } from 'react';
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
import { useCustomFields } from '@/features/custom-fields/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { useImportCsv, usePreviewImport } from './queries';

/** CSV içe aktarma sihirbazı: dosya → eşleme + önizleme → sonuç (brief §5.14, ADR-085). */
export function ImportDialog({
  listId,
  spaceId,
  onClose,
}: {
  listId: string;
  spaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const fields = useCustomFields(spaceId);
  const previewMutation = usePreviewImport(listId);
  const importMutation = useImportCsv(listId);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const runPreview = (text: string, mapping?: ImportMapping) =>
    previewMutation.mutate(
      { csv: text, ...(mapping && { mapping }) },
      { onSuccess: setPreview, onError: (error) => toast.error(errorMessage(error)) },
    );

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > IMPORT_LIMITS.maxBytes) {
      toast.error(t('importExport.tooLarge'));
      return;
    }
    const text = await file.text();
    setCsv(text);
    setResult(null);
    runPreview(text);
  };

  const targets = [
    ...IMPORT_FIELDS.map((field) => ({
      key: field,
      label: t(`importExport.fields.${field}`),
    })),
    ...fields.map((f) => ({ key: `cf:${f.id}`, label: f.name })),
  ];
  const setMapping = (target: string, header: string) => {
    if (!preview || csv === null) return;
    runPreview(csv, { ...preview.mapping, [target]: header || null });
  };

  const canImport =
    preview !== null &&
    csv !== null &&
    !preview.tooManyRows &&
    preview.validRows > 0 &&
    !!preview.mapping.title &&
    !importMutation.isPending;

  const submit = () => {
    if (!preview || csv === null) return;
    importMutation.mutate(
      { csv, mapping: preview.mapping },
      {
        onSuccess: (done) => {
          setResult(done);
          toast.success(t('importExport.done', { created: done.created, updated: done.updated }));
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('importExport.importTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <DialogDescription>
            {t('importExport.importHelp', { max: IMPORT_LIMITS.maxRows })}
          </DialogDescription>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('importExport.file')}
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label={t('importExport.file')}
              onChange={(e) => void onFile(e)}
              className="text-sm font-normal"
            />
          </label>
          {previewMutation.error && <FormError error={previewMutation.error} />}

          {preview && !result && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{t('importExport.mapping')}</legend>
                <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
                  {targets.map((target) => (
                    <div key={target.key} className="contents">
                      <span className="pt-1.5 text-sm">
                        {target.label}
                        {target.key === 'title' && ' *'}
                      </span>
                      <NativeSelect
                        className="h-8"
                        aria-label={t('importExport.mapFor', { field: target.label })}
                        value={preview.mapping[target.key] ?? ''}
                        onChange={(e) => setMapping(target.key, e.target.value)}
                      >
                        <option value="">{t('importExport.notMapped')}</option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  ))}
                </div>
              </fieldset>

              <p className="text-sm" role="status">
                {t('importExport.summary', {
                  total: preview.totalRows,
                  valid: preview.validRows,
                  invalid: preview.totalRows - preview.validRows,
                })}
              </p>
              {preview.tooManyRows && (
                <p className="text-destructive text-sm">
                  {t('importExport.tooMany', { max: IMPORT_LIMITS.maxRows })}
                </p>
              )}
              <Issues issues={preview.issues} />
              <SampleTable preview={preview} />
            </>
          )}

          {result && (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-sm font-medium">
                {t('importExport.result', {
                  created: result.created,
                  updated: result.updated,
                  skipped: result.skipped,
                })}
              </p>
              <Issues issues={result.issues} />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          {!result && (
            <Button disabled={!canImport} onClick={submit}>
              {t('importExport.start', { count: preview?.validRows ?? 0 })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Issues({ issues }: { issues: ImportIssue[] }) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">
        {t('importExport.issues', { count: issues.length })}
      </h3>
      <ul className="max-h-40 overflow-y-auto text-xs">
        {issues.slice(0, 50).map((issue, index) => (
          <li key={index} className="text-muted-foreground py-0.5">
            {t('importExport.line', { row: issue.row })}:{' '}
            {t(`importExport.issue.${issue.code}`, {
              defaultValue: issue.code,
              detail: issue.detail ?? '',
            })}
            {issue.field && ` (${issue.field})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SampleTable({ preview }: { preview: ImportPreview }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <p className="text-muted-foreground mb-1 text-xs">{t('importExport.sample')}</p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b">
            {preview.headers.map((h) => (
              <th key={h} className="px-2 py-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.sample.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="max-w-48 truncate px-2 py-1">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
