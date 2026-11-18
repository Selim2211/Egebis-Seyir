import { BackupKeyRevealSchema, BackupKeyStatusSchema, type BackupKeyStatus } from '@scrum/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { ApiRequestError, apiRequest, csrfToken } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

const keyPath = (id: string) => `/workspaces/${id}/backup-key`;

function useKeyStatus() {
  const { id } = useCurrentWorkspace();
  return useQuery({
    queryKey: ['workspaces', id, 'backup-key'],
    queryFn: () => apiRequest(keyPath(id), BackupKeyStatusSchema),
  });
}

function useSetKey() {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (body: { key?: string; acknowledgeOldBackups: boolean }) =>
      apiRequest(keyPath(id), BackupKeyStatusSchema, { method: 'PUT', body }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'backup-key'] }),
  });
}

/** Anahtarı açık metin olarak alır (yalnızca Super Admin; görüntüleme denetim günlüğüne yazılır). */
function useReveal() {
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: () => apiRequest(`${keyPath(id)}/reveal`, BackupKeyRevealSchema),
  });
}

/** Seçilen eski yedekleri yeni anahtarla yeniden şifreleyip ZIP olarak indirtir. */
function useReencrypt() {
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: { files: File[]; oldKey: string }) => {
      const form = new FormData();
      for (const f of input.files) form.append('files', f);
      if (input.oldKey.trim()) form.append('oldKey', input.oldKey.trim());
      const res = await fetch(`/api${keyPath(id)}/reencrypt`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': await csrfToken() },
        body: form,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          code?: string;
          details?: unknown;
        } | null;
        throw new ApiRequestError(res.status, json?.code ?? 'INTERNAL', json?.details);
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'yeniden-sifrelenmis-yedekler.zip';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/**
 * Yedek şifreleme anahtarı (ADR-171): AES-256. Yalnızca Super Admin görür; değiştirmeden önce
 * "eski yedekler etkilenebilir" uyarısı açılır ve eski yedekler yeni anahtarla yeniden şifrelenebilir.
 */
export function BackupKeyPanel() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const status = useKeyStatus();
  const set = useSetKey();
  const reveal = useReveal();
  const [shown, setShown] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [reencrypting, setReencrypting] = useState(false);
  const data: BackupKeyStatus | undefined = status.data;

  const onReveal = () =>
    reveal.mutate(undefined, {
      onSuccess: (r) => setShown(r.key),
      onError: (e) => toast.error(errorMessage(e)),
    });

  const onCreate = () =>
    set.mutate(
      { acknowledgeOldBackups: false },
      {
        onSuccess: () => toast.success(t('backupKey.created')),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <section className="bg-card rounded-lg border" data-testid="backup-key">
      <div className="border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" aria-hidden />
          {t('backupKey.title')}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('backupKey.description')}</p>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {status.isPending ? (
          <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">{t('backupKey.status')}</dt>
            <dd className="font-medium">
              {data?.configured ? t('backupKey.configured') : t('backupKey.notConfigured')}
            </dd>
            {data?.configured && (
              <>
                <dt className="text-muted-foreground">{t('backupKey.fingerprint')}</dt>
                <dd className="font-mono">{data.fingerprint}</dd>
                <dt className="text-muted-foreground">{t('backupKey.updatedAt')}</dt>
                <dd>{formatDate(data.updatedAt)}</dd>
              </>
            )}
          </dl>
        )}

        {shown && (
          <div className="bg-muted flex items-center gap-2 rounded-md px-3 py-2">
            <code className="min-w-0 flex-1 text-sm break-all" data-testid="backup-key-value">
              {shown}
            </code>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('backupKey.copy')}
              onClick={() => {
                void navigator.clipboard?.writeText(shown);
                toast.success(t('backupKey.copied'));
              }}
            >
              <Copy />
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {data?.configured ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={shown ? () => setShown(null) : onReveal}
                disabled={reveal.isPending}
              >
                {shown ? <EyeOff /> : <Eye />}
                {shown ? t('backupKey.hide') : t('backupKey.reveal')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
                <RefreshCw />
                {t('backupKey.change')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReencrypting(true)}>
                {t('backupKey.reencrypt')}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onCreate} disabled={set.isPending}>
              <KeyRound />
              {t('backupKey.create')}
            </Button>
          )}
        </div>
      </div>
      {changing && (
        <ChangeKeyDialog
          knownOldKey={shown}
          onClose={() => setChanging(false)}
          onChanged={() => {
            setShown(null);
            setChanging(false);
            setReencrypting(true);
          }}
        />
      )}
      {reencrypting && (
        <ReencryptDialog oldKey={shown ?? ''} onClose={() => setReencrypting(false)} />
      )}
    </section>
  );
}

/**
 * Anahtarı değiştirme: önemli uyarı penceresi. Onay kutusu işaretlenmeden düğme açılmaz; sunucu da
 * `acknowledgeOldBackups` olmadan değişikliği reddeder.
 */
function ChangeKeyDialog({
  onClose,
  onChanged,
}: {
  knownOldKey: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const set = useSetKey();
  const [custom, setCustom] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = custom.trim().length > 0 && custom.trim().length < 16;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" data-testid="backup-key-warning">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!ack || tooShort) return;
            set.mutate(
              { key: custom.trim() || undefined, acknowledgeOldBackups: true },
              {
                onSuccess: () => {
                  toast.success(t('backupKey.changed'));
                  onChanged();
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-5" aria-hidden />
              {t('backupKey.warnTitle')}
            </DialogTitle>
            <DialogDescription>{t('backupKey.warnBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {t('backupKey.warnSteps')}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backupKey.customLabel')}
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={t('backupKey.customPlaceholder')}
                autoComplete="off"
              />
              <span className="text-muted-foreground text-xs font-normal">
                {t('backupKey.customHint')}
              </span>
            </label>
            {tooShort && (
              <p role="alert" className="text-destructive text-sm">
                {t('backupKey.tooShort')}
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t('backupKey.ack')}</span>
            </label>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!ack || tooShort || set.isPending}
            >
              {t('backupKey.confirmChange')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Eski yedekleri tarayıcıdan seçip yeni anahtarla yeniden şifreler (eski anahtar yalnızca bu istekte kullanılır). */
function ReencryptDialog({
  oldKey: initialOldKey,
  onClose,
}: {
  oldKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const reencrypt = useReencrypt();
  const [files, setFiles] = useState<File[]>([]);
  const [oldKey, setOldKey] = useState(initialOldKey);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (files.length === 0) return;
            setError(null);
            reencrypt.mutate(
              { files, oldKey },
              {
                onSuccess: () => {
                  toast.success(t('backupKey.reencrypted'));
                  onClose();
                },
                onError: (err) => setError(errorMessage(err)),
              },
            );
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{t('backupKey.reencryptTitle')}</DialogTitle>
            <DialogDescription>{t('backupKey.reencryptBody')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backupKey.files')}
              <input
                type="file"
                multiple
                accept=".zip,.enc,application/zip,application/octet-stream"
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
                className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('backupKey.oldKey')}
              <Input
                value={oldKey}
                onChange={(e) => setOldKey(e.target.value)}
                placeholder={t('backupKey.oldKeyPlaceholder')}
                autoComplete="off"
              />
              <span className="text-muted-foreground text-xs font-normal">
                {t('backupKey.oldKeyHint')}
              </span>
            </label>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('backupKey.later')}
            </Button>
            <Button type="submit" disabled={files.length === 0 || reencrypt.isPending}>
              {t('backupKey.reencryptAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
