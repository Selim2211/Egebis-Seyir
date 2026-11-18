/**
 * Kullanıcı boşta mı (ADR-174)? Ekranı açık bırakılıp uzun süre dokunulmayan sekmeler sunucuyu boşuna
 * sorgulamasın diye periyodik sorgular boştayken seyrekleşir. Gizli sekmede TanStack Query zaten sorgulamaz
 * (`refetchIntervalInBackground` varsayılanı false); bu modül görünür ama kullanılmayan sekmeyi kapsar.
 */
export const IDLE_AFTER_MS = 5 * 60_000;
/** Boştayken en sık sorgu aralığı. */
const IDLE_POLL_MS = 120_000;

let lastActivity = Date.now();
let idle = false;
const wakeListeners = new Set<() => void>();

export function markActive(): void {
  lastActivity = Date.now();
  if (idle) {
    idle = false;
    for (const fn of wakeListeners) fn();
  }
}

if (typeof window !== 'undefined') {
  const opts = { passive: true, capture: true } as const;
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(ev, markActive, opts);
  }
  // Fare hareketi çok sık gelir; saniyede en çok bir kez işlenir.
  let lastMove = 0;
  window.addEventListener(
    'pointermove',
    () => {
      const now = Date.now();
      if (now - lastMove > 1_000) {
        lastMove = now;
        markActive();
      }
    },
    opts,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markActive();
  });
}

export function isIdle(now = Date.now()): boolean {
  if (!idle && now - lastActivity > IDLE_AFTER_MS) idle = true;
  return idle;
}

/** Boştan dönüşte çağrılır (ör. bekleyen sorguları hemen tazelemek için). Aboneliği kaldıran fonksiyon döner. */
export function onWake(fn: () => void): () => void {
  wakeListeners.add(fn);
  return () => wakeListeners.delete(fn);
}

/** `refetchInterval` için: kullanıcı etkinken `ms`, boştayken en az 2 dakika. */
export function pollEvery(ms: number): () => number {
  return () => (isIdle() ? Math.max(ms, IDLE_POLL_MS) : ms);
}

/** Yalnızca testler için. */
export function __setLastActivity(ts: number): void {
  lastActivity = ts;
  idle = false;
}
