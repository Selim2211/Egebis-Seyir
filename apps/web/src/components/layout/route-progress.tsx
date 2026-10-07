import { useRouterState } from '@tanstack/react-router';

/** Sayfa geçişi sürerken üstte ince marka renkli ilerleme çubuğu (eski sayfa ekranda kalır). */
export function RouteProgress() {
  const loading = useRouterState({ select: (s) => s.status === 'pending' });
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
      data-loading={loading || undefined}
    >
      <div className="route-progress bg-brand h-full" />
    </div>
  );
}
