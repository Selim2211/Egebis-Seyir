import { HealthResponseSchema } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

/** API ve veritabanı durumu. 503 (degraded) da geçerli bir yanıttır. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiRequest('/health', HealthResponseSchema, { acceptStatuses: [503] }),
    // Sunucu yokken (ör. API yeniden başlıyor) daha sık dener.
    refetchInterval: (query) => (query.state.status === 'error' ? 5_000 : 30_000),
    retry: false,
  });
}
