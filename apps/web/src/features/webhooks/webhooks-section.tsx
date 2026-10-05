import {
  type CreatedWebhook,
  type Webhook,
  WEBHOOK_EVENTS,
  WEBHOOK_FORMATS,
  type WebhookEvent,
  type WebhookFormat,
} from '@scrum/shared';
import { ChevronDown, ChevronRight, Copy, Plus, Send, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useDeliveries,
  useTestWebhook,
  useUpdateWebhook,
  useWebhooks,
} from './queries';

/** Space ayarlarında giden webhook'lar ve sohbet bildirimleri (brief §5.18, ADR-087/088). */
export function WebhooksSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data } = useWebhooks(spaceId);
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [fresh, setFresh] = useState<CreatedWebhook | null>(null);
  const webhooks = data?.webhooks ?? [];

  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('webhooks.title')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('webhooks.help')}</p>
      </div>
      {webhooks.length === 0 && (
        <p className="text-muted-foreground px-4 py-3 text-sm">{t('webhooks.none')}</p>
      )}
      <ul className="divide-y px-4">
        {webhooks.map((webhook) => (
          <WebhookRow
            key={webhook.id}
            spaceId={spaceId}
            webhook={webhook}
            onToggle={(enabled) =>
              update.mutate(
                { spaceId, webhookId: webhook.id, body: { enabled } },
                { onError: (error) => toast.error(errorMessage(error)) },
              )
            }
            onDelete={() => setDeleting(webhook)}
          />
        ))}
      </ul>
      {fresh?.secret && (
        <div
          role="status"
          className="mx-4 mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          <p className="font-medium">{t('webhooks.copySecret', { name: fresh.webhook.name })}</p>
          <div className="mt-2 flex items-center gap-2">
            <code
              aria-label={t('webhooks.secretValue')}
              className="bg-background min-w-0 flex-1 overflow-x-auto rounded border px-2 py-1 text-xs"
            >
              {fresh.secret}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(fresh.secret!);
                toast.success(t('webhooks.copied'));
              }}
            >
              <Copy />
              {t('apiAccess.copy')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFresh(null)}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
      <AddWebhook spaceId={spaceId} count={webhooks.length} onCreated={setFresh} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('webhooks.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('webhooks.deleteHint')}
        confirmLabel={t('webhooks.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          void remove
            .mutateAsync({ spaceId, webhookId: deleting.id })
            .then(() => setDeleting(null))
            .catch((error: unknown) => toast.error(errorMessage(error)));
        }}
      />
    </section>
  );
}

function WebhookRow({
  spaceId,
  webhook,
  onToggle,
  onDelete,
}: {
  spaceId: string;
  webhook: Webhook;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const test = useTestWebhook();
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          aria-label={t('webhooks.enabledFor', { name: webhook.name })}
          checked={webhook.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {webhook.name}{' '}
            <span className="bg-muted rounded px-1.5 text-[11px] font-semibold">
              {t(`webhooks.formats.${webhook.format}`)}
            </span>
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {webhook.url} · {t('webhooks.eventCount', { count: webhook.events.length })}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-expanded={open}
          aria-label={t('webhooks.deliveriesFor', { name: webhook.name })}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('webhooks.test', { name: webhook.name })}
          disabled={test.isPending}
          onClick={() =>
            test.mutate(
              { spaceId, webhookId: webhook.id },
              {
                onSuccess: () => toast.success(t('webhooks.testSent')),
                onError: (error) => toast.error(errorMessage(error)),
              },
            )
          }
        >
          <Send />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('webhooks.delete', { name: webhook.name })}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      {open && <Deliveries spaceId={spaceId} webhookId={webhook.id} />}
    </li>
  );
}

function Deliveries({ spaceId, webhookId }: { spaceId: string; webhookId: string }) {
  const { t } = useTranslation();
  const { data } = useDeliveries(spaceId, webhookId);
  const rows = data?.deliveries ?? [];
  return (
    <div className="bg-muted/30 mt-2 rounded-md p-3 text-xs">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('webhooks.noDeliveries')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground tabular-nums">
                {new Date(d.createdAt).toLocaleString()}
              </span>
              <span className="font-mono">{d.event}</span>
              <span className="font-medium">{t(`webhooks.status.${d.status}`)}</span>
              {d.error && <span className="text-muted-foreground">{d.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddWebhook({
  spaceId,
  count,
  onCreated,
}: {
  spaceId: string;
  count: number;
  onCreated: (created: CreatedWebhook) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateWebhook();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<WebhookFormat>('GENERIC');
  const [events, setEvents] = useState<WebhookEvent[]>(['item.created', 'item.status_changed']);
  const ready = name.trim() !== '' && url.trim() !== '' && events.length > 0 && count < 10;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    create.mutate(
      { spaceId, body: { name: name.trim(), url: url.trim(), format, events } },
      {
        onSuccess: (created) => {
          onCreated(created);
          setName('');
          setUrl('');
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 min-w-32 flex-1"
          maxLength={80}
          aria-label={t('webhooks.newName')}
          placeholder={t('webhooks.newName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <NativeSelect
          className="h-8"
          aria-label={t('webhooks.format')}
          value={format}
          onChange={(e) => setFormat(e.target.value as WebhookFormat)}
        >
          {WEBHOOK_FORMATS.map((f) => (
            <option key={f} value={f}>
              {t(`webhooks.formats.${f}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Input
        className="h-8"
        type="url"
        maxLength={500}
        aria-label={t('webhooks.url')}
        placeholder={t('webhooks.urlPlaceholder')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="sr-only">{t('webhooks.events')}</legend>
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={events.includes(event)}
              onChange={() =>
                setEvents((list) =>
                  list.includes(event) ? list.filter((e) => e !== event) : [...list, event],
                )
              }
            />
            {t(`webhooks.eventNames.${event}`)}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={!ready || create.isPending}>
          <Plus />
          {t('webhooks.add')}
        </Button>
        {create.error && <FormError error={create.error} />}
      </div>
    </form>
  );
}
