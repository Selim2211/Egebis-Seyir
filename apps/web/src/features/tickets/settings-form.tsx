import {
  DEFAULT_TICKET_TEMPLATES,
  TICKET_PLACEHOLDERS,
  TICKET_TEMPLATE_KEYS,
  renderTicketTemplate,
  type TicketAiTest,
  type TicketConnectionTest,
  type TicketSettings,
  type TicketTemplateKey,
  type UpdateTicketSettingsRequest,
} from '@scrum/shared';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { useSaveTicketSettings, useTestTicketAi, useTestTicketConnection } from './queries';

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bg-card mb-5 rounded-lg border">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </header>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

const SAMPLE = {
  ad: 'Ayşe',
  firma: 'Acme Holding',
  kayitNo: 'MOB-12',
  konu: 'Ödeme sayfası açılmıyor',
  proje: 'Mobil Uygulama',
  atanan: 'Selim Akıncı',
};

const toRequest = (s: TicketSettings): UpdateTicketSettingsRequest => ({
  imapHost: s.imapHost,
  imapPort: s.imapPort,
  imapSecure: s.imapSecure,
  smtpHost: s.smtpHost,
  smtpPort: s.smtpPort,
  smtpSecure: s.smtpSecure,
  username: s.username,
  address: s.address,
  fromName: s.fromName,
  pollSeconds: s.pollSeconds,
  autoReply: s.autoReply,
  orgName: s.orgName,
  orgPhone: s.orgPhone,
  orgWebsite: s.orgWebsite,
  orgSignature: s.orgSignature,
  templates: s.templates,
  aiEnabled: s.aiEnabled,
  aiModel: s.aiModel,
});

/**
 * Posta kutusu, şirket bilgisi ve yanıt şablonları (ADR-140). Üç kart tek formdur: "Kaydet" hepsini kaydeder.
 * Şifre yalnızca yazılırsa değişir; boş bırakılırsa kayıtlı şifre korunur.
 */
