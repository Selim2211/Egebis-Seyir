import { useNavigate } from '@tanstack/react-router';
import { Languages, LogOut, Palette, Settings2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout, useMe, useUpdateProfile } from '@/features/auth/queries';
import { type Language, type Theme, useUiStore } from '@/lib/ui-store';

/** Avatar menüsü: profil, tercihler, dil, tema, çıkış (ADR-037). */
export function UserMenu() {
  const { t } = useTranslation();
  const { user } = useMe();
  const navigate = useNavigate();
  const { theme, language, setTheme, setLanguage } = useUiStore();
  const updateProfile = useUpdateProfile();
  const logout = useLogout();

  const changeLanguage = (locale: Language) => {
    setLanguage(locale);
    updateProfile.mutate({ locale });
  };
  const changeTheme = (value: Theme) => {
    setTheme(value);
    updateProfile.mutate({ theme: value });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t('topbar.accountMenu')}: ${user.name}`}
        className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
      >
        <UserAvatar id={user.id} name={user.name} size={28} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground block truncate text-xs">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: '/settings/profile' })}>
          <UserRound />
          {t('userMenu.profile')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: '/settings/preferences' })}>
          <Settings2 />
          {t('userMenu.preferences')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages />
            {t('userMenu.language')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={language}
              onValueChange={(v) => changeLanguage(v as Language)}
            >
              <DropdownMenuRadioItem value="tr">{t('language.tr')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">{t('language.en')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette />
            {t('userMenu.theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => changeTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()}>
          <LogOut />
          {t('userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
