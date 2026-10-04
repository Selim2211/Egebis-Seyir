import type { CustomField, CustomFieldValue } from '@scrum/shared';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { Input } from '@/components/ui/input';
import { useMembers } from '@/features/workspace/queries';
import { formatShortDate } from '@/lib/format';

/** Alan değerini kısa, okunur gösterim olarak çevirir (tablo hücresi, salt okunur görünüm). */
export function CustomFieldValueText({
  field,
  value,
}: {
  field: CustomField;
  value: CustomFieldValue | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const members = useMembers(field.type === 'PERSON' && value !== undefined).data?.members;
  if (value === undefined) return null;
  const label = (id: string) => field.options.find((o) => o.id === id)?.label ?? '';
  switch (field.type) {
    case 'CHECKBOX':
      return value === true ? t('customFields.yes') : null;
    case 'DATE':
      return typeof value === 'string' ? formatShortDate(value) : null;
    case 'DROPDOWN':
      return label(String(value));
    case 'MULTI_SELECT':
      return Array.isArray(value)
        ? value
            .map(label)
            .filter((l) => l !== '')
            .join(', ')
        : null;
    case 'PERSON':
      return members?.find((m) => m.userId === value)?.name ?? '';
    case 'URL':
      return typeof value === 'string' ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {value.replace(/^https?:\/\//, '')}
        </a>
      ) : null;
    default:
      return String(value);
  }
}

/**
 * Tek bir özel alanın düzenleme girdisi. Metin/sayı/URL alanları odaktan çıkınca ya da Enter ile,
 * diğerleri değişir değişmez kaydeder; `null` değeri temizler.
 */
export function CustomFieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: CustomField;
  value: CustomFieldValue | undefined;
  disabled: boolean;
  onChange: (value: CustomFieldValue | null) => void;
}) {
  const { t } = useTranslation();
  const members = useMembers(field.type === 'PERSON' && !disabled).data?.members ?? [];
  const label = t('customFields.inputFor', { name: field.name });

  switch (field.type) {
    case 'TEXT':
    case 'URL':
    case 'NUMBER':
      return (
        <CommitInput
          type={field.type === 'NUMBER' ? 'number' : field.type === 'URL' ? 'url' : 'text'}
          label={label}
          value={value === undefined ? '' : String(value)}
          disabled={disabled}
          onCommit={(text) => {
            if (text.trim() === '') return onChange(null);
            onChange(field.type === 'NUMBER' ? Number(text) : text);
          }}
        />
      );
    case 'DATE':
      return (
        <Input
          type="date"
          className="h-8"
          aria-label={label}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
    case 'CHECKBOX':
      return (
        <input
          type="checkbox"
          className="mt-1.5 size-4"
          aria-label={label}
          disabled={disabled}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked ? true : null)}
        />
      );
    case 'DROPDOWN':
      return (
        <NativeSelect
          className="h-8 w-full"
          aria-label={label}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('customFields.empty')}</option>
          {field.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      );
    case 'PERSON':
      return (
        <NativeSelect
          className="h-8 w-full"
          aria-label={label}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('customFields.empty')}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
      );
    case 'MULTI_SELECT': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="flex flex-wrap gap-x-3 gap-y-1 pt-1" disabled={disabled}>
          <legend className="sr-only">{label}</legend>
          {field.options.map((o) => (
            <label key={o.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, o.id]
                    : selected.filter((id) => id !== o.id);
                  onChange(next.length === 0 ? null : next);
                }}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      );
    }
  }
}

function CommitInput({
  type,
  label,
  value,
  disabled,
  onCommit,
}: {
  type: 'text' | 'number' | 'url';
  label: string;
  value: string;
  disabled: boolean;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <Input
      type={type}
      className="h-8"
      aria-label={label}
      disabled={disabled}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
