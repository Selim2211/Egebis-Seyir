import type { RestoreResult } from '@scrum/shared';
import { RestoreResultSchema } from '@scrum/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Download, History, Upload } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useTreeSpace } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { SettingsSection } from '@/components/settings-section';

/** Tarayıcıdan ZIP indirme bağlantısı (oturum çerezi aynı kökenli GET ile gider). */
export const spaceBackupUrl = (workspaceId: string, spaceId: string) =>
  `/api/workspaces/${workspaceId}/spaces/${spaceId}/backup.zip`;
export const sprintBackupUrl = (workspaceId: string, sprintId: string) =>
  `/api/workspaces/${workspaceId}/sprints/${sprintId}/backup.zip`;

/** Space ayarlarında yedek bölümü (Faz 8.5, ADR-105); Super Admin Projeyi yedeğe de döndürebilir (ADR-173). */
export function BackupSection({ spaceId, spaceKey }: { spaceId: string; spaceKey: string }) {
  const { t } = useTranslation();
  const { id: workspaceId, role } = useCurrentWorkspace();
  const [rollingBack, setRollingBack] = useState(false);
  const superAdmin = role === 'OWNER' || role === 'ADMIN';
  return (
    <SettingsSection title={t('backup.title')} description={t('backup.description')}>
      <div className="flex flex-wrap gap-2 p-4">
        <Button asChild variant="outline" size="sm">
          <a href={spaceBackupUrl(workspaceId, spaceId)} download>
            <Download />
            {t('backup.download')}
          </a>
        </Button>
        {superAdmin && (
          <Button variant="outline" size="sm" onClick={() => setRollingBack(true)}>
            <History />
            {t('backup.rollback')}
          </Button>
        )}
      </div>
      {rollingBack && (
        <RollbackDialog
          spaceId={spaceId}
          spaceKey={spaceKey}
          onClose={() => setRollingBack(false)}
        />
      )}
    </SettingsSection>
  );
}

/**
 * Projeyi yedeğe döndür (ADR-173): önce "şu anki verileriniz değişecek" uyarısı, sonra yedek dosyasını
 * seçme ekranı. Güvenlik için Proje anahtarı yazılmadan düğme açılmaz; yalnızca Super Admin görür.
 */
function RollbackDialog({
  spaceId,
  spaceKey,
  onClose,
}: {
  spaceId: string;
  spaceKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { id: workspaceId } = useCurrentWorkspace();
  const restore = useRestore<{ confirmKey: string }>(
    (id) => `/workspaces/${id}/spaces/${spaceId}/rollback`,
  );
  const [step, setStep] = useState<'warn' | 'pick'>('warn');
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState('');
  const ready = file !== null && confirm.trim().toUpperCase() === spaceKey.toUpperCase();

  return (
    <Dialog open onOpenChange={(open) => !open && !restore.isPending && onClose()}>
      <DialogContent className="max-w-lg" data-testid={`rollback-${step}`}>
        {step === 'warn' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-5" aria-hidden />
                {t('backup.rollbackWarnTitle')}
              </DialogTitle>
              <DialogDescription>{t('backup.rollbackWarnBody')}</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-3">
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
                <li>{t('backup.rollbackWarn1')}</li>
                <li>{t('backup.rollbackWarn2')}</li>
                <li>{t('backup.rollbackWarn3')}</li>
              </ul>
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                {t('backup.rollbackWarnAdvice')}
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <a href={spaceBackupUrl(workspaceId, spaceId)} download>
                    <Download />
                    {t('backup.rollbackDownloadCurrent')}
                  </a>
                </Button>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setStep('pick')}>
                {t('backup.rollbackContinue')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!file || !ready) return;
              restore.mutate(
                { file, fields: { confirmKey: confirm.trim() } },
                {
                  onSuccess: () => {
                    toast.success(t('backup.rollbackDone'));
                    onClose();
                  },
                },
              );
            }}
            className="flex min-h-0 flex-col"
          >
            <DialogHeader>
              <DialogTitle>{t('backup.rollbackPickTitle')}</DialogTitle>
              <DialogDescription>{t('backup.rollbackPickBody')}</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('backup.file')}
                <input
                  type="file"
                  accept=".zip,.enc,application/zip,application/octet-stream"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('backup.rollbackConfirmLabel', { key: spaceKey })}
                <Input
                  value={confirm}
                  maxLength={20}
                  placeholder={spaceKey}
                  autoComplete="off"
                  onChange={(e) => setConfirm(e.target.value.toUpperCase())}
                />
              </label>
              {restore.error && <FormError error={restore.error} />}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={restore.isPending}
                onClick={() => setStep('warn')}
              >
                {t('common.back')}
              </Button>
              <Button type="submit" variant="destructive" disabled={!ready || restore.isPending}>
                {restore.isPending ? t('backup.rollbackRunning') : t('backup.rollbackAction')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useRestore<T extends Record<string, string>>(path: (workspaceId: string) => string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: ({ file, fields }: { file: File; fields: T }): Promise<RestoreResult> => {
      const form = new FormData();
      for (const [name, value] of Object.entries(fields)) if (value) form.append(name, value);
      form.append('file', file);
      return apiRequest(path(id), RestoreResultSchema, { method: 'POST', body: form });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}

/** Genel ayarlarda: yedekten yeni Space oluştur (yalnız Sahip/Yönetici). */
export function RestoreSpaceSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('backup.restoreSpaceTitle')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('backup.restoreSpaceHint')}</p>
      </div>
      <div className="p-4">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Upload />
          {t('backup.restoreSpace')}
        </Button>
      </div>
      {open && <RestoreSpaceDialog onClose={() => setOpen(false)} />}
    </section>
  );
}

function RestoreSpaceDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const restore = useRestore<{ key: string; name: string }>(
    (id) => `/workspaces/${id}/restore/space`,
  );
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            restore.mutate(
              { file, fields: { key: key.trim().toUpperCase(), name: name.trim() } },
              {
                onSuccess: (result) => {
                  toast.success(t('backup.restored'));
                  onClose();
                  void navigate({ to: '/spaces/$spaceId', params: { spaceId: result.spaceId } });
                },
              },
            );
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{t('backup.restoreSpace')}</DialogTitle>
            <DialogDescription>{t('backup.restoreSpaceBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backup.file')}
              <input
                type="file"
                accept=".zip,.enc,application/zip,application/octet-stream"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backup.newKey')}
              <Input
                value={key}
                maxLength={10}
                placeholder="MOB2"
                onChange={(e) => setKey(e.target.value.toUpperCase())}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backup.newName')}
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            {restore.error && <FormError error={restore.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!file || key.length < 2 || restore.isPending}>
              {t('backup.restoreAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Backlog sayfasından: sprint yedeğini bu Space'e yeni sprint olarak yükle. */
export function RestoreSprintDialog({
  spaceId,
  onClose,
}: {
  spaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const space = useTreeSpace(spaceId);
  const lists = useMemo(
    () => (space ? [...space.lists, ...space.folders.flatMap((f) => f.lists)] : []),
    [space],
  );
  const restore = useRestore<{ listId: string }>(
    (id) => `/workspaces/${id}/spaces/${spaceId}/restore/sprint`,
  );
  const [file, setFile] = useState<File | null>(null);
  const [listId, setListId] = useState('');
  const effective = listId || lists[0]?.id || '';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            restore.mutate(
              { file, fields: { listId: effective } },
              {
                onSuccess: () => {
                  toast.success(t('backup.sprintRestored'));
                  onClose();
                },
              },
            );
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{t('backup.restoreSprint')}</DialogTitle>
            <DialogDescription>{t('backup.restoreSprintBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backup.file')}
              <input
                type="file"
                accept=".zip,.enc,application/zip,application/octet-stream"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('sprintImport.list')}
              <NativeSelect value={effective} onChange={(e) => setListId(e.target.value)}>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {restore.error && <FormError error={restore.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!file || !effective || restore.isPending}>
              {t('backup.restoreAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
