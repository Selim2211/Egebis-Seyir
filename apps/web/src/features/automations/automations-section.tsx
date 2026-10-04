import {
  AUTOMATION_ACTION_TYPES,
  type Automation,
  type CreateAutomationRequest,
  MAX_AUTOMATION_ACTIONS,
  PRIORITIES,
  type SpaceDetail,
  WORK_ITEM_TYPES,
} from '@scrum/shared';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
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
import { CustomFieldInput } from '@/features/custom-fields/field-input';
import { useCustomFields } from '@/features/custom-fields/queries';
import { useMembers } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  useAutomationRuns,
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  useUpdateAutomation,
} from './queries';

type Draft = CreateAutomationRequest;
type DraftAction = Draft['actions'][number];

const EMPTY: Draft = {
  name: '',
  enabled: true,
  trigger: { type: 'STATUS_CHANGED', toStatusId: null },
  conditions: {},
  actions: [{ type: 'SET_PRIORITY', priority: 'HIGH' }],
};

/** Space ayarlarında otomasyonlar (brief §5.8, ADR-084). */
export function AutomationsSection({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data } = useAutomations(space.id, true);
  const update = useUpdateAutomation();
  const remove = useDeleteAutomation();
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const automations = data?.automations ?? [];

  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('automations.title')}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{t('automations.help')}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
          <Plus />
          {t('automations.add')}
        </Button>
      </div>
      {automations.length === 0 && (
        <p className="text-muted-foreground px-4 py-3 text-sm">{t('automations.none')}</p>
      )}
      <ul className="divide-y px-4">
        {automations.map((automation) => (
          <AutomationRow
            key={automation.id}
            space={space}
            automation={automation}
            onToggle={(enabled) =>
              update.mutate(
                { spaceId: space.id, automationId: automation.id, body: { enabled } },
                { onError: (error) => toast.error(errorMessage(error)) },
              )
            }
            onEdit={() => setEditing(automation)}
            onDelete={() => setDeleting(automation)}
          />
        ))}
      </ul>
      {editing && (
        <AutomationDialog
          space={space}
          automation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('automations.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('automations.deleteHint')}
        confirmLabel={t('automations.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          void remove
            .mutateAsync({ spaceId: space.id, automationId: deleting.id })
            .then(() => setDeleting(null))
            .catch((error: unknown) => toast.error(errorMessage(error)));
        }}
      />
    </section>
  );
}

function AutomationRow({
  space,
  automation,
  onToggle,
  onEdit,
  onDelete,
}: {
  space: SpaceDetail;
  automation: Automation;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = automation.trigger;
  const status =
    trigger.type === 'STATUS_CHANGED' && trigger.toStatusId
      ? space.statuses.find((s) => s.id === trigger.toStatusId)?.name
      : null;
  const priority =
    trigger.type === 'PRIORITY_CHANGED' && trigger.to ? t(`priority.${trigger.to}`) : null;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          aria-label={t('automations.enabledFor', { name: automation.name })}
          checked={automation.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{automation.name}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {t(`automations.triggers.${automation.trigger.type}`)}
            {(status ?? priority) && ` · ${status ?? priority}`}
            {` → ${t('automations.actionCount', { count: automation.actions.length })}`}
          </span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-expanded={open}
          aria-label={t('automations.runsFor', { name: automation.name })}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('automations.edit', { name: automation.name })}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('automations.delete', { name: automation.name })}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      {open && <Runs spaceId={space.id} automationId={automation.id} />}
    </li>
  );
}

