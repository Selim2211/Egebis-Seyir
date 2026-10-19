import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MailSettings,
  MailSettingsSchema,
  MailTestResultSchema,
  type MailTestResult,
  type UpdateMailSettingsRequest,
} from '@scrum/shared';
import { CircleAlert, CircleCheck, Loader2, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiRequest, NoContent } from '@/lib/api';
import { useCurrentWorkspace } from '@/features/workspace/queries';

type HintKey =
  | 'mailTest.hint.passEmpty'
  | 'mailTest.hint.unreadable'
  | 'mailTest.hint.auth'
  | 'mailTest.hint.network'
  | 'mailTest.hint.host'
  | 'mailTest.hint.rejected'
  | 'mailTest.hint.other';

/** Bilinen SMTP hata kodları için çeviri anahtarı; gerisi genel ipucunu kullanır. */
function hintKey(code: string): HintKey {
  if (code === 'SMTP_PASS_EMPTY') return 'mailTest.hint.passEmpty';
  if (code === 'SMTP_PASS_UNREADABLE') return 'mailTest.hint.unreadable';
  if (code === 'EAUTH') return 'mailTest.hint.auth';
  if (['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ESOCKET', 'ECONNRESET'].includes(code))
    return 'mailTest.hint.network';
  if (code === 'ENOTFOUND' || code === 'EDNS') return 'mailTest.hint.host';
  if (code === 'EENVELOPE' || code === 'EMESSAGE') return 'mailTest.hint.rejected';
  return 'mailTest.hint.other';
}

const HOST_RE = /^[A-Za-z0-9._-]+$/;

/** Ayarlar → Genel: SMTP bilgilerini uygulamadan gir, kaydet ve e-posta gönderimini dene. */
export function MailTestSection() {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const { data } = useQuery({
    queryKey: ['workspaces', id, 'mail-settings'],
    queryFn: () => apiRequest(`/workspaces/${id}/settings/mail`, MailSettingsSchema),
  });

  return (
    <section className="bg-card rounded-lg border p-4" aria-labelledby="mail-test-title">
      <h3 id="mail-test-title" className="text-base font-semibold">
        {t('mailTest.title')}
      </h3>
      <p className="text-muted-foreground mt-0.5 max-w-xl text-sm">{t('mailTest.help')}</p>
      {data && <MailForm initial={data} />}
    </section>
  );
}

