import {
  CUSTOM_FIELD_LIMITS,
  CUSTOM_FIELD_TYPES,
  type CustomField,
  type CustomFieldOptionInput,
  type CustomFieldType,
  OPTION_FIELD_TYPES,
} from '@scrum/shared';
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useMoveCustomField,
  useUpdateCustomField,
} from './queries';

const hasOptions = (type: CustomFieldType) => OPTION_FIELD_TYPES.includes(type);

/** Space ayarlarında özel alan tanımları (brief §5.8, ADR-082). */
export function CustomFieldsSection({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const fields = useCustomFields(spaceId);
  const [deleting, setDeleting] = useState<CustomField | null>(null);

  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('customFields.title')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('customFields.help')}</p>
      </div>
      {fields.length === 0 && (
        <p className="text-muted-foreground px-4 py-3 text-sm">{t('customFields.none')}</p>
      )}
      <ol className="divide-y px-4">
        {fields.map((field, index) => (
          <FieldRow
            key={field.id}
            spaceId={spaceId}
            field={field}
            canEdit={canEdit}
            previousId={fields[index - 1]?.id ?? null}
            beforePreviousId={fields[index - 2]?.id ?? null}
            nextId={fields[index + 1]?.id ?? null}
            onDelete={() => setDeleting(field)}
          />
        ))}
      </ol>
      {canEdit && <AddField spaceId={spaceId} count={fields.length} />}
      <DeleteField spaceId={spaceId} field={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}

function FieldRow({
  spaceId,
  field,
  canEdit,
  previousId,
  beforePreviousId,
  nextId,
  onDelete,
}: {
  spaceId: string;
  field: CustomField;
  canEdit: boolean;
  previousId: string | null;
  beforePreviousId: string | null;
  nextId: string | null;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateCustomField();
  const move = useMoveCustomField();
  const [name, setName] = useState(field.name);
  const [editingOptions, setEditingOptions] = useState(false);
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const commitName = () => {
    const value = name.trim();
    if (value === field.name) return;
    if (!value) return setName(field.name);
    update.mutate(
      { spaceId, fieldId: field.id, body: { name: value } },
      {
        onError: (error) => {
          setName(field.name);
          onError(error);
        },
      },
    );
  };

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Input
            className="h-8 min-w-32 flex-1"
            maxLength={CUSTOM_FIELD_LIMITS.nameMax}
            aria-label={t('customFields.nameFor', { name: field.name })}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{field.name}</span>
        )}
        <span className="text-muted-foreground text-xs">
          {t(`customFields.types.${field.type}`)}
        </span>
        {hasOptions(field.type) && (
          <Button variant="outline" size="sm" onClick={() => setEditingOptions((open) => !open)}>
            {t('customFields.optionsCount', { count: field.options.length })}
          </Button>
        )}
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={previousId === null}
              aria-label={t('customFields.moveUp', { name: field.name })}
              onClick={() =>
                move.mutate({ spaceId, fieldId: field.id, afterId: beforePreviousId }, { onError })
              }
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={nextId === null}
              aria-label={t('customFields.moveDown', { name: field.name })}
              onClick={() =>
                move.mutate({ spaceId, fieldId: field.id, afterId: nextId }, { onError })
              }
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={t('customFields.delete', { name: field.name })}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
      {editingOptions && (
        <OptionsEditor
          key={field.options.map((o) => o.id).join()}
          field={field}
          canEdit={canEdit}
          pending={update.isPending}
          onSave={(options) =>
            update.mutate(
              { spaceId, fieldId: field.id, body: { options } },
              { onSuccess: () => setEditingOptions(false), onError },
            )
          }
        />
      )}
    </li>
  );
}

