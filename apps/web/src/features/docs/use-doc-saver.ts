import type { RichTextDoc } from '@scrum/shared';
import { useCallback, useRef, useState } from 'react';
import { isApiError } from '@/lib/api';
import { useSaveDocRequest } from './queries';

export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

interface Pending {
  title?: string;
  content?: RichTextDoc | null;
}

/**
 * Sayfa kaydedici (ADR-069): başlık ve içerik değişiklikleri tek sıraya girer, isteklerin
 * hiçbiri aynı anda uçmaz; bileşen sayfa kimliğiyle yeniden kurulur (`key`); her yanıt yeni `revision`ı verir. 409 gelirse kayıt durur ve
 * arayüz "sayfa başka yerde değişti" uyarısı gösterir (üzerine yazılmaz).
 */
export function useDocSaver(docId: string, initialRevision: number) {
  const send = useSaveDocRequest();
  const revision = useRef(initialRevision);
  const pending = useRef<Pending>({});
  const inFlight = useRef(false);
  const stopped = useRef(false);
  const [state, setState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const pump = useCallback(async () => {
    if (inFlight.current || stopped.current) return;
    inFlight.current = true;
    try {
      while (Object.keys(pending.current).length > 0 && !stopped.current) {
        const batch = pending.current;
        pending.current = {};
        setState('saving');
        try {
          const res = await send(docId, { revision: revision.current, ...batch });
          revision.current = res.revision;
          setSavedAt(res.updatedAt);
          setState(Object.keys(pending.current).length > 0 ? 'saving' : 'saved');
        } catch (error) {
          stopped.current = true;
          setState(isApiError(error, 'DOC_CONFLICT') ? 'conflict' : 'error');
        }
      }
    } finally {
      inFlight.current = false;
    }
  }, [docId, send]);

  const save = useCallback(
    (change: Pending) => {
      if (stopped.current) return;
      pending.current = { ...pending.current, ...change };
      void pump();
    },
    [pump],
  );

  return { save, state, savedAt };
}