function MailForm({ initial }: { initial: MailSettings }) {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [secure, setSecure] = useState(initial.secure);
  const [username, setUsername] = useState(initial.username ?? '');
  const [password, setPassword] = useState('');
  const [from, setFrom] = useState(initial.from);
  const [result, setResult] = useState<MailTestResult | null>(null);

  const portNumber = Number(port);
  const valid =
    HOST_RE.test(host.trim()) &&
    Number.isInteger(portNumber) &&
    portNumber >= 1 &&
    portNumber <= 65535 &&
    from.trim().length >= 3;
  const dirty =
    host.trim() !== initial.host ||
    portNumber !== initial.port ||
    secure !== initial.secure ||
    (username.trim() || null) !== initial.username ||
    password !== '' ||
    from.trim() !== initial.from;

  const refresh = () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'mail-settings'] });

  const save = useMutation({
    mutationFn: () => {
      const body: UpdateMailSettingsRequest = {
        host: host.trim(),
        port: portNumber,
        secure,
        username: username.trim() || null,
        // Boş bırakılırsa kayıtlı şifre korunur.
        ...(password ? { password } : {}),
        from: from.trim(),
      };
      return apiRequest(`/workspaces/${id}/settings/mail`, NoContent, { method: 'PUT', body });
    },
    onSuccess: async () => {
      setPassword('');
      await refresh();
    },
  });
  const test = useMutation({
    mutationFn: () =>
      apiRequest(`/workspaces/${id}/settings/mail-test`, MailTestResultSchema, { method: 'POST' }),
    onSuccess: setResult,
  });
  const reset = useMutation({
    mutationFn: () =>
      apiRequest(`/workspaces/${id}/settings/mail`, NoContent, { method: 'DELETE' }),
    onSuccess: async () => {
      setResult(null);
      await refresh();
      toast.success(t('mailTest.resetDone'));
    },
  });

  // Önce kaydedilmemiş değişiklikler saklanır, sonra deneme gönderilir: ekrandaki = denenen.
  const saveAndTest = async () => {
    setResult(null);
    if (dirty) await save.mutateAsync();
    await test.mutateAsync();
  };
  const submit = async () => {
    await save.mutateAsync();
    toast.success(t('mailTest.saved'));
  };
  const busy = save.isPending || test.isPending || reset.isPending;
  const error = save.error ?? test.error ?? reset.error;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit().catch(() => undefined);
      }}
      className="mt-4 flex flex-col gap-4"
    >
      {initial.source === 'ENV' && (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
          {t('mailTest.sourceEnv')}
        </p>
      )}
      <div className="grid max-w-2xl gap-4 sm:grid-cols-[1fr_8rem]">
        <Field
          label={t('mailTest.host')}
          value={host}
          maxLength={253}
          placeholder="smtp.gmail.com"
          onChange={(e) => setHost(e.target.value)}
          error={host.trim() && !HOST_RE.test(host.trim()) ? { type: 'invalid_format' } : undefined}
          autoComplete="off"
        />
        <Field
          label={t('mailTest.port')}
          value={port}
          inputMode="numeric"
          placeholder="587"
          onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
          autoComplete="off"
        />
      </div>
      <div className="flex max-w-2xl items-start gap-3">
        <Switch
          id="mail-secure"
          checked={secure}
          onCheckedChange={setSecure}
          aria-describedby="mail-secure-help"
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="mail-secure">{t('mailTest.secure')}</Label>
          <p id="mail-secure-help" className="text-muted-foreground mt-0.5 text-xs">
            {t('mailTest.secureHelp')}
          </p>
        </div>
      </div>
      <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field
          label={t('mailTest.username')}
          value={username}
          maxLength={254}
          placeholder="egebisseyir@gmail.com"
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
        <Field
          label={t('mailTest.password')}
          type="password"
          value={password}
          maxLength={200}
          placeholder={initial.passwordSet ? t('mailTest.passwordKept') : ''}
          hint={t('mailTest.passwordHelp')}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Field
        label={t('mailTest.from')}
        value={from}
        maxLength={200}
        placeholder="Egebis Seyir <egebisseyir@gmail.com>"
        hint={t('mailTest.fromHelp')}
        onChange={(e) => setFrom(e.target.value)}
        className="max-w-2xl"
      />

      {error && <FormError error={error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!dirty || !valid || busy}>
          {save.isPending && !test.isPending && <Loader2 className="size-4 animate-spin" />}
          {t('mailTest.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void saveAndTest().catch(() => undefined)}
          disabled={!valid || busy}
          data-testid="mail-test-button"
        >
          {test.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {test.isPending
            ? t('mailTest.sending')
            : dirty
              ? t('mailTest.saveAndTest')
              : t('mailTest.send')}
        </Button>
        {initial.source === 'APP' && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => reset.mutate()}
            disabled={busy}
            className="ml-auto"
          >
            {t('mailTest.reset')}
          </Button>
        )}
      </div>
      <div aria-live="polite">{result && <Result result={result} />}</div>
    </form>
  );
}

function Result({ result }: { result: MailTestResult }) {
  const { t } = useTranslation();
  if (result.ok) {
    return (
      <div
        data-testid="mail-test-ok"
        className="flex items-start gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm"
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
        <div>
          <p className="font-medium">{t('mailTest.okTitle', { to: result.to })}</p>
          <p className="text-muted-foreground mt-0.5">{t('mailTest.okBody')}</p>
        </div>
      </div>
    );
  }
  const code = result.code ?? 'UNKNOWN';
  return (
    <div
      data-testid="mail-test-error"
      role="alert"
      className="border-destructive/30 bg-destructive/10 flex items-start gap-2 rounded-md border p-3 text-sm"
    >
      <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{t('mailTest.failTitle')}</p>
        <p className="mt-0.5">{t(hintKey(code))}</p>
        <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {result.server && (
            <>
              <dt>{t('mailTest.server')}</dt>
              <dd className="font-mono">{result.server}</dd>
            </>
          )}
          <dt>{t('mailTest.code')}</dt>
          <dd className="font-mono">{code}</dd>
          {result.detail && (
            <>
              <dt>{t('mailTest.detail')}</dt>
              <dd className="font-mono break-words">{result.detail}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