function OptionsEditor({
  field,
  canEdit,
  pending,
  onSave,
}: {
  field: CustomField;
  canEdit: boolean;
  pending: boolean;
  onSave: (options: CustomFieldOptionInput[]) => void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<CustomFieldOptionInput[]>(
    field.options.map((o) => ({ id: o.id, label: o.label, color: o.color })),
  );
  const valid =
    options.length > 0 &&
    options.every((o) => o.label.trim() !== '') &&
    new Set(options.map((o) => o.label.trim().toLocaleLowerCase('tr'))).size === options.length;

  return (
    <div className="bg-muted/30 mt-2 flex flex-col gap-2 rounded-md p-3">
      {options.map((option, index) => (
        <div key={option.id ?? `new-${index}`} className="flex items-center gap-2">
          <Input
            className="h-8 flex-1"
            maxLength={CUSTOM_FIELD_LIMITS.optionLabelMax}
            aria-label={t('customFields.optionLabel', { index: index + 1 })}
            disabled={!canEdit}
            value={option.label}
            onChange={(e) =>
              setOptions((list) =>
                list.map((o, i) => (i === index ? { ...o, label: e.target.value } : o)),
              )
            }
          />
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={options.length <= 1}
              aria-label={t('customFields.removeOption', { index: index + 1 })}
              onClick={() => setOptions((list) => list.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={options.length >= CUSTOM_FIELD_LIMITS.optionsPerField}
            onClick={() => setOptions((list) => [...list, { label: '' }])}
          >
            <ListPlus />
            {t('customFields.addOption')}
          </Button>
          <Button size="sm" disabled={!valid || pending} onClick={() => onSave(options)}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

function AddField({ spaceId, count }: { spaceId: string; count: number }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateCustomField();
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('TEXT');
  const [optionText, setOptionText] = useState('');
  const full = count >= CUSTOM_FIELD_LIMITS.fieldsPerSpace;
  const options = optionText
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label !== '')
    .map((label) => ({ label }));
  const ready = name.trim() !== '' && (!hasOptions(type) || options.length > 0) && !full;

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        create.mutate(
          {
            spaceId,
            body: { name: name.trim(), type, ...(hasOptions(type) && { options }) },
          },
          {
            onSuccess: () => {
              setName('');
              setOptionText('');
              setType('TEXT');
            },
            onError: (error) => toast.error(errorMessage(error)),
          },
        );
      }}
    >
      <Input
        className="h-8 min-w-32 flex-1"
        maxLength={CUSTOM_FIELD_LIMITS.nameMax}
        aria-label={t('customFields.newName')}
        placeholder={t('customFields.newName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <NativeSelect
        className="h-8"
        aria-label={t('customFields.newType')}
        value={type}
        onChange={(e) => setType(e.target.value as CustomFieldType)}
      >
        {CUSTOM_FIELD_TYPES.map((value) => (
          <option key={value} value={value}>
            {t(`customFields.types.${value}`)}
          </option>
        ))}
      </NativeSelect>
      {hasOptions(type) && (
        <Input
          className="h-8 min-w-48 flex-1"
          aria-label={t('customFields.newOptions')}
          placeholder={t('customFields.newOptionsHint')}
          value={optionText}
          onChange={(e) => setOptionText(e.target.value)}
        />
      )}
      <Button type="submit" size="sm" variant="secondary" disabled={!ready || create.isPending}>
        <Plus />
        {t('customFields.add')}
      </Button>
      {full && (
        <p className="text-muted-foreground w-full text-xs">
          {t('customFields.limit', { max: CUSTOM_FIELD_LIMITS.fieldsPerSpace })}
        </p>
      )}
    </form>
  );
}

function DeleteField({
  spaceId,
  field,
  onClose,
}: {
  spaceId: string;
  field: CustomField | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const remove = useDeleteCustomField();
  return (
    <ConfirmDialog
      open={field !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('customFields.deleteTitle', { name: field?.name ?? '' })}
      description={t('customFields.deleteHint')}
      confirmLabel={t('customFields.deleteConfirm')}
      pending={remove.isPending}
      onConfirm={() => {
        if (!field) return;
        void remove
          .mutateAsync({ spaceId, fieldId: field.id })
          .then(onClose)
          .catch((error: unknown) => toast.error(errorMessage(error)));
      }}
    />
  );
}
