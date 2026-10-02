import { cn } from '@/lib/utils';

/** Açık zemin + koyu yazı çiftleri (yazı kontrastı ≥ 4.5:1). */
const PALETTE = [
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
  'bg-green-100 text-green-800',
  'bg-sky-100 text-sky-800',
  'bg-pink-100 text-pink-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-slate-100 text-slate-700',
] as const;

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr');
}

/** Kişi avatarı: baş harfler, kişiye sabit renk (id'den türetilir). */
export function UserAvatar({
  id,
  name,
  size = 24,
  className,
}: {
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={name}
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        PALETTE[hash(id) % PALETTE.length],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initials(name)}
    </span>
  );
}
