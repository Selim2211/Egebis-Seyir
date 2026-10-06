import {
  FORM_FIELD_KEYS,
  FORM_ITEM_TYPES,
  type Form,
  type FormFieldKey,
  type TreeSpace,
} from '@scrum/shared';
import { Link } from '@tanstack/react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useHierarchy } from '@/features/spaces/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { useCreateForm, useDeleteForm, useForms, useUpdateForm } from './queries';

type Draft = Pick<Form, 'name' | 'listId' | 'itemType' | 'fields' | 'enabled'> & {
  description: string;
};

const listsOf = (space: TreeSpace | undefined) =>
  space ? [...space.folders.flatMap((f) => f.lists), ...space.lists] : [];

/** Space ayarlarında formlar (Faz 7.4, ADR-096): üyelerin görev açma formları. */
export function FormsSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { data } = useForms(spaceId);
  const update = useUpdateForm();
  const remove = useDeleteForm();
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = useState<Form | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Form | null>(null);
  const forms = data?.forms ?? [];

  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('forms.settingsTitle')}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{t('forms.settingsHelp')}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
          <Plus />
          {t('forms.add')}
        </Button>
      </div>
      {forms.length === 0 && (
        <p className="text-muted-foreground px-4 py-3 text-sm">{t('forms.none')}</p>
      )}
      <ul className="divide-y px-4">
        {forms.map((form) => (
          <li key={form.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                aria-label={t('forms.enabledToggle', { name: form.name })}
                onChange={(e) =>
                  update.mutate({
                    spaceId,
                    formId: form.id,
                    body: { enabled: e.target.checked },
                  })
                }
              />
            </label>
            <div className="min-w-0 flex-1">
              <Link
                to="/spaces/$spaceId/forms"
                params={{ spaceId }}
                search={{ form: form.id }}
                className="font-medium hover:underline"
              >
                {form.name}
              </Link>
              <p className="text-muted-foreground text-xs">
                {t(`workItemType.${form.itemType}`)} → {form.listName}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('forms.edit', { name: form.name })}
              onClick={() => setEditing(form)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('forms.delete', { name: form.name })}
              onClick={() => setDeleting(form)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {editing && (
        <FormDialog
          spaceId={spaceId}
          form={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('forms.deleteTitle')}
        description={t('forms.deleteBody', { name: deleting?.name ?? '' })}
        confirmLabel={t('forms.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(
            { spaceId, formId: deleting.id },
            {
              onSuccess: () => setDeleting(null),
              onError: (error) => toast.error(errorMessage(error)),
            },
          );
        }}
      />
    </section>
  );
}

function FormDialog({
  spaceId,
  form,
  onClose,
}: {
  spaceId: string;
  form: Form | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateForm();
  const update = useUpdateForm();
  const space = useHierarchy().data?.spaces.find((s) => s.id === spaceId);
  const lists = listsOf(space);
  const [draft, setDraft] = useState<Draft>(() => ({
    name: form?.name ?? '',
    description: form?.description ?? '',
    listId: form?.listId ?? lists[0]?.id ?? '',
    itemType: form?.itemType ?? 'TASK',
    fields: form?.fields ?? [],
    enabled: form?.enabled ?? true,
  }));
  const mutation = form ? update : create;

  const fieldOf = (key: FormFieldKey) => draft.fields.find((f) => f.key === key);
  const toggle = (key: FormFieldKey, on: boolean) =>
    setDraft((d) => ({
      ...d,
      fields: on ? [...d.fields, { key, required: false }] : d.fields.filter((f) => f.key !== key),
    }));
  const setRequired = (key: FormFieldKey, required: boolean) =>
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.key === key ? { ...f, required } : f)),
    }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.name.trim() === '' || draft.listId === '') return;
    const body = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
    };
    const done = {
      onSuccess: () => {
        toast.success(t('forms.saved'));
        onClose();
      },
    };
    if (form) update.mutate({ spaceId, formId: form.id, body }, done);
    else create.mutate({ spaceId, body }, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{form ? t('forms.editTitle') : t('forms.addTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('forms.name')}
              <Input
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('forms.description')}
              <Input
                maxLength={500}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('forms.targetList')}
                <NativeSelect
                  value={draft.listId}
                  onChange={(e) => setDraft((d) => ({ ...d, listId: e.target.value }))}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('forms.itemType')}
                <NativeSelect
                  value={draft.itemType}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, itemType: e.target.value as Draft['itemType'] }))
                  }
                >
                  {FORM_ITEM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`workItemType.${type}`)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('forms.fields')}</legend>
              <p className="text-muted-foreground text-xs">{t('forms.titleAlways')}</p>
              {FORM_FIELD_KEYS.map((key) => {
                const field = fieldOf(key);
                return (
                  <div key={key} className="flex items-center gap-3 text-sm">
                    <label className="flex min-w-40 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!field}
                        onChange={(e) => toggle(key, e.target.checked)}
                      />
                      {t(`forms.field.${key}`)}
                    </label>
                    {field && (
                      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => setRequired(key, e.target.checked)}
                        />
                        {t('forms.required')}
                      </label>
                    )}
                  </div>
                );
              })}
            </fieldset>
            {mutation.error && <FormError error={mutation.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending || draft.name.trim() === ''}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
