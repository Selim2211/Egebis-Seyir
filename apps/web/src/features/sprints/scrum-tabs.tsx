import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'backlog', to: '/spaces/$spaceId/backlog', label: 'backlog.title' },
  { key: 'planning', to: '/spaces/$spaceId/planning', label: 'planning.title' },
  { key: 'board', to: '/spaces/$spaceId/board', label: 'board.title' },
  { key: 'history', to: '/spaces/$spaceId/sprints', label: 'history.title' },
  { key: 'epics', to: '/spaces/$spaceId/epics', label: 'epics.title' },
  { key: 'reports', to: '/spaces/$spaceId/reports', label: 'reports.title' },
] as const;

export type ScrumTab = (typeof TABS)[number]['key'];

/** Scrum sayfaları arasında gezinme: Backlog, Planlama, Sprint panosu, Geçmiş, Raporlar. */
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
          className={cn(
            'flex h-9 items-center border-b-2 px-2.5 text-sm whitespace-nowrap',
            tab.key === current
              ? 'border-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
        >
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
