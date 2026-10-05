import {
  API_TOKEN_EXPIRY_DAYS,
  ApiTokensResponseSchema,
  CreatedApiTokenSchema,
  type ApiToken,
  type CreatedApiToken,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest, NoContent } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/api')({
  component: ApiAccessPage,
});

const tokensQuery = queryOptions({
  queryKey: ['api-tokens'],
  queryFn: () => apiRequest('/tokens', ApiTokensResponseSchema),
});

function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; readOnly: boolean; expiresInDays: number | null }) =>
      apiRequest('/tokens', CreatedApiTokenSchema, { method: 'POST', body }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });
}

function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/tokens/${id}`, NoContent, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });
}

/** Kişisel API erişimi (brief §5.18, ADR-086): token oluştur, listele, iptal et. */
function ApiAccessPage() {
  const { t } = useTranslation();
  const { data, error } = useQuery(tokensQuery);
  const [fresh, setFresh] = useState<CreatedApiToken | null>(null);

  return (
    <>
      <PageHeading title={t('apiAccess.title')} subtitle={t('apiAccess.subtitle')} />
      <FormError error={error} />
      <CreateForm onCreated={setFresh} />
      {fresh && <FreshToken created={fresh} onDismiss={() => setFresh(null)} />}
      <h2 className="mt-6 mb-2 text-sm font-semibold">{t('apiAccess.active')}</h2>
      {data?.tokens.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('apiAccess.none')}</p>
      )}
      <ul className="bg-card max-w-2xl divide-y rounded-lg border empty:hidden">
        {data?.tokens.map((token) => (
          <TokenRow key={token.id} token={token} />
        ))}
      </ul>
      <p className="text-muted-foreground mt-4 max-w-2xl text-xs">{t('apiAccess.usage')}</p>
      <pre className="bg-muted mt-1 max-w-2xl overflow-x-auto rounded-md p-3 text-xs">
        {`curl -H "Authorization: Bearer smt_…" ${window.location.origin}/api/workspaces/<id>/hierarchy`}
      </pre>
    </>
  );
}

function CreateForm({ onCreated }: { onCreated: (token: CreatedApiToken) => void }) {
  const { t } = useTranslation();
  const create = useCreateToken();
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [days, setDays] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), readOnly, expiresInDays: days ? Number(days) : null },
      {
        onSuccess: (created) => {
          onCreated(created);
          setName('');
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="bg-card flex max-w-2xl flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
        {t('apiAccess.name')}
        <Input
          maxLength={60}
          value={name}
          placeholder={t('apiAccess.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('apiAccess.expiry')}
        <NativeSelect value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="">{t('apiAccess.never')}</option>
          {API_TOKEN_EXPIRY_DAYS.map((d) => (
            <option key={d} value={d}>
              {t('apiAccess.days', { count: d })}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
        {t('apiAccess.readOnly')}
      </label>
      <Button type="submit" disabled={!name.trim() || create.isPending}>
        <KeyRound />
        {t('apiAccess.create')}
      </Button>
      {create.error && <FormError error={create.error} />}
    </form>
  );
}

function FreshToken({ created, onDismiss }: { created: CreatedApiToken; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="mt-4 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <p className="text-sm font-medium">{t('apiAccess.copyNow', { name: created.info.name })}</p>
      <div className="mt-2 flex items-center gap-2">
        <code
          aria-label={t('apiAccess.tokenValue')}
          className="bg-background min-w-0 flex-1 overflow-x-auto rounded border px-2 py-1.5 text-xs"
        >
          {created.token}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(created.token);
            toast.success(t('apiAccess.copied'));
          }}
        >
          <Copy />
          {t('apiAccess.copy')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

function TokenRow({ token }: { token: ApiToken }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const revoke = useRevokeToken();
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <KeyRound className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {token.name}
          {token.readOnly && (
            <span className="bg-muted rounded px-1.5 text-[11px] font-semibold">
              {t('apiAccess.readOnlyBadge')}
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          <span className="font-mono">{token.prefix}…</span>
          {' · '}
          {token.lastUsedAt
            ? t('apiAccess.lastUsed', { when: relativeTime(token.lastUsedAt) })
            : t('apiAccess.neverUsed')}
          {token.expiresAt &&
            ` · ${t('apiAccess.expires', { date: new Date(token.expiresAt).toLocaleDateString() })}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('apiAccess.revoke', { name: token.name })}
        disabled={revoke.isPending}
        onClick={() =>
          revoke.mutate(token.id, {
            onSuccess: () => toast.success(t('apiAccess.revoked')),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        <Trash2 />
      </Button>
    </li>
  );
}
