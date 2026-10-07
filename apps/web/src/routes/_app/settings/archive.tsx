import type { ArchiveEntry } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Archive, Folder, Layers, List, RotateCcw, SquareCheckBig, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { useStructureActions } from '@/features/spaces/actions-context';
import { ContainerLink, LoadingState } from '@/features/spaces/container-header';
import { archiveQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings/archive')({
  component: ArchivePage,
});

const TYPE_ICON = { SPACE: Layers, FOLDER: Folder, LIST: List, ITEM: SquareCheckBig } as const;
type Tab = 'archived' | 'trash';

/** Arşiv ve çöp kutusu (brief §10 madde 20, ADR-041). */
function ArchivePage() {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const { data } = useQuery(archiveQuery(id));
  const [tab, setTab] = useState<Tab>('archived');
  const entries = data?.[tab] ?? [];

  return (
    <>
      <PageHeading title={t('archive.title')} subtitle={t('archive.subtitle')} />
      <div role="tablist" aria-label={t('archive.title')} className="mb-4 flex gap-1 border-b">
        {(['archived', 'trash'] as const).map((key) => {
          const Icon = key === 'archived' ? Archive : Trash2;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px flex h-9 items-center gap-1.5 border-b-2 px-3 text-sm',
                tab === key
                  ? 'border-primary text-primary font-semibold'
                  : 'text-muted-foreground border-transparent',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t(`archive.${key}Tab`)}
              {data && (
                <span className="text-muted-foreground text-xs font-normal">
                  {data[key].length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'trash' && data && (
        <p className="text-muted-foreground mb-3 text-xs">
          {t('archive.trashHint', { days: data.retentionDays })}
        </p>
      )}

      {!data ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border px-4 py-10 text-center text-sm">
          {t(tab === 'archived' ? 'archive.emptyArchived' : 'archive.emptyTrash')}
        </p>
      ) : (
        <ul className="bg-card divide-y rounded-lg border" role="tabpanel">
          {entries.map((entry) => (
            <EntryRow key={`${entry.type}:${entry.id}`} entry={entry} tab={tab} />
          ))}
        </ul>
      )}
    </>
  );
}

function EntryRow({ entry, tab }: { entry: ArchiveEntry; tab: Tab }) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  const Icon = TYPE_ICON[entry.type];
  const title =
    // İş öğesi sayfası 1.4'te gelecek; o zamana kadar ad düz metin.
    tab === 'archived' && entry.type !== 'ITEM' ? (
      <ContainerLink
        type={entry.type}
        id={entry.id}
        className="truncate font-medium hover:underline"
      >
        {entry.name}
      </ContainerLink>
    ) : (
      <span className="truncate font-medium">{entry.name}</span>
    );

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        {title}
        <span className="text-muted-foreground truncate text-xs">
          {t(`archive.type.${entry.type}`)}
          {entry.location && ` · ${entry.location}`}
          {' · '}
          {formatDate(entry.at)}
          {entry.by && ` · ${t('archive.deletedBy', { name: entry.by })}`}
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          tab === 'archived'
            ? actions.unarchive(entry.type, entry.id)
            : actions.restore(entry.type, entry.id)
        }
      >
        <RotateCcw />
        {t(tab === 'archived' ? 'structure.unarchive' : 'archive.restore')}
      </Button>
    </li>
  );
}
