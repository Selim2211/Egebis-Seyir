import { Link } from '@tanstack/react-router';
import { Bell, Menu, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUnreadCount } from '@/features/notifications/queries';
import { TimerIndicator } from '@/features/time/timer-indicator';
import { SearchDialog } from '@/features/search/search-dialog';
import { useUiStore } from '@/lib/ui-store';
import { ApiStatus } from './api-status';
import { UserMenu } from './user-menu';

export function Topbar() {
  const unread = useUnreadCount();
  const { t } = useTranslation();
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl/Cmd+K veya (metin girişi dışında) "/" aramayı açar (brief §11).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest(
        'input, textarea, select, [contenteditable="true"]',
      );
      if ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="bg-background/75 supports-[backdrop-filter]:bg-background/60 relative z-10 flex h-13 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={t('nav.openMenu')}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu />
      </Button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-keyshortcuts="Control+K /"
        className="bg-muted/60 text-muted-foreground hover:bg-card hover:border-primary/30 hover:shadow-sm flex h-9 w-full max-w-md items-center gap-2 rounded-lg border px-3 text-sm"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">{t('topbar.search')}</span>
        <kbd className="bg-card text-muted-foreground hidden rounded-md border px-1.5 py-0.5 font-mono text-[10px] shadow-xs sm:inline">
          Ctrl K
        </kbd>
      </button>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ml-auto flex items-center gap-1.5">
        <TimerIndicator />
        {import.meta.env.DEV && <ApiStatus />}
        <Link
          to="/notifications"
          aria-label={
            unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('nav.inbox')
          }
          className="hover:bg-accent relative flex size-9 items-center justify-center rounded-lg"
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-brand ring-background animate-in zoom-in-50 absolute top-0 right-0 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums ring-2"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
