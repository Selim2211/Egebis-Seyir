import type { DocNodeDto } from '@scrum/shared';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FolderInput,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buildRows } from './tree-rows';

export interface DocTreeActions {
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onMoveTo: (doc: DocNodeDto) => void;
  onReorder: (docId: string, afterId: string | null) => void;
  onDelete: (doc: DocNodeDto) => void;
}

/** Sayfa ağacı: girintili liste; yazma yetkisi varsa satır menüsü ve alt sayfa ekleme. */
export function DocTree({
  docs,
  selectedId,
  canWrite,
  actions,
}: {
  docs: readonly DocNodeDto[];
  selectedId: string | null;
  canWrite: boolean;
  actions: DocTreeActions;
}) {
  const { t } = useTranslation();
  const rows = buildRows(docs);

  return (
    <ul aria-label={t('docs.tree')} className="flex flex-col gap-0.5">
      {rows.map(({ doc, depth, prevSibling, prevPrevSibling, nextSibling }) => (
        <li key={doc.id}>
          <div
            className={cn(
              'group hover:bg-accent/60 flex h-8 items-center gap-1 rounded-md pr-1 text-sm',
              selectedId === doc.id && 'bg-accent font-medium',
            )}
            style={{ paddingLeft: 6 + depth * 14 }}
          >
            <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <button
              type="button"
              onClick={() => actions.onSelect(doc.id)}
              aria-current={selectedId === doc.id ? 'page' : undefined}
              className="min-w-0 flex-1 truncate text-left outline-none focus-visible:underline"
            >
              {doc.title}
            </button>
            {canWrite && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  aria-label={t('docs.addChild', { title: doc.title })}
                  onClick={() => actions.onAddChild(doc.id)}
                >
                  <Plus className="size-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label={t('docs.actions', { title: doc.title })}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      disabled={!prevSibling}
                      onSelect={() => actions.onReorder(doc.id, prevPrevSibling?.id ?? null)}
                    >
                      <ArrowUp /> {t('docs.moveUp')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!nextSibling}
                      onSelect={() => nextSibling && actions.onReorder(doc.id, nextSibling.id)}
                    >
                      <ArrowDown /> {t('docs.moveDown')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.onMoveTo(doc)}>
                      <FolderInput /> {t('docs.moveTo')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(doc)}>
                      <Trash2 /> {t('docs.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
