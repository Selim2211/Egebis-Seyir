import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { meQuery, setupStatusQuery, useMe } from '@/features/auth/queries';
import { isApiError } from '@/lib/api';
import { useUiStore } from '@/lib/ui-store';

/** Giriş gerektiren tüm sayfaların düzeni. Oturum yoksa kurulum veya giriş ekranına yönlendirir. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery);
    } catch (error) {
      if (!isApiError(error, 'UNAUTHENTICATED')) throw error;
      const { needsSetup } = await context.queryClient.fetchQuery(setupStatusQuery);
      if (needsSetup) throw redirect({ to: '/setup' });
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  // Çıkışta önbellek temizlenince yönlendirme tamamlanana kadar kabuk render edilmez.
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  return <SignedInApp />;
}

function SignedInApp() {
  useSyncPreferences();
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Kullanıcı kaydındaki dil ve tema bu cihaza uygulanır (ADR-037). */
function useSyncPreferences() {
  const { user } = useMe();
  const { setLanguage, setTheme } = useUiStore();
  useEffect(() => {
    setLanguage(user.locale);
    setTheme(user.theme);
  }, [user.locale, user.theme, setLanguage, setTheme]);
}