export function SettingsForm({ settings }: { settings: TicketSettings }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const save = useSaveTicketSettings();
  const test = useTestTicketConnection();
  const [form, setForm] = useState(() => toRequest(settings));
  const testAi = useTestTicketAi();
  const [password, setPassword] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiResult, setAiResult] = useState<TicketAiTest | null>(null);
  const [result, setResult] = useState<TicketConnectionTest | null>(null);
  const set = (patch: Partial<UpdateTicketSettingsRequest>) => setForm((f) => ({ ...f, ...patch }));
  const text = (v: string | null) => v ?? '';
  const orNull = (v: string) => (v.trim() === '' ? null : v);

  const submit = (then?: () => void) =>
    save.mutate(
      { ...form, ...(password ? { password } : {}), ...(aiKey ? { aiKey } : {}) },
      {
        onSuccess: () => {
          setPassword('');
          setAiKey('');
          toast.success(t('emailSettings.saved'));
          then?.();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  const setTemplate = (
    key: TicketTemplateKey,
    patch: Partial<UpdateTicketSettingsRequest['templates'][TicketTemplateKey]>,
  ) => set({ templates: { ...form.templates, [key]: { ...form.templates[key], ...patch } } });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-testid="email-settings-form"
    >
      <Card title={t('emailSettings.mailbox')} hint={t('emailSettings.mailboxHint')}>
        {settings.source === 'ENV' && (
          <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {t('emailSettings.fromEnv')}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
          <Field
            label={t('emailSettings.imapHost')}
            value={text(form.imapHost)}
            onChange={(e) => set({ imapHost: orNull(e.target.value) })}
            placeholder="mail.sirket.com"
          />
          <Field
            label={t('emailSettings.port')}
            type="number"
            value={form.imapPort}
            onChange={(e) => set({ imapPort: Number(e.target.value) || 993 })}
          />
          <SecurityField value={form.imapSecure} onChange={(imapSecure) => set({ imapSecure })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
          <Field
            label={t('emailSettings.smtpHost')}
            hint={t('emailSettings.smtpHint')}
            value={text(form.smtpHost)}
            onChange={(e) => set({ smtpHost: orNull(e.target.value) })}
          />
          <Field
            label={t('emailSettings.port')}
            type="number"
            value={form.smtpPort}
            onChange={(e) => set({ smtpPort: Number(e.target.value) || 465 })}
          />
          <SecurityField value={form.smtpSecure} onChange={(smtpSecure) => set({ smtpSecure })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('emailSettings.username')}
            value={text(form.username)}
            onChange={(e) => set({ username: orNull(e.target.value) })}
            autoComplete="off"
          />
          <Field
            label={t('emailSettings.password')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              settings.passwordState === 'SET'
                ? t('emailSettings.passwordSet')
                : t('emailSettings.passwordEmpty')
            }
            hint={t('emailSettings.passwordHint')}
          />
          <Field
            label={t('emailSettings.address')}
            type="email"
            value={text(form.address)}
            onChange={(e) => set({ address: orNull(e.target.value) })}
          />
          <Field
            label={t('emailSettings.fromName')}
            value={form.fromName}
            onChange={(e) => set({ fromName: e.target.value })}
          />
          <Field
            label={t('emailSettings.poll')}
            type="number"
            min={15}
            value={form.pollSeconds}
            onChange={(e) => set({ pollSeconds: Number(e.target.value) || 60 })}
          />
          <div className="flex items-end gap-3 pb-1">
            <Switch
              id="autoReply"
              checked={form.autoReply}
              onCheckedChange={(autoReply) => set({ autoReply })}
              aria-label={t('emailSettings.autoReply')}
            />
            <Label htmlFor="autoReply">{t('emailSettings.autoReply')}</Label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={test.isPending || save.isPending}
            data-testid="test-connection"
            onClick={() => {
              setResult(null);
              // Önce kaydedilir: deneme her zaman kayıtlı (etkin) ayarla yapılır.
              submit(() =>
                test.mutate(undefined, {
                  onSuccess: setResult,
                  onError: (error) => toast.error(errorMessage(error)),
                }),
              );
            }}
          >
            {test.isPending ? t('emailSettings.testing') : t('emailSettings.test')}
          </Button>
          {result && (
            <div className="flex flex-wrap gap-3 text-sm" data-testid="test-result">
              {(['imap', 'smtp'] as const).map((k) => (
                <span
                  key={k}
                  className={cn(
                    'flex items-center gap-1',
                    result[k].ok
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-red-700 dark:text-red-300',
                  )}
                >
                  {result[k].ok ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                  {k.toUpperCase()}:{' '}
                  {result[k].ok
                    ? t('emailSettings.ok')
                    : (result[k].detail ?? t('emailSettings.failed'))}
                </span>
              ))}
            </div>
          )}
        </div>
        <FormError error={save.error} />
      </Card>

      <Card title={t('emailSettings.org')} hint={t('emailSettings.orgHint')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label={t('emailSettings.orgName')}
            value={text(form.orgName)}
            onChange={(e) => set({ orgName: orNull(e.target.value) })}
          />
          <Field
            label={t('emailSettings.orgPhone')}
            value={text(form.orgPhone)}
            onChange={(e) => set({ orgPhone: orNull(e.target.value) })}
          />
          <Field
            label={t('emailSettings.orgWebsite')}
            value={text(form.orgWebsite)}
            onChange={(e) => set({ orgWebsite: orNull(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signature">{t('emailSettings.signature')}</Label>
          <Textarea
            id="signature"
            rows={3}
            value={text(form.orgSignature)}
            onChange={(e) => set({ orgSignature: orNull(e.target.value) })}
            placeholder={t('emailSettings.signatureHint')}
          />
        </div>
        <div>
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </Card>

      <Card title={t('emailSettings.ai')} hint={t('emailSettings.aiHint')}>
        <div className="flex items-center gap-3">
          <Switch
            id="aiEnabled"
            checked={form.aiEnabled ?? false}
            onCheckedChange={(aiEnabled) => set({ aiEnabled })}
            aria-label={t('emailSettings.aiEnabled')}
          />
          <Label htmlFor="aiEnabled">{t('emailSettings.aiEnabled')}</Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('emailSettings.aiModel')}
            hint={t('emailSettings.aiModelHint')}
            value={form.aiModel ?? ''}
            onChange={(e) => set({ aiModel: e.target.value })}
          />
          <Field
            label={t('emailSettings.aiKey')}
            type="password"
            autoComplete="new-password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder={
              settings.aiKeyState === 'SET'
                ? t('emailSettings.passwordSet')
                : t('emailSettings.passwordEmpty')
            }
            hint={t('emailSettings.aiKeyHint')}
          />
        </div>
        <p className="text-muted-foreground text-xs">{t('emailSettings.aiPrivacy')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={testAi.isPending || save.isPending}
            data-testid="test-ai"
            onClick={() => {
              setAiResult(null);
              submit(() =>
                testAi.mutate(undefined, {
                  onSuccess: setAiResult,
                  onError: (error) => toast.error(errorMessage(error)),
                }),
              );
            }}
          >
            {testAi.isPending ? t('emailSettings.testing') : t('emailSettings.aiTest')}
          </Button>
          {aiResult && (
            <span
              data-testid="ai-test-result"
              className={cn(
                'flex items-center gap-1 text-sm',
                aiResult.ok
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-red-700 dark:text-red-300',
              )}
            >
              {aiResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {aiResult.ok
                ? t('emailSettings.aiOk', { ms: aiResult.ms ?? 0 })
                : (aiResult.detail ?? t('emailSettings.failed'))}
            </span>
          )}
        </div>
      </Card>

      <Card title={t('emailSettings.templates')} hint={t('emailSettings.templatesHint')}>
        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          {t('emailSettings.placeholders')}
          {TICKET_PLACEHOLDERS.map((p) => (
            <code key={p} className="bg-muted rounded px-1.5 py-0.5 font-mono">{`{${p}}`}</code>
          ))}
        </p>
        {TICKET_TEMPLATE_KEYS.map((key) => {
          const tpl = form.templates[key];
          const preview = renderTicketTemplate(tpl.body, {
            ...SAMPLE,
            sirketAdi: form.orgName ?? form.fromName,
            telefon: form.orgPhone ?? '',
            web: form.orgWebsite ?? '',
            imza:
              form.orgSignature ??
              [form.orgName ?? form.fromName, form.orgPhone, form.orgWebsite]
                .filter(Boolean)
                .join('\n'),
          });
          return (
            <div key={key} className="rounded-md border p-3" data-testid={`template-${key}`}>
              <div className="mb-2 flex items-center gap-3">
                <Switch
                  checked={tpl.enabled}
                  onCheckedChange={(enabled) => setTemplate(key, { enabled })}
                  aria-label={t(`emailSettings.tpl.${key}`)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(`emailSettings.tpl.${key}`)}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`emailSettings.tplWhen.${key}`)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setTemplate(key, { ...DEFAULT_TICKET_TEMPLATES[key] })}
                >
                  <RotateCcw />
                  {t('emailSettings.resetTemplate')}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Field
                  label={t('emailSettings.subject')}
                  value={tpl.subject}
                  onChange={(e) => setTemplate(key, { subject: e.target.value })}
                />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`body-${key}`}>{t('emailSettings.body')}</Label>
                  <Textarea
                    id={`body-${key}`}
                    rows={6}
                    value={tpl.body}
                    onChange={(e) => setTemplate(key, { body: e.target.value })}
                  />
                </div>
                <details className="text-sm">
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    {t('emailSettings.preview')}
                  </summary>
                  <pre className="bg-muted mt-1.5 rounded-md p-3 text-xs whitespace-pre-wrap">
                    {preview}
                  </pre>
                </details>
              </div>
            </div>
          );
        })}
        <div>
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </Card>
    </form>
  );
}

function SecurityField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (secure: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t('emailSettings.security')}</Label>
      <NativeSelect
        value={value ? 'ssl' : 'plain'}
        aria-label={t('emailSettings.security')}
        onChange={(e) => onChange(e.target.value === 'ssl')}
      >
        <option value="ssl">SSL/TLS</option>
        <option value="plain">STARTTLS / {t('emailSettings.none')}</option>
      </NativeSelect>
    </div>
  );
}
