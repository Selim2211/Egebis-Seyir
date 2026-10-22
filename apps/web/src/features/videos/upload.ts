import { ApiErrorSchema } from '@scrum/shared';
import { ApiRequestError, apiRequest, csrfToken, NoContent } from '@/lib/api';

/** Ağ hatasında aynı parça en çok bu kadar yeniden denenir (kaldığı yerden devam). */
const RETRIES = 3;

/**
 * Videoyu parça parça yükler (ADR-129): her parça sunucunun aldığı bayttan (`offset`) gönderilir. Sunucu
 * farklı bir ofset bildirirse (409) oradan devam edilir; ağ hatasında parça yeniden denenir. İlerleme
 * bayt düzeyinde bildirilir (XMLHttpRequest upload olayı). Bitince `complete` çağrılır.
 */
export async function uploadVideoFile({
  workspaceId,
  videoId,
  file,
  chunkBytes,
  onProgress,
  signal,
}: {
  workspaceId: string;
  videoId: string;
  file: File;
  chunkBytes: number;
  onProgress: (sent: number) => void;
  signal: AbortSignal;
}): Promise<void> {
  const base = `/workspaces/${workspaceId}/videos/${videoId}`;
  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const chunk = file.slice(offset, Math.min(offset + chunkBytes, file.size));
    try {
      offset = await sendChunk(`/api${base}/content?offset=${offset}`, chunk, signal, (loaded) =>
        onProgress(offset + loaded),
      );
      failures = 0;
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'VIDEO_UPLOAD_OFFSET') {
        const received = (error.details as { received?: number } | undefined)?.received;
        if (typeof received === 'number') {
          offset = received;
          continue;
        }
      }
      if (error instanceof ApiRequestError && error.status === 0 && failures < RETRIES) {
        failures += 1;
        await new Promise((r) => setTimeout(r, 1000 * failures));
        continue;
      }
      throw error;
    }
    onProgress(offset);
  }
  await apiRequest(`${base}/complete`, NoContent, { method: 'POST' });
}

/** Tek parça: yanıt `{ received }` (sunucudaki yeni ofset). */
async function sendChunk(
  url: string,
  chunk: Blob,
  signal: AbortSignal,
  onLoaded: (loaded: number) => void,
): Promise<number> {
  const csrf = await csrfToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.setRequestHeader('x-csrf-token', csrf);
    xhr.upload.onprogress = (e) => onLoaded(e.loaded);
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText) as unknown;
      } catch {
        // Gövdesiz hata.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((json as { received: number }).received);
        return;
      }
      const parsed = ApiErrorSchema.safeParse(json);
      reject(
        parsed.success
          ? new ApiRequestError(xhr.status, parsed.data.code, parsed.data.details)
          : new ApiRequestError(xhr.status, xhr.status >= 500 ? 'INTERNAL' : 'NETWORK'),
      );
    };
    xhr.onerror = () => reject(new ApiRequestError(0, 'NETWORK'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(chunk);
  });
}
