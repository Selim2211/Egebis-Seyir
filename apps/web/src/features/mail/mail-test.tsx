import { useMutation } from '@tanstack/react-query';
import { MailTestResultSchema, type MailTestResult } from '@scrum/shared';
import { CircleAlert, CircleCheck, Loader2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormError } from '@/components/form';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api';
import { useCurrentWorkspace } from '@/features/workspace/queries';

/** Bilinen SMTP hata kodları için çeviri anahtarı; gerisi genel ipucunu kullanır. */
function hintKey(
  code: string,
):
  | 'mailTest.hint.passEmpty'
  | 'mailTest.hint.auth'
  | 'mailTest.hint.network'
  | 'mailTest.hint.host'
  | 'mailTest.hint.rejected'
  | 'mailTest.hint.other' {
  if (code === 'SMTP_PASS_EMPTY') return 'mailTest.hint.passEmpty';
  if (code === 'EAUTH') return 'mailTest.hint.auth';
  if (['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ESOCKET', 'ECONNRESET'].includes(code))
    return 'mailTest.hint.network';
  if (code === 'ENOTFOUND' || code === 'EDNS') return 'mailTest.hint.host';
  if (code === 'EENVELOPE' || code === 'EMESSAGE') return 'mailTest.hint.rejected';
  return 'mailTest.hint.other';
}

/** Ayarlar → Genel: e-posta gönderimini kendi adresine deneme. Hatanın nedenini ekranda gösterir. */
export function MailTestSection() {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const test = useMutation({
    mutationFn: () =>
      apiRequest(`/workspaces/${id}/settings/mail-test`, MailTestResultSchema, { method: 'POST' }),
  });

  return (
    <section className="bg-card rounded-lg border p-4" aria-labelledby="mail-test-title">
      <h3 id="mail-test-title" className="text-base font-semibold">
        {t('mailTest.title')}
      </h3>
      <p className="text-muted-foreground mt-0.5 max-w-xl text-sm">{t('mailTest.help')}</p>
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          data-testid="mail-test-button"
        >
          {test.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {test.isPending ? t('mailTest.sending') : t('mailTest.send')}
        </Button>
      </div>
      <div aria-live="polite">
        {test.error && (
          <div className="mt-3">
            <FormError error={test.error} />
          </div>
        )}
        {test.data && <Result result={test.data} />}
      </div>
    </section>
  );
}

function Result({ result }: { result: MailTestResult }) {
  const { t } = useTranslation();
  if (result.ok) {
    return (
      <div
        data-testid="mail-test-ok"
        className="mt-3 flex items-start gap-2 rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm"
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
      className="border-destructive/30 bg-destructive/10 mt-3 flex items-start gap-2 rounded-md border p-3 text-sm"
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
