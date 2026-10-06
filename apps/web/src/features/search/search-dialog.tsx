import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SpaceAvatar } from '@/features/spaces/space-avatar';
import { WorkItemTypeIcon } from '@/components/work-item/work-item-visuals';
import { globalSearchQuery } from '@/features/work-items/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { cn } from '@/lib/utils';

/**
 * Global arama (brief §5.14, ADR-053): başlık, açıklama ve `MOB-12` kimliği. Ctrl/Cmd+K veya `/` ile açılır;
 * ok tuşlarıyla gezilir, Enter sonucu açar.
 */
export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: workspaceId } = useCurrentWorkspace();
  const listId = useId();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Yazma durunca arar.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const { data, isFetching } = useQuery(globalSearchQuery(workspaceId, query));
  const results = query.trim()
    ? [
        ...(data?.items ?? []).map((item) => ({ kind: 'item' as const, ...item })),
        ...(data?.docs ?? []).map((doc) => ({ kind: 'doc' as const, ...doc })),
      ]
    : [];

  const close = () => {
    onOpenChange(false);
    setText('');
    setQuery('');
    setActive(0);
  };
  const go = (result: (typeof results)[number]) => {
    close();
    if (result.kind === 'doc') {
      void navigate({
        to: '/spaces/$spaceId/docs',
        params: { spaceId: result.space.id },
        search: { doc: result.id },
      });
    } else {
      void navigate({ to: '/items/$key', params: { key: result.key } });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById(`${listId}-input`)?.focus();
        }}
      >
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('search.help')}</DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={`${listId}-list`}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && results.length > 0) {
                e.preventDefault();
                setActive((a) => (a + 1) % results.length);
              } else if (e.key === 'ArrowUp' && results.length > 0) {
                e.preventDefault();
                setActive((a) => (a - 1 + results.length) % results.length);
              } else if (e.key === 'Enter' && results[active]) {
                e.preventDefault();
                go(results[active]);
              }
            }}
            placeholder={t('topbar.search')}
            aria-label={t('search.title')}
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {query.trim() && !isFetching ? t('search.count', { count: results.length }) : ''}
        </div>

        {results.length > 0 ? (
          <ul id={`${listId}-list`} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
            {results.map((item, index) => (
              <li
                key={`${item.kind}-${item.id}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    index === active && 'bg-accent',
                  )}
                >
                  {item.kind === 'doc' ? (
                    <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  ) : (
                    <>
                      <WorkItemTypeIcon type={item.type} />
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {item.key}
                      </span>
                    </>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                    <SpaceAvatar space={{ ...item.space, icon: null }} size={14} />
                    {item.space.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            {query.trim()
              ? isFetching
                ? t('common.loading')
                : t('search.noResults')
              : t('search.hint')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
