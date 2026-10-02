import { ACCEPTANCE_CHECKLIST, type Checklist } from '@scrum/shared';
import { ListChecks, Plus, Trash2, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { type ChecklistOp, useChecklist } from '../queries';

/** Kabul kriterleri ve adlı checklist'ler (brief §5.4, ADR-049). */
export function Checklists({
  itemId,
  checklists,
  canWrite,
}: {
  itemId: string;
  checklists: Checklist[];
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const mutation = useChecklist();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const acceptance = checklists.find((c) => c.kind === 'ACCEPTANCE');
  const named = checklists.filter((c) => c.kind === 'CHECKLIST');
  const run = (op: ChecklistOp) =>
    mutation.mutate({ itemId, ...op }, { onError: (error) => toast.error(errorMessage(error)) });

  const createList = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    run({ op: 'createList', title: title.trim() });
    setTitle('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {(acceptance || canWrite) && (
        <ChecklistBlock
          heading={t('detail.acceptance')}
          hint={t('detail.acceptanceHint')}
          checklist={acceptance}
          addPlaceholder={t('detail.addCriterion')}
          canWrite={canWrite}
          onAdd={(text) =>
            run({ op: 'addEntry', checklistId: acceptance?.id ?? ACCEPTANCE_CHECKLIST, text })
          }
          onToggle={(entryId, done) =>
            run({ op: 'updateEntry', checklistId: acceptance!.id, entryId, body: { done } })
          }
          onDeleteEntry={(entryId) =>
            run({ op: 'deleteEntry', checklistId: acceptance!.id, entryId })
          }
        />
      )}

      {named.map((list) => (
        <ChecklistBlock
          key={list.id}
          heading={list.title}
          checklist={list}
          addPlaceholder={t('detail.addEntry')}
          canWrite={canWrite}
          onAdd={(text) => run({ op: 'addEntry', checklistId: list.id, text })}
          onToggle={(entryId, done) =>
            run({ op: 'updateEntry', checklistId: list.id, entryId, body: { done } })
          }
          onDeleteEntry={(entryId) => run({ op: 'deleteEntry', checklistId: list.id, entryId })}
          onDeleteList={() => run({ op: 'deleteList', checklistId: list.id })}
        />
      ))}

      {canWrite &&
        (adding ? (
          <form onSubmit={createList} className="flex items-center gap-2">
            <input
              autoFocus
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              placeholder={t('detail.checklistName')}
              aria-label={t('detail.checklistName')}
              className="border-input focus-visible:ring-ring/50 h-8 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]"
            />
            <Button type="submit" size="sm" disabled={!title.trim()}>
              {t('common.save')}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => setAdding(false)}
              aria-label={t('common.cancel')}
            >
              <X />
            </Button>
          </form>
        ) : (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>
            <ListChecks />
            {t('detail.addChecklist')}
          </Button>
        ))}
    </div>
  );
}

function ChecklistBlock({
  heading,
  hint,
  checklist,
  addPlaceholder,
  canWrite,
  onAdd,
  onToggle,
  onDeleteEntry,
  onDeleteList,
}: {
  heading: string;
  hint?: string;
  checklist: Checklist | undefined;
  addPlaceholder: string;
  canWrite: boolean;
  onAdd: (text: string) => void;
  onToggle: (entryId: string, done: boolean) => void;
  onDeleteEntry: (entryId: string) => void;
  onDeleteList?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const items = checklist?.items ?? [];
  const done = items.filter((i) => i.done).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText('');
  };

  return (
    <section aria-label={heading}>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold">{heading}</h3>
        {items.length > 0 && (
          <span
            className="text-muted-foreground text-xs"
            aria-label={t('detail.checklistProgress', { done, total: items.length })}
          >
            {done}/{items.length}
          </span>
        )}
        {canWrite && onDeleteList && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7"
            aria-label={t('detail.deleteChecklist', { name: heading })}
            onClick={onDeleteList}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {hint && items.length === 0 && <p className="text-muted-foreground mb-1 text-xs">{hint}</p>}
      {items.length > 0 && (
        <div
          className="bg-muted mb-2 h-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={done}
          aria-label={heading}
        >
          <div
            className="bg-status-done h-full transition-all"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
      )}
      <ul>
        {items.map((entry) => (
          <li
            key={entry.id}
            className="group/entry hover:bg-accent/50 flex items-start gap-2 rounded px-1 py-1"
          >
            <input
              type="checkbox"
              checked={entry.done}
              disabled={!canWrite}
              onChange={(e) => onToggle(entry.id, e.target.checked)}
              className="accent-primary mt-0.5 size-4"
              aria-label={entry.text}
            />
            <span
              className={cn(
                'flex-1 text-sm break-words',
                entry.done && 'text-muted-foreground line-through',
              )}
            >
              {entry.text}
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={() => onDeleteEntry(entry.id)}
                aria-label={t('detail.deleteEntry', { name: entry.text })}
                className="text-muted-foreground hover:text-destructive size-5 shrink-0 opacity-0 group-focus-within/entry:opacity-100 group-hover/entry:opacity-100 max-md:opacity-100"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form onSubmit={submit} className="mt-1 flex items-center gap-2 px-1">
          <Plus className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            className="placeholder:text-muted-foreground h-8 flex-1 bg-transparent text-sm outline-none"
          />
        </form>
      )}
    </section>
  );
}
