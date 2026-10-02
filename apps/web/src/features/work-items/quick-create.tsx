import type { WorkItemType } from '@scrum/shared';
import { Plus } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { useErrorMessage } from '@/lib/use-error-message';
import { creatableTypes } from './item-tree';
import { useCreateItem } from './queries';
import { QUICK_CREATE_INPUT_ID } from './quick-create-id';

/**
 * Satır içi hızlı oluşturma (brief §5.4): tip seç, başlığı yaz, Enter. Başlık alanı odakta
 * kalır; arka arkaya öğe eklenebilir.
 */
export function QuickCreate({
  listId,
  scrumEnabled,
  parent,
  onDone,
  autoFocus = false,
}: {
  listId: string;
  scrumEnabled: boolean;
  parent?: { id: string; type: WorkItemType };
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const create = useCreateItem();
  const types = creatableTypes(scrumEnabled, parent?.type ?? null);
  const [type, setType] = useState<WorkItemType>(types.includes('TASK') ? 'TASK' : types[0]!);
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const selected = types.includes(type) ? type : types[0]!;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    create.mutate(
      { listId, body: { type: selected, title: value, parentId: parent?.id ?? null } },
      {
        onSuccess: ({ key }) => {
          setTitle('');
          toast.success(t('items.created', { key }));
          input.current?.focus();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onDone?.()}
      className="flex items-center gap-2 px-3 py-2"
    >
      <Plus className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <NativeSelect
        aria-label={t('items.type')}
        value={selected}
        className="h-8 w-28 shrink-0"
        onChange={(e) => setType(e.target.value as WorkItemType)}
      >
        {types.map((value) => (
          <option key={value} value={value}>
            {t(`workItemType.${value}`)}
          </option>
        ))}
      </NativeSelect>
      <input
        ref={input}
        id={parent ? undefined : QUICK_CREATE_INPUT_ID}
        value={title}
        autoFocus={autoFocus}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t(parent ? 'items.quickCreateChild' : 'items.quickCreate')}
        aria-label={t('items.title')}
        className="placeholder:text-muted-foreground h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      {title.trim() && (
        <button
          type="submit"
          disabled={create.isPending}
          className="text-primary text-xs font-medium whitespace-nowrap hover:underline"
        >
          {t('items.addEnter')}
        </button>
      )}
    </form>
  );
}
