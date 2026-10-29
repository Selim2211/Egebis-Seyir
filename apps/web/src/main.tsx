import '@/styles/globals.css';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { meQuery } from '@/features/auth/queries';
import { isApiError } from '@/lib/api';
import { initI18n } from '@/lib/i18n';
import { bindThemeToDocument } from '@/lib/ui-store';
import { routeTree } from './routeTree.gen';

bindThemeToDocument();

/**
 * Yeni sürüm yayınlanınca açık sekmedeki eski index.html'in istediği parçalar artık yoktur: sayfa bir kez
 * yenilenir ve güncel sürüm yüklenir. Döngüye girmemek için 60 sn içinde ikinci yenileme yapılmaz.
 */
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'seyir.chunkReloadAt';
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 60_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // depolama kapalıysa yine de bir kez yenile
  }
  event.preventDefault();
  window.location.reload();
});

/** Kullanım sırasında oturum düşerse (iptal, süre dolumu) giriş ekranına dön. */
function onApiError(error: unknown): void {
  if (!isApiError(error, 'UNAUTHENTICATED')) return;
  if (!queryClient.getQueryData(meQuery.queryKey)) return; // zaten oturumsuz akıştayız
  const redirect = encodeURIComponent(router.state.location.href);
  window.location.replace(`/login?redirect=${redirect}`);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // İstemci hataları (4xx) tekrar denenmez; ağ/sunucu hataları iki kez denenir.
      retry: (count, error) =>
        !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root bulunamadı');

// Etkin dil dosyası inmeden çizilmez (çevrilmemiş anahtar görünmesin).
void initI18n().then(() =>
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  ),
);