function Runs({ spaceId, automationId }: { spaceId: string; automationId: string }) {
  const { t } = useTranslation();
  const { data } = useAutomationRuns(spaceId, automationId, true);
  const runs = data?.runs ?? [];
  return (
    <div className="bg-muted/30 mt-2 rounded-md p-3 text-xs">
      {runs.length === 0 ? (
        <p className="text-muted-foreground">{t('automations.noRuns')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground tabular-nums">
                {new Date(run.createdAt).toLocaleString()}
              </span>
              <span className="font-mono">{run.itemKey}</span>
              <span className="font-medium">{t(`automations.outcome.${run.outcome}`)}</span>
              {run.outcome !== 'OK' && run.message && (
                <span className="text-muted-foreground">{run.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toDraft(automation: Automation | null): Draft {
  if (!automation) return structuredClone(EMPTY);
  return {
    name: automation.name,
    enabled: automation.enabled,
    trigger: automation.trigger,
    conditions: automation.conditions,
    actions: automation.actions,
  };
}

function newAction(type: DraftAction['type'], space: SpaceDetail, userId: string): DraftAction {
  switch (type) {
    case 'ASSIGN':
      return { type, userId };
    case 'NOTIFY':
      return { type, to: 'ASSIGNEES', message: '' };
    case 'SET_PRIORITY':
      return { type, priority: 'HIGH' };
    case 'SET_STATUS':
      return { type, statusId: space.statuses[0]!.id };
    case 'SET_CUSTOM_FIELD':
      return { type, fieldId: '', value: null };
    case 'CREATE_SUBTASK':
      return { type, title: '' };
  }
}

function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

function AutomationDialog({
  space,
  automation,
  onClose,
}: {
  space: SpaceDetail;
  automation: Automation | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAutomation();
  const update = useUpdateAutomation();
  const members = useMembers().data?.members ?? [];
  const [draft, setDraft] = useState<Draft>(() => toDraft(automation));
  const mutation = automation ? update : create;
  const firstUser = members[0]?.userId ?? '';

  const setAction = (index: number, action: DraftAction) =>
    setDraft((d) => ({ ...d, actions: d.actions.map((a, i) => (i === index ? action : a)) }));
  const valid =
    draft.name.trim() !== '' &&
    draft.actions.length > 0 &&
    draft.actions.every((a) => {
      switch (a.type) {
        case 'ASSIGN':
          return a.userId !== '';
        case 'NOTIFY':
          return a.message.trim() !== '' && (a.to !== 'USER' || !!a.userId);
        case 'SET_CUSTOM_FIELD':
          return a.fieldId !== '';
        case 'CREATE_SUBTASK':
          return a.title.trim() !== '';
        default:
          return true;
      }
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const body = { ...draft, name: draft.name.trim() };
    const done = {
      onSuccess: () => {
        toast.success(t('automations.saved'));
        onClose();
      },
    };
    if (automation) {
      update.mutate({ spaceId: space.id, automationId: automation.id, body }, done);
    } else {
      create.mutate({ spaceId: space.id, body }, done);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>
              {automation ? t('automations.editTitle') : t('automations.addTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('automations.name')}
              <Input
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                autoFocus
              />
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('automations.when')}</legend>
              <div className="flex flex-wrap gap-2">
                <NativeSelect
                  aria-label={t('automations.trigger')}
                  value={draft.trigger.type}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      trigger:
                        e.target.value === 'ITEM_CREATED'
                          ? { type: 'ITEM_CREATED' }
                          : e.target.value === 'PRIORITY_CHANGED'
                            ? { type: 'PRIORITY_CHANGED', to: null }
                            : { type: 'STATUS_CHANGED', toStatusId: null },
                    }))
                  }
                >
                  <option value="ITEM_CREATED">{t('automations.triggers.ITEM_CREATED')}</option>
                  <option value="STATUS_CHANGED">{t('automations.triggers.STATUS_CHANGED')}</option>
                  <option value="PRIORITY_CHANGED">
                    {t('automations.triggers.PRIORITY_CHANGED')}
                  </option>
                </NativeSelect>
                {draft.trigger.type === 'STATUS_CHANGED' && (
                  <NativeSelect
                    aria-label={t('automations.toStatus')}
                    value={draft.trigger.toStatusId ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trigger: { type: 'STATUS_CHANGED', toStatusId: e.target.value || null },
                      }))
                    }
                  >
                    <option value="">{t('automations.any')}</option>
                    {space.statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                {draft.trigger.type === 'PRIORITY_CHANGED' && (
                  <NativeSelect
                    aria-label={t('automations.toPriority')}
                    value={draft.trigger.to ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        trigger: {
                          type: 'PRIORITY_CHANGED',
                          to: (e.target.value || null) as (typeof PRIORITIES)[number] | null,
                        },
                      }))
                    }
                  >
                    <option value="">{t('automations.any')}</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`priority.${p}`)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('automations.conditions')}</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {WORK_ITEM_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.conditions?.types?.includes(type) ?? false}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          conditions: {
                            ...d.conditions,
                            types: toggle(d.conditions?.types, type),
                          },
                        }))
                      }
                    />
                    {t(`workItemType.${type}`)}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {PRIORITIES.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.conditions?.priorities?.includes(p) ?? false}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          conditions: {
                            ...d.conditions,
                            priorities: toggle(d.conditions?.priorities, p),
                          },
                        }))
                      }
                    />
                    {t(`priority.${p}`)}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={draft.conditions?.unassigned ?? false}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      conditions: { ...d.conditions, unassigned: e.target.checked || undefined },
                    }))
                  }
                />
                {t('automations.unassigned')}
              </label>
              <p className="text-muted-foreground text-xs">{t('automations.conditionsHint')}</p>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('automations.then')}</legend>
              {draft.actions.map((action, index) => (
                <ActionEditor
                  key={index}
                  index={index}
                  action={action}
                  space={space}
                  canRemove={draft.actions.length > 1}
                  onChange={(next) => setAction(index, next)}
                  onTypeChange={(type) => setAction(index, newAction(type, space, firstUser))}
                  onRemove={() =>
                    setDraft((d) => ({ ...d, actions: d.actions.filter((_, i) => i !== index) }))
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={draft.actions.length >= MAX_AUTOMATION_ACTIONS}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    actions: [...d.actions, newAction('SET_PRIORITY', space, firstUser)],
                  }))
                }
              >
                <Plus />
                {t('automations.addAction')}
              </Button>
            </fieldset>
            {mutation.error && <FormError error={mutation.error} />}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || mutation.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionEditor({
  index,
  action,
  space,
  canRemove,
  onChange,
  onTypeChange,
  onRemove,
}: {
  index: number;
  action: DraftAction;
  space: SpaceDetail;
  canRemove: boolean;
  onChange: (action: DraftAction) => void;
  onTypeChange: (type: DraftAction['type']) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const members = useMembers().data?.members ?? [];
  const fields = useCustomFields(space.id);
  const number = index + 1;
  const field =
    action.type === 'SET_CUSTOM_FIELD' ? fields.find((f) => f.id === action.fieldId) : null;

  const memberSelect = (value: string, set: (userId: string) => void, label: string) => (
    <NativeSelect aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{t('automations.choosePerson')}</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-md p-2">
      <NativeSelect
        aria-label={t('automations.actionType', { index: number })}
        value={action.type}
        onChange={(e) => onTypeChange(e.target.value as DraftAction['type'])}
      >
        {AUTOMATION_ACTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`automations.actions.${type}`)}
          </option>
        ))}
      </NativeSelect>

      {action.type === 'ASSIGN' &&
        memberSelect(
          action.userId,
          (userId) => onChange({ ...action, userId }),
          t('automations.person', { index: number }),
        )}
      {action.type === 'SET_PRIORITY' && (
        <NativeSelect
          aria-label={t('automations.priorityValue', { index: number })}
          value={action.priority}
          onChange={(e) =>
            onChange({ ...action, priority: e.target.value as (typeof PRIORITIES)[number] })
          }
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`priority.${p}`)}
            </option>
          ))}
        </NativeSelect>
      )}
      {action.type === 'SET_STATUS' && (
        <NativeSelect
          aria-label={t('automations.statusValue', { index: number })}
          value={action.statusId}
          onChange={(e) => onChange({ ...action, statusId: e.target.value })}
        >
          {space.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      )}
      {action.type === 'CREATE_SUBTASK' && (
        <Input
          className="h-9 min-w-48 flex-1"
          maxLength={200}
          aria-label={t('automations.subtaskTitle', { index: number })}
          placeholder={t('automations.subtaskTitle', { index: number })}
          value={action.title}
          onChange={(e) => onChange({ ...action, title: e.target.value })}
        />
      )}
      {action.type === 'NOTIFY' && (
        <>
          <NativeSelect
            aria-label={t('automations.notifyTo', { index: number })}
            value={action.to}
            onChange={(e) =>
              onChange({ ...action, to: e.target.value as 'ASSIGNEES' | 'REPORTER' | 'USER' })
            }
          >
            <option value="ASSIGNEES">{t('automations.toAssignees')}</option>
            <option value="REPORTER">{t('automations.toReporter')}</option>
            <option value="USER">{t('automations.toUser')}</option>
          </NativeSelect>
          {action.to === 'USER' &&
            memberSelect(
              action.userId ?? '',
              (userId) => onChange({ ...action, userId }),
              t('automations.person', { index: number }),
            )}
          <Input
            className="h-9 min-w-48 flex-1"
            maxLength={200}
            aria-label={t('automations.message', { index: number })}
            placeholder={t('automations.message', { index: number })}
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
          />
        </>
      )}
      {action.type === 'SET_CUSTOM_FIELD' && (
        <>
          <NativeSelect
            aria-label={t('automations.fieldValue', { index: number })}
            value={action.fieldId}
            onChange={(e) => onChange({ ...action, fieldId: e.target.value, value: null })}
          >
            <option value="">{t('automations.chooseField')}</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </NativeSelect>
          {field && (
            <div className="min-w-40 flex-1">
              <CustomFieldInput
                field={field}
                value={action.value ?? undefined}
                disabled={false}
                onChange={(value) => onChange({ ...action, value })}
              />
            </div>
          )}
        </>
      )}
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-8"
          aria-label={t('automations.removeAction', { index: number })}
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
