import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/lib/ui-store';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function Root() {
  const theme = useUiStore((s) => s.theme);
  return (
    <>
      <Outlet />
      <Toaster position="bottom-right" theme={theme} closeButton richColors />
    </>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-muted-foreground text-5xl font-semibold">404</p>
      <h1 className="text-lg font-medium">{t('notFound.title')}</h1>
      <Button asChild variant="outline">
        <Link to="/">{t('notFound.back')}</Link>
      </Button>
    </div>
  );
}

/** Beklenmeyen hata: kullanıcıya sade mesaj, ayrıntı yalnızca konsolda. */
function RootError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  console.error(error);
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-medium">{t('errors.INTERNAL')}</h1>
      <Button variant="outline" onClick={reset}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
