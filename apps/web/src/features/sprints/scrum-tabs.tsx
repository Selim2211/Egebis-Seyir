import { Link } from '@tanstack/react-router';
import { Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBugs } from '@/features/bugs/queries';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'backlog', to: '/spaces/$spaceId/backlog', label: 'backlog.title' },
  { key: 'planning', to: '/spaces/$spaceId/planning', label: 'planning.title' },
  { key: 'board', to: '/spaces/$spaceId/board', label: 'board.title' },
  { key: 'history', to: '/spaces/$spaceId/sprints', label: 'history.title' },
  { key: 'epics', to: '/spaces/$spaceId/epics', label: 'epics.title' },
  { key: 'roadmap', to: '/spaces/$spaceId/roadmap', label: 'roadmap.title' },
  { key: 'map', to: '/spaces/$spaceId/map', label: 'projectMap.title' },
  { key: 'reports', to: '/spaces/$spaceId/reports', label: 'reports.title' },
  { key: 'bugs', to: '/spaces/$spaceId/bugs', label: 'bugs.title' },
] as const;

export type ScrumTab = (typeof TABS)[number]['key'];

/** Scrum sayfaları arasında gezinme: Backlog, Planlama, Sprint panosu, Geçmiş, Raporlar, Bugs. */
export function ScrumTabs({ spaceId, current }: { spaceId: string; current: ScrumTab }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('scrumTabs.label')} className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          params={{ spaceId }}
          aria-current={tab.key === current ? 'page' : undefined}
          data-testid={tab.key === 'bugs' ? 'bugs-button' : undefined}
          className={cn(
            'flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-sm whitespace-nowrap',
            tab.key === 'bugs' &&
              (tab.key === current
                ? 'border-red-600 font-semibold text-red-600 dark:border-red-400 dark:text-red-400'
                : 'border-transparent text-red-600/80 hover:text-red-600 dark:text-red-400/80'),
            tab.key !== 'bugs' &&
              (tab.key === current
                ? 'border-primary text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground border-transparent'),
          )}
        >
          {tab.key === 'bugs' && <Bug className="size-4" aria-hidden />}
          {t(tab.label)}
          {tab.key === 'bugs' && <OpenBugs spaceId={spaceId} />}
        </Link>
      ))}
    </nav>
  );
}

/** Bugs sekmesindeki açık (çözülmemiş) Bug sayısı. */
function OpenBugs({ spaceId }: { spaceId: string }) {
  const open = useBugs(spaceId).data?.bugs.filter((b) => b.bugStatus !== 'RESOLVED').length ?? 0;
  if (open === 0) return null;
  return (
    <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white tabular-nums dark:bg-red-500">
      {open}
    </span>
  );
}
