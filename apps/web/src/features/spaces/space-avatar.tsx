import type { SpaceIcon } from '@scrum/shared';
import { cn } from '@/lib/utils';
import { SPACE_ICON_COMPONENTS } from './space-icons';

/** Space işareti: renkli kare içinde ikon veya adın baş harfi (taslak 1, 7). */
export function SpaceAvatar({
  space,
  size = 20,
  className,
}: {
  space: { name: string; color: string; icon: SpaceIcon | null };
  size?: number;
  className?: string;
}) {
  const Icon = space.icon ? SPACE_ICON_COMPONENTS[space.icon] : null;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        background: space.color,
        fontSize: Math.round(size * 0.5),
      }}
    >
      {Icon ? (
        <Icon style={{ width: size * 0.6, height: size * 0.6 }} />
      ) : (
        space.name.trim().slice(0, 1).toLocaleUpperCase('tr')
      )}
    </span>
  );
}
