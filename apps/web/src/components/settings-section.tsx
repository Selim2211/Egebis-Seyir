import { ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Proje ayarlarında tıklayınca açılan bölüm (yönetici 5. tur, ADR-176). Kapalıyken yalnızca başlık
 * ve kısa açıklama görünür. İçerik ilk açılışta çizilir (kapalı bölümlerin sorguları çalışmaz),
 * sonra yumuşak bir kayma efektiyle açılıp kapanır; kapalıyken odaklanamaz ve ekran okuyucudan gizlenir.
 */
export function SettingsSection({
  title,
  description,
  actions,
  defaultOpen = false,
  testId,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Başlık satırının sağındaki düğmeler; yalnızca bölüm açıkken görünür. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Kapanırken içerik kayarak gizlensin diye bir kez açılan bölüm çizili kalır.
  const [rendered, setRendered] = useState(defaultOpen);
  const id = useId();
  const toggle = () => {
    setRendered(true);
    setOpen((v) => !v);
  };
  return (
    <section
      className={cn(
        'bg-card mb-3 rounded-xl border shadow-xs transition-colors duration-200',
        open && 'border-primary/30',
      )}
      data-testid={testId}
      data-open={open || undefined}
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          <button
            type="button"
            id={`${id}-title`}
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={toggle}
            className="focus-visible:ring-ring hover:text-primary -mx-1 flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition-colors outline-none focus-visible:ring-2"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                'text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
                open && 'text-primary rotate-90',
              )}
            />
            <span className="min-w-0">{title}</span>
          </button>
          {description && (
            <span className="text-muted-foreground mt-0.5 block pl-6 text-xs font-normal">
              {description}
            </span>
          )}
        </h2>
        {open && actions}
      </div>
      {/* grid-rows 0fr → 1fr: yüksekliği ölçmeden akıcı açılma/kapanma. */}
      <div
        id={`${id}-body`}
        role="region"
        aria-labelledby={`${id}-title`}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {rendered && (
            <div
              className={cn(
                'border-t transition-transform duration-300 ease-out motion-reduce:transition-none',
                open ? 'translate-y-0' : '-translate-y-2',
              )}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
