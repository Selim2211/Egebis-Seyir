import { type MouseEvent, type ReactNode, useContext } from 'react';
import { ItemNavContext } from './item-nav-context';

/**
 * Öğeye bağlantı: sade tıklama bağlamdaki açıcıyı çağırır (panelde panel, sayfada sayfa),
 * Ctrl/Cmd/orta tık tarayıcının kendi davranışıyla `/items/KEY` adresini açar.
 */
export function ItemOpenLink({
  itemKey,
  className,
  children,
}: {
  itemKey: string;
  className?: string;
  children: ReactNode;
}) {
  const open = useContext(ItemNavContext);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!open || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    open(itemKey);
  };
  return (
    <a href={`/items/${encodeURIComponent(itemKey)}`} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
