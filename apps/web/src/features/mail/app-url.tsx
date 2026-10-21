import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppUrlSettingsSchema, type AppUrlSettings } from '@scrum/shared';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';

const URL_RE = /^https?:\/\/[A-Za-z0-9._-]+(:\d{1,5})?(\/[^\s?#]*)?$/;

/** Kayıtlı adres, kullanıcının şu an tarayıcıda açtığı adresten farklıysa true. */
function differsFromBrowser(url: string): boolean {
  try {
    return new URL(url).host !== window.location.host;
  } catch {
    return true;
  }
}

/**
 * Ayarlar → Genel: uygulamanın dışarıdan görünen adresi. Davet, şifre sıfırlama ve bildirim
 * e-postalarındaki bağlantılar bununla kurulur; yanlışsa (ör. localhost) bağlantılar açılmaz.
 */
export function AppUrlSection() {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const { data } = useQuery({
    queryKey: ['workspaces', id, 'app-url'],
    queryFn: () => apiRequest(`/workspaces/${id}/settings/app-url`, AppUrlSettingsSchema),
  });
  return (
    <section className="bg-card rounded-lg border p-4" aria-labelledby="app-url-title">
      <h3 id="app-url-title" className="text-base font-semibold">
        {t('appUrl.title')}
      </h3>
      <p className="text-muted-foreground mt-0.5 max-w-xl text-sm">{t('appUrl.help')}</p>
      {data && <AppUrlForm initial={data} />}
    </section>
  );
}

function AppUrlForm({ initial }: { initial: AppUrlSettings }) {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [value, setValue] = useState(initial.url);
  const key = ['workspaces', id, 'app-url'];

  const save = useMutation({
    mutationFn: (url: string | null) =>
      apiRequest(`/workspaces/${id}/settings/app-url`, NoContent, {
        method: 'PUT',
        body: { url },
      }),
    onSuccess: async (_data, url) => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success(t(url === null ? 'appUrl.resetDone' : 'appUrl.saved'));
    },
  });

  const trimmed = value.trim().replace(/\/+$/, '');
  const valid = URL_RE.test(trimmed);
  const dirty = trimmed !== initial.url;
  const mismatch = differsFromBrowser(initial.url);
  const here = window.location.origin;

  return (
    <form
      noValidate
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate(trimmed);
      }}
    >
      {mismatch && (
        <div
          role="alert"
          data-testid="app-url-warning"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-medium">{t('appUrl.mismatchTitle')}</p>
            <p className="text-muted-foreground mt-0.5">
              {t('appUrl.mismatch', { saved: initial.url, here })}
            </p>
            {here !== trimmed && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setValue(here)}
              >
                {t('appUrl.useThis', { here })}
              </Button>
            )}
          </div>
        </div>
      )}
      <Field
        label={t('appUrl.label')}
        value={value}
        maxLength={200}
        placeholder="https://seyir.firma.com"
        hint={t('appUrl.hint')}
        error={value.trim() && !valid ? { type: 'invalid_format' } : undefined}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        className="max-w-2xl"
      />
      {save.error && <FormError error={save.error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!dirty || !valid || save.isPending}>
          {t('appUrl.save')}
        </Button>
        {initial.custom && (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
            className="ml-auto"
          >
            {t('appUrl.reset')}
          </Button>
        )}
      </div>
    </form>
  );
}
