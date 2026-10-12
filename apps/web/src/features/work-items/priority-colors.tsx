import type { Priority } from '@scrum/shared';
import { Palette } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * "Önceliğe göre renklendir" (ADR-107): kart ve satırlara öncelik rengi verir. Kullanıcıya özel bir
 * tercihtir (tarayıcıda saklanır); açıkken Board ve Backlog aynı anda renklenir.
 */

const KEY = 'seyir.priorityColors';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function write(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Depolama kapalıysa tercih yalnızca bu oturumda geçerli olmaz; sessizce devam.
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};

export function usePriorityColors(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return [on, write];
}

const TINT: Record<Priority, string> = {
  URGENT: 'border-l-4 border-l-priority-urgent bg-priority-urgent/10',
  HIGH: 'border-l-4 border-l-priority-high bg-priority-high/10',
  NORMAL: 'border-l-4 border-l-priority-normal bg-priority-normal/5',
  LOW: 'border-l-4 border-l-priority-low bg-priority-low/5',
};

/** Renklendirme açıksa öncelik sınıfları, değilse boş. */
export const priorityTint = (priority: Priority, on: boolean): string => (on ? TINT[priority] : '');

export function PriorityColorToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [on, setOn] = usePriorityColors();
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? 'secondary' : 'ghost'}
      aria-pressed={on}
      onClick={() => setOn(!on)}
      className={cn('gap-1.5', className)}
    >
      <Palette aria-hidden />
      {t('priorityColors.toggle')}
    </Button>
  );
}
