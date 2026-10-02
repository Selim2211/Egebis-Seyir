import type { ItemLink, LinkRelation, WorkItemDetail } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { Link2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { ItemOpenLink } from './item-nav';
import { itemSearchQuery, useAddLink, useRemoveLink } from '../queries';

const RELATIONS: LinkRelation[] = [
  'BLOCKS',
  'BLOCKED_BY',
  'RELATES_TO',
  'DUPLICATES',
  'DUPLICATED_BY',
];

/** Bağlantılı öğeler (blocks / blocked by / relates to / duplicates; ADR-050). */
export function Links({ item, canWrite }: { item: WorkItemDetail; canWrite: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const remove = useRemoveLink();
  const [adding, setAdding] = useState(false);

  if (item.links.length === 0 && !canWrite) return null;

  const grouped = RELATIONS.map((relation) => ({
    relation,
    links: item.links.filter((l) => l.relation === relation),
  })).filter((g) => g.links.length > 0);

  return (
    <section aria-labelledby="links-title">
      <div className="mb-1 flex items-center gap-2">
        <h3 id="links-title" className="text-sm font-semibold">
          {t('detail.links')}
        </h3>
        {canWrite && !adding && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Link2 />
            {t('detail.addLink')}
          </Button>
        )}
      </div>

      {grouped.map(({ relation, links }) => (
        <div key={relation} className="mb-2">
          <p className="text-muted-foreground mb-0.5 text-xs font-medium">
            {t(`detail.relation.${relation}`)}
          </p>
          <ul className="divide-y rounded-md border">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                canWrite={canWrite}
                onRemove={() =>
                  remove.mutate(
                    { itemId: item.id, linkId: link.id },
                    { onError: (error) => toast.error(errorMessage(error)) },
                  )
                }
              />
            ))}
          </ul>
        </div>
      ))}
      {item.links.length === 0 && !adding && (
        <p className="text-muted-foreground text-sm">{t('detail.noLinks')}</p>
      )}
      {adding && <AddLink itemId={item.id} onDone={() => setAdding(false)} />}
    </section>
  );
}

function LinkRow({
  link,
  canWrite,
  onRemove,
}: {
  link: ItemLink;
  canWrite: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const done = link.item.category === 'DONE';
  return (
    <li className="group/link flex items-center gap-2 px-3 py-1.5 text-sm">
      <ItemOpenLink
        itemKey={link.item.key}
        className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
      >
        <WorkItemTypeIcon type={link.item.type} />
        <span className="text-muted-foreground font-mono text-xs">{link.item.key}</span>
        <span className={cn('truncate', done && 'text-muted-foreground line-through')}>
          {link.item.title}
        </span>
      </ItemOpenLink>
      {link.relation === 'BLOCKED_BY' && !done && (
        <span className="text-destructive shrink-0 text-xs font-medium">
          {t('detail.openBlocker')}
        </span>
      )}
      {canWrite && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('detail.removeLink', { key: link.item.key })}
          className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-focus-within/link:opacity-100 group-hover/link:opacity-100 max-md:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}
    </li>
  );
}

function AddLink({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const add = useAddLink();
  const [relation, setRelation] = useState<LinkRelation>('BLOCKS');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // Her tuşta değil, yazma durunca arar.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const { data } = useQuery(itemSearchQuery(workspaceId, query, itemId));

  return (
    <div
      className="bg-muted/30 flex flex-col gap-2 rounded-md border p-2"
      role="group"
      aria-label={t('detail.addLink')}
    >
      <div className="flex gap-2">
        <NativeSelect
          aria-label={t('detail.relationLabel')}
          value={relation}
          className="h-8 w-44 shrink-0"
          onChange={(e) => setRelation(e.target.value as LinkRelation)}
        >
          {RELATIONS.map((r) => (
            <option key={r} value={r}>
              {t(`detail.relation.${r}`)}
            </option>
          ))}
        </NativeSelect>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          placeholder={t('detail.searchItem')}
          aria-label={t('detail.searchItem')}
          className="border-input focus-visible:ring-ring/50 h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px]"
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
                disabled={add.isPending}
                onClick={() =>
                  add.mutate(
                    { itemId, targetId: result.id, relation },
                    {
                      onSuccess: onDone,
                      onError: (error) => toast.error(errorMessage(error)),
                    },
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
