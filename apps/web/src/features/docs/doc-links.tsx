import type { DocDetail } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Link2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { itemSearchQuery } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { useDocItemLink } from './queries';

/** Sayfaya bağlı görevler ve Epic'ler (brief §5.12, ADR-070). */
export function DocLinks({ doc, canWrite }: { doc: DocDetail; canWrite: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const link = useDocItemLink();
  const [adding, setAdding] = useState(false);

  if (doc.links.length === 0 && !canWrite) return null;

  return (
    <section aria-labelledby="doc-links-title" className="px-2">
      <div className="mb-1 flex items-center gap-2">
        <h2 id="doc-links-title" className="text-sm font-semibold">
          {t('docs.linkedItems')}
        </h2>
        {canWrite && !adding && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Link2 /> {t('docs.linkItem')}
          </Button>
        )}
      </div>
      {doc.links.length > 0 && (
        <ul className="divide-y rounded-md border">
          {doc.links.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <WorkItemTypeIcon type={item.type} />
              <Link
                to="/items/$key"
                params={{ key: item.key }}
                className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
              >
                <span className="text-muted-foreground font-mono text-xs">{item.key}</span>
                <span
                  className={cn(
                    'truncate',
                    item.category === 'DONE' && 'text-muted-foreground line-through',
                  )}
                >
                  {item.title}
                </span>
              </Link>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={t('docs.unlinkItem', { key: item.key })}
                  onClick={() =>
                    link.mutate(
                      { docId: doc.id, itemId: item.id, on: false },
                      { onError: (error) => toast.error(errorMessage(error)) },
                    )
                  }
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <LinkPicker docId={doc.id} onDone={() => setAdding(false)} />}
    </section>
  );
}

function LinkPicker({ docId, onDone }: { docId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const link = useDocItemLink();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  // `exclude` yalnızca sonuçtan çıkarılacak öğe kimliğidir; sayfa kimliği hiçbir öğeyle eşleşmez.
  const { data } = useQuery(itemSearchQuery(workspaceId, query, docId));

  return (
    <div
      className="bg-muted/30 mt-1 flex flex-col gap-2 rounded-md border p-2"
      role="group"
      aria-label={t('docs.linkItem')}
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          placeholder={t('detail.searchItem')}
          aria-label={t('detail.searchItem')}
          className="border-input focus-visible:ring-ring/50 bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onDone}
          aria-label={t('common.cancel')}
        >
          <X />
        </Button>
      </div>
      {query.trim() && data && (
        <ul className="max-h-48 overflow-y-auto">
          {data.items.length === 0 && (
            <li className="text-muted-foreground px-2 py-1 text-sm">{t('detail.noResults')}</li>
          )}
          {data.items.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                disabled={link.isPending}
                onClick={() =>
                  link.mutate(
                    { docId, itemId: result.id, on: true },
                    { onSuccess: onDone, onError: (error) => toast.error(errorMessage(error)) },
                  )
                }
                className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm"
              >
                <WorkItemTypeIcon type={result.type} />
                <span className="text-muted-foreground font-mono text-xs">{result.key}</span>
                <span className="truncate">{result.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
