import { Languages, Menu, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUiStore, type Language, type Theme } from '@/lib/ui-store';
import { ApiStatus } from './api-status';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function Topbar() {
  const { t } = useTranslation();
  const { theme, language, setTheme, setLanguage, setSidebarOpen } = useUiStore();
  const ThemeIcon = THEME_ICON[theme];

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

      {/* Global arama Faz 1'de; şimdilik yer tutucu. */}
      <button
        type="button"
        disabled
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-muted/50 px-2.5 text-sm text-muted-foreground disabled:cursor-not-allowed"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">{t('topbar.search')}</span>
        <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <ApiStatus />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('topbar.language')}>
              <Languages />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('topbar.language')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={language}
              onValueChange={(v) => setLanguage(v as Language)}
            >
              <DropdownMenuRadioItem value="tr">{t('language.tr')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">{t('language.en')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('topbar.theme')}>
              <ThemeIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('topbar.theme')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
