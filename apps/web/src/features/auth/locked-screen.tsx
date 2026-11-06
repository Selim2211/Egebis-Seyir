import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useLogout } from './queries';

/** Kilitli üyenin gördüğü tek ekran: erişimi Super Admin açar. */
export function LockedScreen() {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <Lock className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-xl font-semibold">{t('locked.title')}</h1>
      <p className="text-muted-foreground text-sm">{t('locked.body')}</p>
      <Button variant="outline" onClick={() => logout.mutate()}>
        {t('userMenu.logout')}
      </Button>
    </main>
  );
}
