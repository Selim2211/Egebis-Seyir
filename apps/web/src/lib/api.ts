import { ApiErrorSchema } from '@scrum/shared';
import { z } from 'zod';

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

export const isApiError = (e: unknown, code?: string): e is ApiRequestError =>
  e instanceof ApiRequestError && (code === undefined || e.code === code);

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Bu HTTP durumlarında gövde hata değil, normal yanıt olarak şemaya göre okunur. */
  acceptStatuses?: number[];
}

const CSRF_COOKIE = 'sm_csrf';

function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

/** Durum değiştiren isteklerde CSRF başlığı gerekir (ADR-038); cookie yoksa önce alınır. */
async function csrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  await fetch('/api/setup/status', { credentials: 'same-origin' });
  return readCookie(CSRF_COOKIE) ?? '';
}

/** Tek API çağrı noktası: aynı origin (Vite proxy / Caddy), cookie oturumu, yanıt Zod ile doğrulanır. */
export async function apiRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  { method = 'GET', body, acceptStatuses = [] }: RequestOptions = {},
): Promise<z.infer<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Dosya yüklemede (FormData) tarayıcı sınırlayıcıyı kendisi ekler.
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await csrfToken();

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK');
  }

  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const error = ApiErrorSchema.safeParse(json);
    throw error.success
      ? new ApiRequestError(res.status, error.data.code, error.data.details)
      : new ApiRequestError(res.status, res.status >= 500 ? 'INTERNAL' : 'NETWORK');
  }

  return schema.parse(json);
}

/** Gövdesiz (204) yanıtlar için şema. */
export const NoContent = z.null();
