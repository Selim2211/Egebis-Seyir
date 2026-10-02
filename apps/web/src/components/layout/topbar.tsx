import { Menu, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SearchDialog } from '@/features/search/search-dialog';
import { useUiStore } from '@/lib/ui-store';
import { ApiStatus } from './api-status';
import { UserMenu } from './user-menu';

export function Topbar() {
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
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
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
        className="bg-muted/50 text-muted-foreground flex h-8 w-full max-w-md items-center gap-2 rounded-md border px-2.5 text-sm hover:bg-muted"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">{t('topbar.search')}</span>
        <kbd className="bg-background hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ml-auto flex items-center gap-1.5">
        {import.meta.env.DEV && <ApiStatus />}
        <UserMenu />
      </div>
    </header>
  );
}
