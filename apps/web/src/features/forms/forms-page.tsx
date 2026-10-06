import { PRIORITIES, type Form, type Priority } from '@scrum/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMembers } from '@/features/workspace/queries';
import { useForms, useSubmitForm } from './queries';

/** Space'in formları (Faz 7.4): liste ve doldurma. `?form=` seçili formu açar. */
export function FormsPage({ spaceId, formId }: { spaceId: string; formId: string | null }) {
  const { t } = useTranslation();
  const { data, isPending } = useForms(spaceId);
  const forms = (data?.forms ?? []).filter((f) => f.enabled);
  const selected = formId ? forms.find((f) => f.id === formId) : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <ClipboardList className="size-5" aria-hidden />
        {t('forms.title')}
      </h1>
      <p className="text-muted-foreground mb-5 text-sm">{t('forms.subtitle')}</p>

      {selected ? (
        <FillForm key={selected.id} spaceId={spaceId} form={selected} />
      ) : isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : forms.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-8 text-center text-sm">
          {t('forms.empty')}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {forms.map((form) => (
            <li key={form.id}>
              <Link
                to="/spaces/$spaceId/forms"
                params={{ spaceId }}
                search={{ form: form.id }}
                className="hover:bg-accent bg-card flex h-full flex-col gap-1 rounded-lg border p-4 outline-none focus-visible:ring-[3px]"
              >
                <span className="font-medium">{form.name}</span>
                {form.description && (
                  <span className="text-muted-foreground text-sm">{form.description}</span>
                )}
                <span className="text-muted-foreground mt-auto pt-2 text-xs">
                  {t(`workItemType.${form.itemType}`)} → {form.listName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FillForm({ spaceId, form }: { spaceId: string; form: Form }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const submit = useSubmitForm();
  const members = useMembers().data?.members ?? [];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [missing, setMissing] = useState<string | null>(null);

  const field = (key: Form['fields'][number]['key']) => form.fields.find((f) => f.key === key);
  const required = (key: Form['fields'][number]['key']) => field(key)?.required === true;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const empty: Record<string, boolean> = {
      description: description.trim() === '',
      priority: priority === '',
      dueDate: dueDate === '',
      assignee: assigneeId === '',
    };
    const lacking = form.fields.find((f) => f.required && empty[f.key]);
    if (title.trim() === '' || lacking) {
      setMissing(title.trim() === '' ? 'title' : lacking!.key);
      return;
    }
    setMissing(null);
    submit.mutate(
      {
        spaceId,
        formId: form.id,
        body: {
          title: title.trim(),
          description: description.trim() || null,
          priority: (priority || null) as Priority | null,
          dueDate: dueDate || null,
          assigneeId: assigneeId || null,
        },
      },
      {
        onSuccess: (created) => {
          toast.success(t('forms.submitted', { key: created.key }));
          void navigate({ to: '/spaces/$spaceId/forms', params: { spaceId }, search: {} });
        },
      },
    );
  };

  const label = (key: string, text: string, isRequired: boolean) => (
    <span className="text-sm font-medium">
      {text}
      {isRequired && <span aria-hidden> *</span>}
      {missing === key && (
        <span role="alert" className="text-destructive ml-2 text-xs font-normal">
          {t('errors.FORM_FIELD_REQUIRED')}
        </span>
      )}
    </span>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div>
        <h2 className="text-lg font-semibold">{form.name}</h2>
        {form.description && <p className="text-muted-foreground text-sm">{form.description}</p>}
      </div>
      <label className="flex flex-col gap-1.5">
        {label('title', t('forms.fieldTitle'), true)}
        <Input value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      {field('description') && (
        <label className="flex flex-col gap-1.5">
          {label('description', t('forms.fieldDescription'), required('description'))}
          <Textarea
            value={description}
            rows={5}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      )}
      {field('priority') && (
        <label className="flex flex-col gap-1.5">
          {label('priority', t('forms.fieldPriority'), required('priority'))}
          <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">—</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {field('dueDate') && (
        <label className="flex flex-col gap-1.5">
          {label('dueDate', t('forms.fieldDueDate'), required('dueDate'))}
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      )}
      {field('assignee') && (
        <label className="flex flex-col gap-1.5">
          {label('assignee', t('forms.fieldAssignee'), required('assignee'))}
          <NativeSelect value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      {submit.error && <FormError error={submit.error} />}
      <div className="flex gap-2">
        <Button type="submit" disabled={submit.isPending}>
          {t('forms.submit')}
        </Button>
        <Button asChild variant="ghost">
          <Link to="/spaces/$spaceId/forms" params={{ spaceId }} search={{}}>
            {t('common.cancel')}
          </Link>
        </Button>
      </div>
    </form>
  );
}
