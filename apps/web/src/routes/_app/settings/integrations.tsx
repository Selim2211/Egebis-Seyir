import {
  CreatedGitIntegrationSchema,
  GIT_PROVIDERS,
  GitIntegrationsResponseSchema,
  WORKSPACE_PERMISSIONS,
  type CreatedGitIntegration,
  type GitIntegration,
  type GitProvider,
} from '@scrum/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, GitBranch, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCan, useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/integrations')({
  component: IntegrationsPage,
});

const integrationsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceId, 'git-integrations'],
    queryFn: () =>
      apiRequest(`/workspaces/${workspaceId}/git-integrations`, GitIntegrationsResponseSchema),
  });

function useIntegrationMutation<T>(fn: (workspaceId: string, input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: T) => fn(id, input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id, 'git-integrations'] }),
  });
}

/** Workspace entegrasyonları: GitHub/GitLab (brief §5.18, ADR-089). */
function IntegrationsPage() {
  const { t } = useTranslation();
  const canEdit = useCan(WORKSPACE_PERMISSIONS.WORKSPACE_SETTINGS);
  const { id } = useCurrentWorkspace();
  const { data, error } = useQuery({ ...integrationsQuery(id), enabled: canEdit });
  const [fresh, setFresh] = useState<CreatedGitIntegration | null>(null);

  if (!canEdit) {
    return <PageHeading title={t('integrations.title')} subtitle={t('integrations.noAccess')} />;
  }
  const url = (integrationId: string) =>
    `${window.location.origin}${data?.receiverPath ?? '/api/integrations/git'}/${integrationId}`;

  return (
    <>
      <PageHeading title={t('integrations.title')} subtitle={t('integrations.subtitle')} />
      <FormError error={error} />
      <CreateForm onCreated={setFresh} />
      {fresh && (
        <Fresh created={fresh} url={url(fresh.integration.id)} onDismiss={() => setFresh(null)} />
      )}
      <h2 className="mt-6 mb-2 text-sm font-semibold">{t('integrations.active')}</h2>
      {data?.integrations.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('integrations.none')}</p>
      )}
      <ul className="bg-card max-w-2xl divide-y rounded-lg border empty:hidden">
        {data?.integrations.map((integration) => (
          <Row key={integration.id} integration={integration} url={url(integration.id)} />
        ))}
      </ul>
    </>
  );
}

function CreateForm({ onCreated }: { onCreated: (created: CreatedGitIntegration) => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useIntegrationMutation((id, body: { name: string; provider: GitProvider }) =>
    apiRequest(`/workspaces/${id}/git-integrations`, CreatedGitIntegrationSchema, {
      method: 'POST',
      body,
    }).then(onCreated),
  );
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<GitProvider>('GITHUB');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), provider },
      { onSuccess: () => setName(''), onError: (error) => toast.error(errorMessage(error)) },
    );
  };
  return (
    <form
      onSubmit={submit}
      className="bg-card flex max-w-2xl flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
        {t('integrations.name')}
        <Input
          maxLength={80}
          value={name}
          placeholder={t('integrations.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('integrations.provider')}
        <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value as GitProvider)}>
          {GIT_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t(`integrations.providers.${p}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" disabled={!name.trim() || create.isPending}>
        <GitBranch />
        {t('integrations.create')}
      </Button>
    </form>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-2">
      <code
        aria-label={label}
        className="bg-background min-w-0 flex-1 overflow-x-auto rounded border px-2 py-1.5 text-xs"
      >
        {value}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success(t('integrations.copied'));
        }}
      >
        <Copy />
        {t('apiAccess.copy')}
      </Button>
    </div>
  );
}

function Fresh({
  created,
  url,
  onDismiss,
}: {
  created: CreatedGitIntegration;
  url: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const github = created.integration.provider === 'GITHUB';
  return (
    <div
      role="status"
      className="mt-4 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
    >
      <p className="font-medium">{t('integrations.copyNow', { name: created.integration.name })}</p>
      <CopyLine label={t('integrations.payloadUrl')} value={url} />
      <CopyLine label={t('integrations.secret')} value={created.secret} />
      <p className="text-muted-foreground mt-2 text-xs">
        {t(github ? 'integrations.githubSteps' : 'integrations.gitlabSteps')}
      </p>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        {t('common.close')}
      </Button>
    </div>
  );
}

function Row({ integration, url }: { integration: GitIntegration; url: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useIntegrationMutation((id, input: { enabled: boolean }) =>
    apiRequest(`/workspaces/${id}/git-integrations/${integration.id}`, NoContent, {
      method: 'PATCH',
      body: input,
    }),
  );
  const remove = useIntegrationMutation((id, _: void) =>
    apiRequest(`/workspaces/${id}/git-integrations/${integration.id}`, NoContent, {
      method: 'DELETE',
    }),
  );
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <input
        type="checkbox"
        className="size-4"
        aria-label={t('integrations.enabledFor', { name: integration.name })}
        checked={integration.enabled}
        onChange={(e) =>
          update.mutate(
            { enabled: e.target.checked },
            { onError: (error) => toast.error(errorMessage(error)) },
          )
        }
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {integration.name}{' '}
          <span className="bg-muted rounded px-1.5 text-[11px] font-semibold">
            {t(`integrations.providers.${integration.provider}`)}
          </span>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {url} ·{' '}
          {integration.lastEventAt
            ? t('integrations.lastEvent', { when: relativeTime(integration.lastEventAt) })
            : t('integrations.noEvents')}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('integrations.delete', { name: integration.name })}
        onClick={() =>
          remove.mutate(undefined, {
            onSuccess: () => toast.success(t('integrations.deleted')),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        <Trash2 />
      </Button>
    </li>
  );
}
