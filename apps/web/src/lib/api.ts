import { ApiErrorSchema } from '@scrum/shared';
import type { z } from 'zod';

/** API hatası. `code` i18n anahtarıdır: t(`errors.${code}`) (ADR-007). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Bu HTTP durumlarında gövde hata değil, normal yanıt olarak şemaya göre okunur. */
  acceptStatuses?: number[];
}

/** Tek API çağrı noktası: aynı origin (Vite proxy / Caddy), cookie oturumu, yanıt Zod ile doğrulanır. */
export async function apiRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  { method = 'GET', body, acceptStatuses = [] }: RequestOptions = {},
): Promise<z.infer<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK');
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const error = ApiErrorSchema.safeParse(json);
    throw error.success
      ? new ApiRequestError(res.status, error.data.code, error.data.details)
      : new ApiRequestError(res.status, res.status >= 500 ? 'INTERNAL' : 'NETWORK');
  }

  return schema.parse(json);
}
