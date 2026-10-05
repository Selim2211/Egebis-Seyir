import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Egebis Seyir işareti: iki gradyanlı yelken ve dalga (ilerleyiş, sprint ritmi). Vektör çizim,
 * her çözünürlükte keskindir. `public/logo.svg` ile aynı geometri.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Egebis Seyir"
      className={className}
    >
      <defs>
        <linearGradient
          id={`${id}-a`}
          x1="12"
          y1="8"
          x2="30"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient
          id={`${id}-b`}
          x1="34"
          y1="14"
          x2="54"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient
          id={`${id}-c`}
          x1="8"
          y1="50"
          x2="56"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.5" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path d="M29 6C29 6 12 25 10.5 45H29Z" fill={`url(#${id}-a)`} />
      <path d="M34 14C34 14 49 28 53.5 45H34Z" fill={`url(#${id}-b)`} />
      <path
        d="M7 53C14.5 47.5 22 58 31.5 52.5S49 47.5 57 53"
        fill="none"
        stroke={`url(#${id}-c)`}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Logo + "Egebis Seyir" yazısı (kenar çubuğu üst köşesi, giriş ekranları). */
export function BrandMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Logo size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-muted-foreground text-[10px] font-medium tracking-[0.22em]">
          EGEBIS
        </span>
        <span className="mt-0.5 text-[19px] font-bold tracking-tight">Seyir</span>
      </span>
    </span>
  );
}
