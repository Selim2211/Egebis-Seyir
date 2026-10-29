import type { ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Cam tasarım dili (ADR-150): hap şeklinde seçici. `tabs` sekme şeridi (role=tab), `radio` tek seçimli
 * değer (role=radio). Dar ekranda kendi içinde yana kayar; seçilen hap görünür alana gelir.
 */
export function Pills<T extends string>({
  value,
  options,
  onChange,
  label,
  kind = 'radio',
  size = 'md',
  className,
}: {
  value: T | undefined;
  options: ReadonlyArray<{ value: T; label: ReactNode; testId?: string }>;
  onChange: (value: T) => void;
  label: string;
  kind?: 'tabs' | 'radio';
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role={kind === 'tabs' ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cn(
        'glass-pill inline-flex max-w-full [scrollbar-width:none] gap-0.5 overflow-x-auto rounded-full p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={kind === 'tabs' ? 'tab' : 'radio'}
            {...(kind === 'tabs' ? { 'aria-selected': active } : { 'aria-checked': active })}
            data-testid={o.testId}
            onClick={(e) => {
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              onChange(o.value);
            }}
            className={cn(
              'focus-visible:ring-ring/60 shrink-0 cursor-pointer rounded-full font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2',
              size === 'md' ? 'h-9 px-4 text-sm' : 'h-9 px-3 text-xs sm:h-7',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-white/10',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** KPI kartındaki mini çizgi: eksen ve etkileşim yok, yalnızca gidişat. */
export function Sparkline({
  data,
  color,
  className,
}: {
  data: ReadonlyArray<number | null>;
  color: string;
  className?: string;
}) {
  const points = data.map((v, i) => ({ i, v: v ?? 0 }));
  if (points.length < 2) return null;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div className={cn('pointer-events-none h-9 w-full', className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
