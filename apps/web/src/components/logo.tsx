import { useId } from 'react';

/** Egebis Seyir işareti: iki yelken ve dalga (ilerleyiş, sprint ritmi). `public/logo.svg` ile aynı çizim. */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const gradient = useId();
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
        <linearGradient id={gradient} x1="8" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradient})`} />
      <path d="M31 11v31H15.5z" fill="#fff" />
      <path d="M35 19v23h14.5z" fill="#fff" fillOpacity=".72" />
      <path
        d="M9 50.5q5.75-5.5 11.5 0t11.5 0 11.5 0 11.5 0"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
